// Source-preserving PPTX exporter.
//
// The original package is used as the base document. Untouched slide/notes/chart
// parts are copied byte-for-byte. Only edited elements are patched in place,
// deleted shapes are removed, and new slides/elements are generated as native
// DrawingML. Unknown XML, masters, layouts, media and unsupported structures
// therefore survive export.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import JSZip from 'jszip';
import {
  NS, PPTX_LIMITS, parseXml, serializeXml, parseFragment, childElements, childrenNs,
  descendants, firstChild, attr, numAttr, relAttr, resolvePart, relsPath, parseRels,
  readTextPart, validateZip, decodeDataUrl, imageInfo, unitsToEmu, normalizeHex,
  xmlAttr, sha256, sanitizeFilename, stableJson, round, removeNode, fontUnitsToPt100,
  IDENTITY_MATRIX, multiplyMatrix, applyMatrixPoint, groupMatrix, groupRotation,
} from './pptx-xml.js';
import { ProjectError, normalizeProject, assertProjectLimits } from './project.js';
import { buildChartXml } from './pptx-chart.js';
import {
  backgroundXml, chartFrameXml, notesBodyShapeXml, notesPartXml, pictureXml,
  shapeXml, slideSkeletonXml, tableBodyXml, tableFrameXml, textBodyXml, textShapeXml,
} from './pptx-drawing.js';

const SHAPE_NODES = new Set(['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp']);
const CONTENT_TYPE = {
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  notes: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
  chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
};

const REL = {
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  chart: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
  notesSlide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
  notesMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',
  slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
};

function baselineOf(element) {
  const copy = structuredClone(element);
  if (copy.type === 'image' && typeof copy.src === 'string') {
    copy.src = `sha256:${sha256(copy.src)}`;
  }
  return copy;
}

function elementChanged(element, binding) {
  if (!binding || !binding.baseline) return true;
  const expected = baselineOf(element);
  const actual = { ...binding.baseline };
  if (expected.type === 'table' && actual.align === undefined) actual.align = 'left';
  return stableJson(expected) !== stableJson(actual);
}

function relativeTarget(fromPart, toPart) {
  return posix.relative(posix.dirname(fromPart), toPart);
}

function alignCode(element) {
  return element.align === 'center' ? 'ctr' : element.align === 'right' ? 'r' : 'l';
}

function colorHex(value, fallback) {
  return normalizeHex(value) || fallback;
}

class Exporter {
  constructor(zip, project, bindings, warnings) {
    this.zip = zip;
    this.project = project;
    this.bindings = bindings;
    this.warnings = warnings;
    this.cx = bindings.canvas.cx;
    this.presentationPart = bindings.package.presentation;
    this.contentTypesPart = bindings.package.contentTypes || '[Content_Types].xml';
    this.relsCache = new Map();
    this.newParts = new Set();
    this.mediaByHash = new Map();
    this.structureDirty = false;
    this.presentationDirty = false;
    this.contentTypesDirty = false;
    this.currentSlideIndex = 0;
    this.warned = new Set();
  }

  warn(message) {
    if (!message || this.warned.has(message) || this.warnings.length >= 100) return;
    this.warned.add(message);
    this.warnings.push(message);
  }

  slideWarn(message) {
    this.warn(`第 ${this.currentSlideIndex + 1} 页：${message}`);
  }

  async load() {
    const presentationText = await readTextPart(this.zip, this.presentationPart);
    if (!presentationText) throw new ProjectError('导入源缺少 presentation.xml，无法导出', 'invalid_pptx');
    this.presentationDoc = parseXml(presentationText, 'presentation.xml');
    const contentTypesText = await readTextPart(this.zip, this.contentTypesPart);
    if (!contentTypesText) throw new ProjectError('导入源缺少 [Content_Types].xml，无法导出', 'invalid_pptx');
    this.contentTypesDoc = parseXml(contentTypesText, '[Content_Types].xml');

    const presRels = await this.getRels(this.presentationPart);
    this.slideRelByPart = new Map();
    const sldIdLst = firstChild(this.presentationDoc.documentElement, NS.P, 'sldIdLst');
    this.sldIdByRId = new Map();
    if (sldIdLst) {
      for (const node of childrenNs(sldIdLst, NS.P, 'sldId')) {
        this.sldIdByRId.set(relAttr(node), attr(node, 'id', ''));
      }
    }
    for (const rel of presRels.map.values()) {
      if (rel.type.endsWith('/slide') && rel.targetPart) {
        this.slideRelByPart.set(rel.targetPart, rel);
      }
    }
  }

  async getRels(part) {
    if (this.relsCache.has(part)) return this.relsCache.get(part);
    const path = relsPath(part);
    const text = await readTextPart(this.zip, path);
    const doc = text ? parseXml(text, `关系文件 ${path}`) : parseXml(`<Relationships xmlns="${NS.PR}"/>`);
    const entry = { path, doc, map: parseRels(text, part), dirty: false, exists: !!text };
    this.relsCache.set(part, entry);
    return entry;
  }

  async addRel(part, { type, target, mode }) {
    const rels = await this.getRels(part);
    let index = 1;
    while (rels.map.has(`rId${index}`)) index += 1;
    const id = `rId${index}`;
    const node = rels.doc.createElementNS(NS.PR, 'Relationship');
    node.setAttribute('Id', id);
    node.setAttribute('Type', type);
    node.setAttribute('Target', target);
    if (mode) node.setAttribute('TargetMode', mode);
    rels.doc.documentElement.appendChild(node);
    let targetPart = null;
    if (mode !== 'External') {
      try {
        targetPart = resolvePart(part, target);
      } catch {
        targetPart = null;
      }
    }
    const rel = { id, type, target, mode: mode || 'Internal', targetPart };
    rels.map.set(id, rel);
    rels.dirty = true;
    return rel;
  }

  async removeRel(part, id) {
    const rels = await this.getRels(part);
    for (const node of descendants(rels.doc.documentElement, NS.PR, 'Relationship')) {
      if (attr(node, 'Id', '') === id) {
        removeNode(node);
        rels.map.delete(id);
        rels.dirty = true;
        return;
      }
    }
  }

  async ensureDefault(extension, mime) {
    const ext = String(extension || '').toLowerCase();
    if (!ext) return;
    for (const node of childrenNs(this.contentTypesDoc.documentElement, NS.CT, 'Default')) {
      if (attr(node, 'Extension', '').toLowerCase() === ext) return;
    }
    const node = this.contentTypesDoc.createElementNS(NS.CT, 'Default');
    node.setAttribute('Extension', ext);
    node.setAttribute('ContentType', mime);
    this.contentTypesDoc.documentElement.appendChild(node);
    this.contentTypesDirty = true;
  }

  ensureOverride(part, contentType) {
    const partName = `/${part.replace(/^\/+/, '')}`;
    for (const node of childrenNs(this.contentTypesDoc.documentElement, NS.CT, 'Override')) {
      if (attr(node, 'PartName', '') === partName) {
        if (attr(node, 'ContentType', '') !== contentType) {
          node.setAttribute('ContentType', contentType);
          this.contentTypesDirty = true;
        }
        return;
      }
    }
    const node = this.contentTypesDoc.createElementNS(NS.CT, 'Override');
    node.setAttribute('PartName', partName);
    node.setAttribute('ContentType', contentType);
    this.contentTypesDoc.documentElement.appendChild(node);
    this.contentTypesDirty = true;
  }

  removeOverride(part) {
    const partName = `/${part.replace(/^\/+/, '')}`;
    for (const node of childrenNs(this.contentTypesDoc.documentElement, NS.CT, 'Override')) {
      if (attr(node, 'PartName', '') === partName) {
        removeNode(node);
        this.contentTypesDirty = true;
        return;
      }
    }
  }

  allocatePart(prefix, extension) {
    const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)\\.${extension}$`);
    let max = 0;
    const consider = name => {
      const match = name.match(pattern);
      if (match) max = Math.max(max, Number.parseInt(match[1], 10));
    };
    for (const name of Object.keys(this.zip.files)) consider(name);
    for (const name of this.newParts) consider(name);
    const part = `${prefix}${max + 1}.${extension}`;
    this.newParts.add(part);
    return part;
  }

  async ensureSlideRel(part) {
    let rel = this.slideRelByPart.get(part);
    if (rel) return rel;
    rel = await this.addRel(this.presentationPart, {
      type: REL.slide,
      target: relativeTarget(this.presentationPart, part),
    });
    this.slideRelByPart.set(part, rel);
    this.structureDirty = true;
    return rel;
  }

  async run() {
    await this.load();
    const projectIds = this.project.slides.map(slide => slide.id);
    let mapped = new Map();
    for (const id of projectIds) {
      if (this.bindings.slides[id]) mapped.set(id, this.bindings.slides[id]);
    }
    if (!mapped.size && projectIds.length === (this.bindings.order || []).length) {
      // A cloned project (save-as / conflict copy) may have regenerated slide
      // ids; the import order is still authoritative when the counts match.
      const order = this.bindings.order || [];
      for (let index = 0; index < projectIds.length; index += 1) {
        const binding = this.bindings.slides[order[index]];
        if (binding) mapped.set(projectIds[index], binding);
      }
    }
    const claimed = new Set([...mapped.values()]);

    const dockets = [];
    for (let index = 0; index < this.project.slides.length; index += 1) {
      const slide = this.project.slides[index];
      this.currentSlideIndex = index;
      const binding = mapped.get(slide.id);
      if (binding) {
        if (!this.zip.file(binding.part)) {
          throw new ProjectError(`导入源缺少幻灯片部件 ${binding.part}，无法导出`, 'source_changed');
        }
        await this.patchSlide(slide, binding);
        const rel = await this.ensureSlideRel(binding.part);
        dockets.push({ part: binding.part, rId: rel.id });
      } else {
        dockets.push(await this.createSlide(slide, index));
      }
    }

    for (const binding of Object.values(this.bindings.slides || {})) {
      if (claimed.has(binding)) continue;
      this.currentSlideIndex = 0;
      await this.removeSlide(binding);
    }

    if (this.structureDirty || !this.sameSlideOrder(dockets)) {
      this.rebuildSlideList(dockets);
    }
    await this.save();
  }

  sameSlideOrder(dockets) {
    const list = firstChild(this.presentationDoc.documentElement, NS.P, 'sldIdLst');
    if (!list) return dockets.length === 0;
    const current = childrenNs(list, NS.P, 'sldId').map(node => relAttr(node));
    const desired = dockets.map(docket => docket.rId);
    return current.length === desired.length && current.every((id, index) => id === desired[index]);
  }

  rebuildSlideList(dockets) {
    const root = this.presentationDoc.documentElement;
    let list = firstChild(root, NS.P, 'sldIdLst');
    if (!list) {
      list = this.presentationDoc.createElementNS(NS.P, 'p:sldIdLst');
      const size = firstChild(root, NS.P, 'sldSz');
      if (size) root.insertBefore(list, size);
      else root.appendChild(list);
    }
    for (const node of childrenNs(list, NS.P, 'sldId')) removeNode(node);
    let maxId = 255;
    for (const id of this.sldIdByRId.values()) {
      const numeric = Number.parseInt(id, 10);
      if (Number.isInteger(numeric) && numeric > maxId) maxId = numeric;
    }
    for (const docket of dockets) {
      const existing = this.sldIdByRId.get(docket.rId);
      const numeric = Number.parseInt(existing, 10);
      let id;
      if (Number.isInteger(numeric) && numeric > 0) id = numeric;
      else {
        maxId += 1;
        id = maxId;
      }
      const node = this.presentationDoc.createElementNS(NS.P, 'p:sldId');
      node.setAttribute('id', String(id));
      node.setAttributeNS(NS.R, 'r:id', docket.rId);
      list.appendChild(node);
    }
    this.presentationDirty = true;
  }

  async removeSlide(binding) {
    const rel = this.slideRelByPart.get(binding.part);
    if (rel) {
      await this.removeRel(this.presentationPart, rel.id);
      this.slideRelByPart.delete(binding.part);
    }
    this.zip.remove(binding.part);
    this.zip.remove(relsPath(binding.part));
    this.removeOverride(binding.part);
    if (binding.notesPart) {
      this.zip.remove(binding.notesPart);
      this.zip.remove(relsPath(binding.notesPart));
      this.removeOverride(binding.notesPart);
    }
    this.structureDirty = true;
  }

  async patchSlide(slide, binding) {
    this.currentSlideIndex = this.project.slides.indexOf(slide);
    const text = await readTextPart(this.zip, binding.part);
    if (!text) throw new ProjectError(`无法读取幻灯片部件 ${binding.part}`, 'source_changed');
    const doc = parseXml(text, `幻灯片 ${binding.part}`);
    const spTree = descendants(doc.documentElement, NS.P, 'spTree')[0];
    if (!spTree) throw new ProjectError(`幻灯片 ${binding.part} 缺少 spTree`, 'invalid_pptx');
    const index = indexShapes(spTree);
    let changed = false;

    const projectElements = new Map(slide.elements.map(element => [element.id, element]));
    for (const [id] of Object.entries(binding.elements || {})) {
      if (projectElements.has(id)) continue;
      const item = findItem(index, binding.elements[id]);
      if (item) {
        removeNode(item.node);
        changed = true;
      }
    }

    const partContext = { part: binding.part, nextShapeId: maxShapeId(doc) + 1, spTree, doc };
    for (const element of slide.elements) {
      const elementBinding = binding.elements?.[element.id];
      if (!elementBinding) {
        if (await this.appendElement(spTree, doc, element, partContext)) changed = true;
        continue;
      }
      if (!elementChanged(element, elementBinding)) continue;
      const item = findItem(index, elementBinding);
      if (!item) {
        this.slideWarn(`源文件中找不到元素 ${element.id}，已作为新元素写入`);
        if (await this.appendElement(spTree, doc, element, partContext)) changed = true;
        continue;
      }
      const replaced = await this.patchElement(doc, item, element, elementBinding, partContext);
      if (replaced) {
        const refreshed = indexShapes(spTree);
        index.byId = refreshed.byId;
        index.byPath = refreshed.byPath;
        index.items = refreshed.items;
      }
      changed = true;
    }

    const background = slide.background || null;
    if (background !== (binding.background || null)) {
      patchBackground(doc, background);
      changed = true;
    }
    if ((slide.note || '') !== (binding.noteBaseline || '')) {
      // Notes live in their own part; changing them must not rewrite slide XML.
      await this.syncNotes(slide, binding);
    }
    if (changed) this.zip.file(binding.part, serializeXml(doc));
  }

  async patchElement(doc, item, element, binding, context) {
    const node = item.node;
    const kind = node.localName;
    if (element.type === 'image') {
      if (kind !== 'pic') return this.replaceElement(doc, item, element, binding, context);
      await this.patchPicture(doc, node, element, binding, context);
      return false;
    }
    if (element.type === 'table' || element.type === 'chart') {
      if (kind !== 'graphicFrame') return this.replaceElement(doc, item, element, binding, context);
      await this.patchGraphicFrame(doc, node, element, binding, context);
      return false;
    }
    if (kind !== 'sp' && kind !== 'cxnSp') return this.replaceElement(doc, item, element, binding, context);
    if (kind === 'cxnSp' && element.type === 'text') return this.replaceElement(doc, item, element, binding, context);
    this.patchShape(doc, node, element, binding, context);
    return false;
  }

  async replaceElement(doc, item, element, binding, context) {
    const shapeId = Number.parseInt(binding.shapeId, 10) > 0 ? Number.parseInt(binding.shapeId, 10) : context.nextShapeId;
    const nodes = await this.buildElementNodes(doc, element, { ...context, nextShapeId: shapeId });
    if (!nodes.length) return false;
    const parent = item.node.parentNode;
    for (const node of nodes) parent.insertBefore(node, item.node);
    removeNode(item.node);
    return true;
  }

  async buildElementNodes(doc, element, context) {
    const id = context.nextShapeId;
    context.nextShapeId += 1;
    const fontFace = this.project.theme?.fontName || 'Inter';
    if (element.type === 'text') {
      return parseNodes(doc, textShapeXml(element, { id, cx: this.cx, fontFace }));
    }
    if (element.type === 'shape') {
      return parseNodes(doc, shapeXml(element, { id, cx: this.cx, fontFace }));
    }
    if (element.type === 'image') {
      const bytes = await this.readImageSource(element.src);
      const media = await this.addMedia(bytes);
      const rel = await this.addRel(context.part, {
        type: REL.image,
        target: relativeTarget(context.part, media.part),
      });
      const layout = imageLayout(element, media.info, this.cx);
      return parseNodes(doc, pictureXml(element, {
        id, cx: this.cx, relId: rel.id, box: layout.box, srcRect: layout.srcRect,
      }));
    }
    if (element.type === 'table') {
      if (!Array.isArray(element.rows) || !element.rows.length) {
        this.slideWarn(`表格元素 ${element.id} 没有行，未写入`);
        return [];
      }
      return parseNodes(doc, tableFrameXml(element, { id, cx: this.cx, fontFace }));
    }
    if (element.type === 'chart') {
      const chartXml = buildChartXml({
        chartType: element.chartType,
        data: element.data,
        colors: this.project.theme?.themeColors,
      });
      const part = this.allocatePart('ppt/charts/chart', 'xml');
      this.zip.file(part, chartXml);
      this.ensureOverride(part, CONTENT_TYPE.chart);
      const rel = await this.addRel(context.part, {
        type: REL.chart,
        target: relativeTarget(context.part, part),
      });
      return parseNodes(doc, chartFrameXml(element, { id, cx: this.cx, relId: rel.id }));
    }
    this.slideWarn(`未知元素类型 ${String(element.type)}，未写入`);
    return [];
  }

  async appendElement(spTree, doc, element, context) {
    try {
      const nodes = await this.buildElementNodes(doc, element, context);
      insertBeforeExtLst(spTree, nodes);
      return nodes.length > 0;
    } catch (error) {
      if (error instanceof ProjectError && error.code === 'unsafe_xml') throw error;
      this.slideWarn(`元素 ${element.id} 写入失败：${error.message}`);
      return false;
    }
  }

  async readImageSource(src) {
    const decoded = decodeDataUrl(src);
    if (decoded) return decoded.buffer;
    if (/^https?:\/\//i.test(String(src))) {
      throw new ProjectError('外部图片需要联网读取，导出不会访问网络', 'unsupported_source');
    }
    if (/^(?:[A-Za-z]:[\\/]|\/)/.test(String(src))) {
      const buffer = await readFile(src);
      if (buffer.length > 64 * 1024 * 1024) throw new ProjectError('图片文件超过 64 MiB', 'limit_exceeded');
      return buffer;
    }
    throw new ProjectError('图片源必须是 data URL 或本地绝对路径', 'unsupported_source');
  }

  async addMedia(buffer) {
    const info = imageInfo(buffer);
    if (info.mime === 'application/octet-stream' || !info.ext) {
      throw new ProjectError('无法识别的图片格式', 'unsupported_source');
    }
    const hash = sha256(buffer);
    if (this.mediaByHash.has(hash)) {
      const existing = this.mediaByHash.get(hash);
      return { part: existing.part, info: existing.info };
    }
    const part = this.allocatePart('ppt/media/image', info.ext);
    this.zip.file(part, buffer);
    await this.ensureDefault(info.ext, info.mime);
    this.mediaByHash.set(hash, { part, info });
    return { part, info };
  }

  patchShape(doc, node, element, binding, context) {
    const base = binding.baseline || {};
    const spPr = ensureSpPr(doc, node);
    this.patchXfrm(node, element);
    const isLine = element.type === 'shape' && element.shape === 'line';
    const prstGeom = firstChild(spPr, NS.A, 'prstGeom');
    const shapeChanged = (element.shape || '') !== (base.shape || '');
    const radiusChanged = (Number(element.radius) || 0) !== (Number(base.radius) || 0);
    if (element.type === 'shape' && prstGeom) {
      const prst = ['rect', 'roundRect', 'ellipse', 'line'].includes(element.shape) ? element.shape : 'rect';
      prstGeom.setAttribute('prst', prst);
      if (prst === 'roundRect' && (shapeChanged || radiusChanged)) setRoundRectRadius(doc, prstGeom, element);
    } else if (element.type === 'text' && prstGeom) {
      prstGeom.setAttribute('prst', 'rect');
    }
    const fillChanged = (element.fill || null) !== (base.fill || null) || element.type !== base.type;
    if (fillChanged) {
      if (element.type === 'text') setSpPrFill(doc, spPr, element.fill || null);
      else if (isLine) setSpPrFill(doc, spPr, null);
      else setSpPrFill(doc, spPr, element.fill || '#f3f4f6');
    }
    const strokeChanged = (element.stroke || '') !== (base.stroke || '')
      || (element.strokeWidth ?? 0) !== (base.strokeWidth ?? 0)
      || element.type !== base.type
      || (element.shape || '') !== (base.shape || '');
    if (strokeChanged) {
      const width = Number(element.strokeWidth) || 0;
      const color = width <= 0 ? null : (element.stroke || (isLine ? '#1f2430' : null));
      setSpPrStroke(doc, spPr, color, width);
    }
    const contentChanged = (element.text ?? '') !== (base.text ?? '');
    const formattingChanged = (element.fontSize ?? null) !== (base.fontSize ?? null)
      || (element.color ?? null) !== (base.color ?? null)
      || (element.bold ?? false) !== (base.bold ?? false)
      || (element.align ?? null) !== (base.align ?? null)
      || (element.lineHeight ?? null) !== (base.lineHeight ?? null);
    let txBody = firstChild(node, NS.P, 'txBody');
    if (contentChanged) {
      if (!txBody) {
        const anchor = element.type === 'shape' ? 'ctr' : 't';
        const [created] = parseNodes(doc, textBodyXml(element, {
          fontFace: this.project.theme?.fontName || 'Inter',
          anchor,
          cx: this.cx,
          align: element.type === 'shape' ? (element.align || 'center') : element.align,
        }));
        node.appendChild(created);
        txBody = created;
      } else {
        rewriteTextBody(doc, txBody, element, base, this.project.theme?.fontName || 'Inter', this.cx);
      }
    } else if (txBody && formattingChanged) {
      applyTextFormatting(doc, txBody, element, base, this.project.theme?.fontName || 'Inter', this.cx);
    }
    // Keep source extras (locks, effects) intact; only known properties change.
  }

  async patchPicture(doc, pic, element, binding, context) {
    const base = binding.baseline || {};
    const blip = descendants(pic, NS.A, 'blip')[0];
    if (!blip) throw new ProjectError('图片元素缺少 blip', 'invalid_pptx');
    const baseHash = typeof base.src === 'string' && base.src.startsWith('sha256:') ? base.src : null;
    const currentHash = `sha256:${sha256(element.src)}`;
    const srcChanged = !baseHash || baseHash !== currentHash;
    const fitChanged = element.fit !== base.fit;
    const layoutChanged = srcChanged || fitChanged || element.w !== base.w || element.h !== base.h;
    let info = null;
    if (srcChanged) {
      const bytes = await this.readImageSource(element.src);
      const media = await this.addMedia(bytes);
      info = media.info;
      const rel = await this.addRel(context.part, {
        type: REL.image,
        target: relativeTarget(context.part, media.part),
      });
      blip.setAttributeNS(NS.R, 'r:embed', rel.id);
      blip.removeAttributeNS(NS.R, 'link');
    }
    if (layoutChanged) {
      if (!info) {
        const relId = relAttr(blip, 'embed');
        const rels = await this.getRels(context.part);
        const rel = relId ? rels.map.get(relId) : null;
        const entry = rel?.targetPart ? this.zip.file(rel.targetPart) : null;
        if (entry) {
          const raw = await entry.async('nodebuffer').catch(() => null);
          if (raw) info = imageInfo(raw);
        }
      }
      const layout = imageLayout(element, info, this.cx);
      this.patchXfrm(pic, element, layout.box);
      setSrcRect(doc, pic, layout.srcRect);
    } else {
      this.patchXfrm(pic, element);
    }
  }

  async patchGraphicFrame(doc, frame, element, binding, context) {
    const base = binding.baseline || {};
    if (element.type === 'table') {
      if (!descendants(frame, NS.A, 'tbl').length) {
        await this.replaceInPlace(doc, frame, element, binding, context);
        return;
      }
      this.patchXfrm(frame, element);
      const rowsChanged = stableJson(element.rows || []) !== stableJson(base.rows || [])
        || element.fontSize !== base.fontSize
        || element.color !== base.color
        || element.headerFill !== base.headerFill;
      if (rowsChanged) {
        const tbl = descendants(frame, NS.A, 'tbl')[0];
        const [replacement] = parseNodes(doc, tableBodyXml(element, {
          cx: this.cx,
          fontFace: this.project.theme?.fontName || 'Inter',
        }));
        tbl.parentNode.replaceChild(replacement, tbl);
      } else if ((element.align || 'left') !== (base.align || 'left')) {
        patchTableAlignment(doc, descendants(frame, NS.A, 'tbl')[0], element);
      }
      return;
    }
    if (element.type === 'chart') {
      if (!descendants(frame, NS.C, 'chart').length) {
        await this.replaceInPlace(doc, frame, element, binding, context);
        return;
      }
      this.patchXfrm(frame, element);
      const dataChanged = element.chartType !== base.chartType
        || stableJson(element.data || {}) !== stableJson(base.data || {});
      if (!dataChanged) return;
      const chartXml = buildChartXml({
        chartType: element.chartType,
        data: element.data,
        colors: binding.chartColors?.length ? binding.chartColors : this.project.theme?.themeColors,
      });
      if (binding.chartPart && this.zip.file(binding.chartPart)) {
        this.zip.file(binding.chartPart, chartXml);
      } else {
        const chartNode = descendants(frame, NS.C, 'chart')[0];
        const part = this.allocatePart('ppt/charts/chart', 'xml');
        this.zip.file(part, chartXml);
        this.ensureOverride(part, CONTENT_TYPE.chart);
        const rel = await this.addRel(context.part, {
          type: REL.chart,
          target: relativeTarget(context.part, part),
        });
        chartNode.setAttributeNS(NS.R, 'r:id', rel.id);
      }
    }
  }

  async replaceInPlace(doc, node, element, binding, context) {
    const shapeId = Number.parseInt(binding.shapeId, 10) > 0 ? Number.parseInt(binding.shapeId, 10) : context.nextShapeId;
    const nodes = await this.buildElementNodes(doc, element, { ...context, nextShapeId: shapeId });
    if (!nodes.length) return;
    const parent = node.parentNode;
    for (const replacement of nodes) parent.insertBefore(replacement, node);
    removeNode(node);
  }

  patchXfrm(node, element, override) {
    const rect = override || {
      x: unitsToEmu(element.x, this.cx),
      y: unitsToEmu(element.y, this.cx),
      w: unitsToEmu(element.w, this.cx),
      h: unitsToEmu(element.h, this.cx),
    };
    const doc = node.ownerDocument;
    let xfrm;
    if (node.localName === 'graphicFrame') {
      xfrm = firstChild(node, NS.P, 'xfrm');
      if (!xfrm) {
        xfrm = doc.createElementNS(NS.P, 'p:xfrm');
        const anchor = firstChild(node, NS.P, 'nvGraphicFramePr');
        if (anchor && anchor.nextSibling) node.insertBefore(xfrm, anchor.nextSibling);
        else node.appendChild(xfrm);
      }
    } else {
      const spPr = ensureSpPr(doc, node);
      xfrm = firstChild(spPr, NS.A, 'xfrm');
      if (!xfrm) {
        xfrm = doc.createElementNS(NS.A, 'a:xfrm');
        spPr.insertBefore(xfrm, spPr.firstChild);
      }
    }
    const groups = groupAncestors(node);
    let matrix = IDENTITY_MATRIX;
    let rotation = 0;
    for (const group of groups) {
      matrix = multiplyMatrix(matrix, groupMatrix(group));
      rotation += groupRotation(group);
    }
    let target = { ...rect };
    let localRotation = element.rotate || 0;
    if (groups.length) {
      const center = applyMatrixPoint(invertMatrix(matrix), rect.x + rect.w / 2, rect.y + rect.h / 2);
      const sx = Math.hypot(matrix.a, matrix.b) || 1;
      const sy = Math.hypot(matrix.c, matrix.d) || 1;
      const width = rect.w / sx;
      const height = rect.h / sy;
      target = { x: center.x - width / 2, y: center.y - height / 2, w: width, h: height };
      localRotation -= rotation;
    }
    let off = firstChild(xfrm, NS.A, 'off');
    if (!off) {
      off = xfrm.ownerDocument.createElementNS(NS.A, 'a:off');
      xfrm.insertBefore(off, xfrm.firstChild);
    }
    off.setAttribute('x', String(Math.round(target.x)));
    off.setAttribute('y', String(Math.round(target.y)));
    let ext = firstChild(xfrm, NS.A, 'ext');
    if (!ext) {
      ext = xfrm.ownerDocument.createElementNS(NS.A, 'a:ext');
      xfrm.appendChild(ext);
    }
    ext.setAttribute('cx', String(Math.max(1, Math.round(target.w))));
    ext.setAttribute('cy', String(Math.max(1, Math.round(target.h))));
    if (Math.abs(localRotation) > 0.0001) {
      xfrm.setAttribute('rot', String(Math.round(localRotation * 60000)));
    } else {
      xfrm.removeAttribute('rot');
    }
  }

  async createSlide(slide, index) {
    this.currentSlideIndex = index;
    const part = this.allocatePart('ppt/slides/slide', 'xml');
    const association = slide.backdropId ? this.bindings.backdrops?.[slide.backdropId] : null;
    let layout = association?.layoutPart || this.bindings.package.defaultLayout;
    if (layout && !this.zip.file(layout)) {
      this.slideWarn(`继承版式 ${layout} 不在源包中，已回退默认版式`);
      layout = this.bindings.package.defaultLayout;
    }
    const doc = parseXml(slideSkeletonXml({
      background: slide.background || null,
      showMasterSp: association?.includeMaster === false ? false : true,
    }));
    const spTree = descendants(doc.documentElement, NS.P, 'spTree')[0];
    const context = { part, nextShapeId: 2, spTree, doc };
    if (layout && this.zip.file(layout)) {
      await this.addRel(part, {
        type: REL.slideLayout,
        target: relativeTarget(part, layout),
      });
    } else {
      this.slideWarn('源文件没有可复用的版式，新页未关联版式');
    }
    for (const element of slide.elements) {
      await this.appendElement(spTree, doc, element, context);
    }
    if (slide.note) await this.createNotesPart(part, slide.note);
    this.zip.file(part, serializeXml(doc));
    this.ensureOverride(part, CONTENT_TYPE.slide);
    const rel = await this.ensureSlideRel(part);
    return { part, rId: rel.id };
  }

  async createNotesPart(slidePart, text) {
    const part = this.allocatePart('ppt/notesSlides/notesSlide', 'xml');
    this.zip.file(part, notesPartXml(text));
    this.ensureOverride(part, CONTENT_TYPE.notes);
    const notesMaster = this.bindings.package.notesMaster;
    if (notesMaster && this.zip.file(notesMaster)) {
      await this.addRel(part, {
        type: REL.notesMaster,
        target: relativeTarget(part, notesMaster),
      });
    }
    await this.addRel(slidePart, {
      type: REL.notesSlide,
      target: relativeTarget(slidePart, part),
    });
    return part;
  }

  async syncNotes(slide, binding) {
    if (binding.notesPart && this.zip.file(binding.notesPart)) {
      const text = await readTextPart(this.zip, binding.notesPart);
      const doc = parseXml(text, '备注页');
      const spTree = descendants(doc.documentElement, NS.P, 'spTree')[0];
      let body = null;
      for (const sp of descendants(doc.documentElement, NS.P, 'sp')) {
        const ph = descendants(sp, NS.P, 'ph')[0];
        if (ph && attr(ph, 'type', 'body') === 'body') { body = sp; break; }
      }
      if (!body) {
        body = descendants(spTree, NS.P, 'sp').find(sp => {
          if (!descendants(sp, NS.P, 'txBody').length) return false;
          const ph = descendants(sp, NS.P, 'ph')[0];
          const type = ph ? attr(ph, 'type', 'body') : '';
          return !['sldNum', 'hdr', 'ftr', 'dt'].includes(type);
        }) || null;
      }
      const note = slide.note || '';
      if (body) {
        const txBody = firstChild(body, NS.P, 'txBody');
        if (txBody) rewriteNotesBody(doc, txBody, note);
        else body.appendChild(parseNodes(doc, `<p:txBody><a:bodyPr/><a:lstStyle/>${notesParagraphs(note)}</p:txBody>`)[0]);
      } else {
        insertBeforeExtLst(spTree, parseNodes(doc, notesBodyShapeXml(note, maxShapeId(doc) + 1)));
      }
      this.zip.file(binding.notesPart, serializeXml(doc));
      return;
    }
    if (slide.note) await this.createNotesPart(binding.part, slide.note);
  }

  async save() {
    if (this.presentationDirty) {
      this.zip.file(this.presentationPart, serializeXml(this.presentationDoc));
    }
    if (this.contentTypesDirty) {
      this.zip.file(this.contentTypesPart, serializeXml(this.contentTypesDoc));
    }
    for (const rels of this.relsCache.values()) {
      if (rels.dirty) this.zip.file(rels.path, serializeXml(rels.doc));
    }
  }
}

// ---------------------------------------------------------------------------
// DOM helpers

function parseNodes(doc, xml) {
  const wrapper = parseFragment(xml);
  const nodes = [];
  for (let node = wrapper.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) nodes.push(doc.importNode(node, true));
  }
  return nodes;
}

function insertBeforeExtLst(parent, nodes) {
  const extLst = childElements(parent).find(node => node.localName === 'extLst');
  for (const node of nodes) {
    if (extLst) parent.insertBefore(node, extLst);
    else parent.appendChild(node);
  }
}

function ensureSpPr(doc, node) {
  let spPr = firstChild(node, NS.P, 'spPr');
  if (!spPr) {
    spPr = doc.createElementNS(NS.P, 'p:spPr');
    const txBody = firstChild(node, NS.P, 'txBody');
    if (txBody) node.insertBefore(spPr, txBody);
    else node.appendChild(spPr);
  }
  return spPr;
}

function invertMatrix(matrix) {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!determinant) return IDENTITY_MATRIX;
  const a = matrix.d / determinant;
  const b = -matrix.b / determinant;
  const c = -matrix.c / determinant;
  const d = matrix.a / determinant;
  return {
    a,
    b,
    c,
    d,
    e: -(a * matrix.e + c * matrix.f),
    f: -(b * matrix.e + d * matrix.f),
  };
}

function groupAncestors(node) {
  const groups = [];
  let current = node.parentNode;
  while (current && current.nodeType === 1 && current.localName !== 'spTree') {
    if (current.localName === 'grpSp') groups.unshift(current);
    current = current.parentNode;
  }
  return groups;
}

function maxShapeId(doc) {
  let max = 1;
  for (const node of descendants(doc.documentElement, NS.P, 'cNvPr')) {
    const id = Number.parseInt(attr(node, 'id', ''), 10);
    if (Number.isInteger(id) && id > max) max = id;
  }
  return max;
}

function indexShapes(spTree) {
  const index = { byId: new Map(), byPath: new Map(), items: [] };
  const walk = (container, path) => {
    const nodes = childElements(container).filter(node => SHAPE_NODES.has(node.localName));
    nodes.forEach((node, position) => {
      const nodePath = [...path, position];
      const item = {
        node,
        path: nodePath,
        parent: container,
        shapeId: attr(descendants(node, NS.P, 'cNvPr')[0], 'id', '') || null,
      };
      index.items.push(item);
      index.byPath.set(nodePath.join('.'), item);
      if (item.shapeId) {
        if (!index.byId.has(item.shapeId)) index.byId.set(item.shapeId, []);
        index.byId.get(item.shapeId).push(item);
      }
      if (node.localName === 'grpSp') walk(node, nodePath);
    });
  };
  walk(spTree, []);
  return index;
}

function findItem(index, binding) {
  const key = binding?.shapeId ? String(binding.shapeId) : '';
  if (key && index.byId.has(key)) {
    const candidates = index.byId.get(key);
    if (binding.path) {
      const pathItem = index.byPath.get(binding.path.join('.'));
      if (pathItem && candidates.includes(pathItem)) return pathItem;
    }
    return candidates[0];
  }
  if (binding?.path) return index.byPath.get(binding.path.join('.')) || null;
  return null;
}

function setSpPrFill(doc, spPr, color) {
  for (const node of childElements(spPr)) {
    if (['noFill', 'solidFill', 'gradFill', 'pattFill', 'blipFill', 'grpFill'].includes(node.localName)) {
      removeNode(node);
    }
  }
  const xml = color
    ? `<a:solidFill><a:srgbClr val="${colorHex(color, 'FFFFFF')}"/></a:solidFill>`
    : '<a:noFill/>';
  const [node] = parseNodes(doc, xml);
  const anchor = childElements(spPr).find(child => ['ln', 'effectLst', 'effectDag', 'scene3d', 'sp3d', 'extLst'].includes(child.localName));
  if (anchor) spPr.insertBefore(node, anchor);
  else spPr.appendChild(node);
}

function setSpPrStroke(doc, spPr, color, width) {
  let ln = firstChild(spPr, NS.A, 'ln');
  if (!ln) {
    ln = doc.createElementNS(NS.A, 'a:ln');
    const anchor = childElements(spPr).find(child => ['effectLst', 'effectDag', 'scene3d', 'sp3d', 'extLst'].includes(child.localName));
    if (anchor) spPr.insertBefore(ln, anchor);
    else spPr.appendChild(ln);
  }
  for (const node of childElements(ln)) {
    if (['noFill', 'solidFill', 'gradFill', 'pattFill', 'blipFill', 'grpFill'].includes(node.localName)) removeNode(node);
  }
  if (color) {
    ln.setAttribute('w', String(Math.max(1, Math.round((Number(width) || 1) * 0.75 * 12700))));
    const [node] = parseNodes(doc, `<a:solidFill><a:srgbClr val="${colorHex(color, '1F2430')}"/></a:solidFill>`);
    ln.insertBefore(node, ln.firstChild);
  } else {
    ln.removeAttribute('w');
    ln.insertBefore(parseNodes(doc, '<a:noFill/>')[0], ln.firstChild);
  }
}

function setRoundRectRadius(doc, prstGeom, element) {
  const shortest = Math.max(1, Math.min(Number(element.w) || 1, Number(element.h) || 1));
  const radius = Math.max(0, Math.min(Number(element.radius) || 0, shortest / 2));
  let avLst = firstChild(prstGeom, NS.A, 'avLst');
  if (!avLst) {
    avLst = doc.createElementNS(NS.A, 'a:avLst');
    prstGeom.appendChild(avLst);
  }
  for (const guide of childrenNs(avLst, NS.A, 'gd')) removeNode(guide);
  const adjustment = Math.round(radius * 100000 / shortest);
  avLst.appendChild(parseNodes(doc, `<a:gd name="adj" fmla="val ${adjustment}"/>`)[0]);
}

function patchTableAlignment(doc, tbl, element) {
  if (!tbl) return;
  const code = alignCode(element);
  for (const paragraph of descendants(tbl, NS.A, 'p')) {
    let pPr = firstChild(paragraph, NS.A, 'pPr');
    if (!pPr) {
      pPr = doc.createElementNS(NS.A, 'a:pPr');
      paragraph.insertBefore(pPr, paragraph.firstChild);
    }
    pPr.setAttribute('algn', code);
  }
}

function applyTextFormatting(doc, txBody, element, baseline, fontFace, cx) {
  for (const paragraph of childrenNs(txBody, NS.A, 'p')) {
    let pPr = firstChild(paragraph, NS.A, 'pPr');
    if (!pPr) {
      pPr = doc.createElementNS(NS.A, 'a:pPr');
      paragraph.insertBefore(pPr, paragraph.firstChild);
    }
    if ((element.align ?? null) !== (baseline.align ?? null)) pPr.setAttribute('algn', alignCode(element));
    if ((element.lineHeight ?? null) !== (baseline.lineHeight ?? null)) {
      const existing = firstChild(pPr, NS.A, 'lnSpc');
      if (existing) removeNode(existing);
      if (typeof element.lineHeight === 'number') {
        pPr.insertBefore(parseNodes(doc, `<a:lnSpc><a:spcPct val="${Math.round(element.lineHeight * 100000)}"/></a:lnSpc>`)[0], pPr.firstChild);
      }
    }
    for (const run of [...childrenNs(paragraph, NS.A, 'r'), ...childrenNs(paragraph, NS.A, 'fld')]) {
      const rPr = firstChild(run, NS.A, 'rPr');
      if (rPr) applyRunProperties(doc, rPr, element, baseline, fontFace, cx);
    }
    const end = firstChild(paragraph, NS.A, 'endParaRPr');
    if (end) applyRunProperties(doc, end, element, baseline, fontFace, cx);
  }
}

function rewriteTextBody(doc, txBody, element, baseline, fontFace, cx) {
  const paragraphs = childrenNs(txBody, NS.A, 'p');
  const template = paragraphs[0] || null;
  const templatePPr = template ? firstChild(template, NS.A, 'pPr') : null;
  const templateRun = template ? childrenNs(template, NS.A, 'r')[0] : null;
  const templateRPr = templateRun
    ? firstChild(templateRun, NS.A, 'rPr')
    : (template ? firstChild(template, NS.A, 'endParaRPr') : null);
  for (const paragraph of paragraphs) removeNode(paragraph);

  const base = baseline || {};
  const lines = String(element.text ?? '').replace(/\r\n?/g, '\n').split('\n');
  for (const line of lines) {
    const paragraph = doc.createElementNS(NS.A, 'a:p');
    const pPr = templatePPr ? templatePPr.cloneNode(true) : doc.createElementNS(NS.A, 'a:pPr');
    pPr.setAttribute('algn', alignCode(element));
    if ((element.lineHeight ?? null) !== (base.lineHeight ?? null)) {
      const existing = firstChild(pPr, NS.A, 'lnSpc');
      if (existing) removeNode(existing);
      if (typeof element.lineHeight === 'number') {
        pPr.insertBefore(parseNodes(doc, `<a:lnSpc><a:spcPct val="${Math.round(element.lineHeight * 100000)}"/></a:lnSpc>`)[0], pPr.firstChild);
      }
    }
    paragraph.appendChild(pPr);
    if (line) {
      const run = doc.createElementNS(NS.A, 'a:r');
      const rPr = templateRPr ? templateRPr.cloneNode(true) : doc.createElementNS(NS.A, 'a:rPr');
      if (rPr.localName === 'endParaRPr') {
        const replacement = doc.createElementNS(NS.A, 'a:rPr');
        copyRunProperties(rPr, replacement);
        run.appendChild(replacement);
        applyRunProperties(doc, replacement, element, base, fontFace, cx);
      } else {
        run.appendChild(rPr);
        applyRunProperties(doc, rPr, element, base, fontFace, cx);
      }
      const text = doc.createElementNS(NS.A, 'a:t');
      text.setAttribute('xml:space', 'preserve');
      text.appendChild(doc.createTextNode(line));
      run.appendChild(text);
      paragraph.appendChild(run);
    } else {
      const end = doc.createElementNS(NS.A, 'a:endParaRPr');
      if (templateRPr) copyRunProperties(templateRPr, end);
      applyRunProperties(doc, end, element, base, fontFace, cx);
      paragraph.appendChild(end);
    }
    txBody.appendChild(paragraph);
  }
}

function copyRunProperties(source, target) {
  for (let index = 0; index < source.attributes.length; index += 1) {
    const item = source.attributes[index];
    target.setAttribute(item.name, item.value);
  }
  for (const child of childElements(source)) target.appendChild(child.cloneNode(true));
}

function applyRunProperties(doc, rPr, element, baseline, fontFace, cx) {
  const sizeChanged = (element.fontSize ?? null) !== (baseline.fontSize ?? null);
  if (sizeChanged || !rPr.hasAttribute('sz')) {
    rPr.setAttribute('sz', String(fontUnitsToPt100(element.fontSize ?? 24, cx)));
  }
  const boldChanged = (element.bold ?? false) !== (baseline.bold ?? false);
  if (boldChanged || !rPr.hasAttribute('b')) rPr.setAttribute('b', element.bold ? '1' : '0');
  const colorChanged = (element.color ?? null) !== (baseline.color ?? null);
  const hasColor = childElements(rPr).some(node => ['solidFill', 'gradFill', 'pattFill'].includes(node.localName));
  if (colorChanged || !hasColor) {
    for (const node of childElements(rPr)) {
      if (['solidFill', 'gradFill', 'pattFill', 'noFill'].includes(node.localName)) removeNode(node);
    }
    const [fill] = parseNodes(doc, `<a:solidFill><a:srgbClr val="${colorHex(element.color, '1F2430')}"/></a:solidFill>`);
    const anchor = childElements(rPr).find(node => ['effectLst', 'highlight', 'uLnTx', 'uLn', 'uFillTx', 'uFill', 'latin', 'ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'].includes(node.localName));
    if (anchor) rPr.insertBefore(fill, anchor);
    else rPr.appendChild(fill);
  }
  if (fontFace && !firstChild(rPr, NS.A, 'latin')) {
    const [latin] = parseNodes(doc, `<a:latin typeface="${xmlAttr(fontFace)}"/>`);
    const anchor = childElements(rPr).find(node => ['ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'].includes(node.localName));
    if (anchor) rPr.insertBefore(latin, anchor);
    else rPr.appendChild(latin);
  }
}

function notesParagraphs(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  return lines.map(line => (line
    ? `<a:p><a:r><a:rPr lang="zh-CN" altLang="en-US" dirty="0"/><a:t xml:space="preserve">${escapeText(line)}</a:t></a:r></a:p>`
    : '<a:p><a:endParaRPr lang="zh-CN" altLang="en-US" dirty="0"/></a:p>')).join('');
}

function escapeText(value) {
  return String(value).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}

function rewriteNotesBody(doc, txBody, text) {
  for (const paragraph of childrenNs(txBody, NS.A, 'p')) removeNode(paragraph);
  const nodes = parseNodes(doc, notesParagraphs(text));
  for (const node of nodes) txBody.appendChild(node);
}

function patchBackground(doc, color) {
  const cSld = descendants(doc.documentElement, NS.P, 'cSld')[0];
  if (!cSld) return;
  const existing = firstChild(cSld, NS.P, 'bg');
  if (existing) removeNode(existing);
  if (!color) return;
  const [node] = parseNodes(doc, backgroundXml(color));
  cSld.insertBefore(node, cSld.firstChild);
}

function setSrcRect(doc, pic, srcRect) {
  const blipFill = descendants(pic, NS.P, 'blipFill')[0];
  if (!blipFill) return;
  const existing = firstChild(blipFill, NS.A, 'srcRect');
  if (existing) removeNode(existing);
  if (!srcRect) return;
  const values = ['l', 'r', 't', 'b'].map(side => Math.round((srcRect[side] || 0) * 100000));
  if (!values.some(value => value !== 0)) return;
  const [node] = parseNodes(doc, `<a:srcRect l="${values[0]}" t="${values[2]}" r="${values[1]}" b="${values[3]}"/>`);
  const stretch = firstChild(blipFill, NS.A, 'stretch');
  if (stretch) blipFill.insertBefore(node, stretch);
  else blipFill.appendChild(node);
}

function imageLayout(element, info, cx) {
  const width = unitsToEmu(element.w, cx);
  const height = unitsToEmu(element.h, cx);
  const box = {
    x: unitsToEmu(element.x, cx),
    y: unitsToEmu(element.y, cx),
    w: width,
    h: height,
  };
  const imageWidth = info?.width || 0;
  const imageHeight = info?.height || 0;
  if (!imageWidth || !imageHeight) return { box, srcRect: null };
  const boxAspect = width / height;
  const imageAspect = imageWidth / imageHeight;
  if (element.fit === 'contain') {
    let innerW = width;
    let innerH = height;
    if (imageAspect > boxAspect) innerH = width / imageAspect;
    else innerW = height * imageAspect;
    const x = box.x + (width - innerW) / 2;
    const y = box.y + (height - innerH) / 2;
    return { box: { x, y, w: innerW, h: innerH }, srcRect: null };
  }
  let srcRect = null;
  if (imageAspect > boxAspect) {
    const visible = boxAspect / imageAspect;
    const crop = (1 - visible) / 2;
    srcRect = { l: crop, r: crop, t: 0, b: 0 };
  } else if (imageAspect < boxAspect) {
    const visible = imageAspect / boxAspect;
    const crop = (1 - visible) / 2;
    srcRect = { l: 0, r: 0, t: crop, b: crop };
  }
  return { box, srcRect };
}

export async function exportImportedPptx(project, options = {}) {
  assertProjectLimits(project);
  const safe = normalizeProject(project);
  const bindings = options.bindings;
  if (!bindings || bindings.version !== 1 || !bindings.slides || !bindings.package?.presentation) {
    throw new ProjectError('导入项目缺少源格式映射，无法保真导出', 'invalid_bindings');
  }
  if (!options.sourcePath) throw new ProjectError('缺少导入源 PPTX 路径', 'invalid_bindings');
  if (!options.outDir) throw new ProjectError('缺少导出目录', 'invalid');
  const buffer = await readFile(options.sourcePath).catch(error => {
    throw new ProjectError(`无法读取导入源文件：${error.message}`, 'not_found');
  });
  if (buffer.length > PPTX_LIMITS.maxBytes) {
    throw new ProjectError('导入源 PPTX 超过 50 MiB 限制', 'limit_exceeded');
  }
  if (bindings.size && buffer.length !== bindings.size) {
    throw new ProjectError('导入源 PPTX 与导入时不一致，无法保真导出', 'source_changed');
  }
  if (bindings.sha256 && sha256(buffer) !== bindings.sha256) {
    throw new ProjectError('导入源 PPTX 校验失败，无法保真导出', 'source_changed');
  }
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new ProjectError('导入源不是有效的 PPTX ZIP 包', 'invalid_pptx');
  }
  await validateZip(zip, { maxEntries: PPTX_LIMITS.maxEntries, maxUncompressed: PPTX_LIMITS.maxUncompressed });

  const warnings = [];
  const exporter = new Exporter(zip, safe, bindings, warnings);
  await exporter.run();
  const output = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const dir = join(options.outDir, safe.id);
  await mkdir(dir, { recursive: true });
  const filename = `${sanitizeFilename(safe.title)}-r${safe.revision}.pptx`;
  const path = join(dir, filename);
  await writeFile(path, output);
  return {
    path,
    filename,
    bytes: output.length,
    warnings,
    slides: safe.slides.length,
  };
}
