// Real OOXML (PPTX) importer.
//
// The importer walks the actual package relationships, slide order, masters,
// layouts and themes. Supported DrawingML shapes become editable project
// elements; anything that cannot be represented faithfully stays in the source
// package untouched (opaque) and is reported as a warning. The returned
// `bindings` map is the baseline the fidelity exporter diffs against.
import JSZip from 'jszip';
import {
  NS, PPTX_LIMITS, parseXml, firstChild, childElements, childrenNs, descendants,
  attr, numAttr, relAttr, relsPath, parseRels, pickRel, readTextPart, readBinaryPart,
  validateZip, imageInfo, dataUrlFor, themeFromXml, clrMapFromXml, readFill,
  colorFromElement, resolveSchemeColor, emuToUnits, ptToFontUnits, strokeFromEmu, sha256, round,
  IDENTITY_MATRIX as IDENTITY, isIdentityMatrix as isIdentity, multiplyMatrix as multiply,
  translationMatrix as translation, scalingMatrix as scaling, rotationMatrix as rotation,
  applyMatrixPoint as applyPoint, groupMatrix, groupRotation, groupXfrm,
} from './pptx-xml.js';
import { ProjectError, normalizeProject, assertProjectLimits } from './project.js';
import { parseChartXml } from './pptx-chart.js';
import { buildBackdropSvg } from './pptx-backdrop.js';

const MAX_SLIDES = 300;
const MAX_ELEMENTS_PER_SLIDE = 300;
const MAX_NOTE = 4000;
const MAX_IMAGE_SRC = 8_000_000;
const SHAPE_NODES = new Set(['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp']);
const SUPPORTED_PRST = new Map([
  ['rect', 'rect'],
  ['roundRect', 'roundRect'],
  ['ellipse', 'ellipse'],
  ['line', 'line'],
  ['straightConnector1', 'line'],
]);
const TEXT_PLACEHOLDERS = new Set(['title', 'ctrTitle', 'subTitle', 'body', 'obj']);
const SKIP_PLACEHOLDERS = new Set(['sldNum', 'hdr', 'ftr', 'dt']);

function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (input instanceof ArrayBuffer) return Buffer.from(new Uint8Array(input));
  return null;
}

function shapeChildren(container) {
  return childElements(container).filter(node => SHAPE_NODES.has(node.localName));
}

function findCNvPr(node) {
  return descendants(node, NS.P, 'cNvPr')[0] || null;
}

function shapeName(node) {
  return attr(findCNvPr(node), 'name', '');
}

function placeHolder(node) {
  const nvPr = descendants(node, NS.P, 'nvPr')[0];
  return nvPr ? firstChild(nvPr, NS.P, 'ph') : null;
}

function hasFlip(node) {
  if (node.localName !== 'grpSp') return false;
  const xfrm = groupXfrm(node);
  return !!xfrm && (attr(xfrm, 'flipH') === '1' || attr(xfrm, 'flipV') === '1');
}

function shapeXfrm(node) {
  if (node.localName === 'graphicFrame') return firstChild(node, NS.P, 'xfrm');
  const spPr = firstChild(node, NS.P, 'spPr');
  return spPr ? firstChild(spPr, NS.A, 'xfrm') : null;
}

function rectangleOf(node) {
  const xfrm = shapeXfrm(node);
  if (!xfrm) return null;
  const off = firstChild(xfrm, NS.A, 'off');
  const ext = firstChild(xfrm, NS.A, 'ext');
  return {
    x: numAttr(off, 'x'),
    y: numAttr(off, 'y'),
    w: Math.max(0, numAttr(ext, 'cx')),
    h: Math.max(0, numAttr(ext, 'cy')),
    rotate: numAttr(xfrm, 'rot') / 60000,
    flipH: attr(xfrm, 'flipH') === '1',
    flipV: attr(xfrm, 'flipV') === '1',
  };
}

function absoluteRect(rect, matrix, groupRot) {
  if (isIdentity(matrix)) {
    return { x: rect.x, y: rect.y, w: rect.w, h: rect.h, rotate: rect.rotate + groupRot };
  }
  const center = applyPoint(matrix, rect.x + rect.w / 2, rect.y + rect.h / 2);
  const sx = Math.hypot(matrix.a, matrix.b);
  const sy = Math.hypot(matrix.c, matrix.d);
  const width = rect.w * sx;
  const height = rect.h * sy;
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    w: width,
    h: height,
    rotate: rect.rotate + groupRot,
  };
}

function readParagraphText(paragraph) {
  let text = '';
  for (const node of childElements(paragraph)) {
    if (node.localName === 'r' || node.localName === 't') {
      for (const t of descendants(node, NS.A, 't')) text += t.textContent || '';
    } else if (node.localName === 'br') {
      text += '\n';
    } else if (node.localName === 'tab') {
      text += '\t';
    }
    // a:fld (slide numbers, dates) is computed by PowerPoint and is not model text.
  }
  return text;
}

function readTextBody(txBody) {
  if (!txBody) return '';
  return childrenNs(txBody, NS.A, 'p').map(readParagraphText).join('\n');
}

function hasField(txBody) {
  return !!(txBody && descendants(txBody, NS.A, 'fld').length);
}

function levelsFromStyle(root, context = {}) {
  const out = {};
  if (!root) return out;
  for (let level = 1; level <= 9; level += 1) {
    const pPr = childrenNs(root, NS.A, `lvl${level}pPr`)[0];
    if (!pPr) continue;
    out[level] = {
      pPr,
      align: attr(pPr, 'algn', ''),
      props: extractRunProps(firstChild(pPr, NS.A, 'defRPr'), context),
      bullet: !!(firstChild(pPr, NS.A, 'buChar') || firstChild(pPr, NS.A, 'buAutoNum') || firstChild(pPr, NS.A, 'buBlip')),
    };
  }
  return out;
}

function extractRunProps(node, context = {}) {
  const out = {};
  if (!node) return out;
  if (node.hasAttribute('sz')) {
    const size = numAttr(node, 'sz', 0);
    if (size > 0) out.sz = size;
  }
  if (node.hasAttribute('b')) out.bold = attr(node, 'b') !== '0';
  const fill = readFill(node, context);
  if (fill && fill.kind !== 'none' && fill.color) out.color = fill.color;
  const latin = firstChild(node, NS.A, 'latin');
  if (latin) {
    const typeface = attr(latin, 'typeface', '');
    if (typeface) out.font = typeface;
  }
  return out;
}

function resolveThemeFont(typeface, theme) {
  if (!typeface) return theme.fonts.minor || '';
  if (typeface.startsWith('+mj')) return theme.fonts.major || theme.fonts.minor || '';
  if (typeface.startsWith('+mn')) return theme.fonts.minor || theme.fonts.major || '';
  return typeface;
}

function placeholderStyleKey(type) {
  if (!type) return 'other';
  if (type === 'title' || type === 'ctrTitle') return 'title';
  if (type === 'body' || type === 'subTitle' || type === 'obj') return 'body';
  return 'other';
}

const TITLE_PLACEHOLDERS = new Set(['title', 'ctrTitle']);
const BODY_PLACEHOLDERS = new Set(['body', 'subTitle', 'obj']);

function findPlaceholderShape(doc, type, idx) {
  if (!doc) return null;
  const spTree = descendants(doc.documentElement, NS.P, 'spTree')[0];
  if (!spTree) return null;
  const candidates = childrenNs(spTree, NS.P, 'sp')
    .map(sp => ({ sp, ph: placeHolder(sp) }))
    .filter(item => item.ph);
  if (idx) {
    const exact = candidates.find(item => attr(item.ph, 'idx', '') === idx);
    if (exact) return exact.sp;
  }
  const exactType = candidates.find(item => attr(item.ph, 'type', 'obj') === type);
  if (exactType) return exactType.sp;
  const compatible = candidates.find(item => {
    const candidateType = attr(item.ph, 'type', 'obj');
    if (TITLE_PLACEHOLDERS.has(type) && TITLE_PLACEHOLDERS.has(candidateType)) return true;
    if (BODY_PLACEHOLDERS.has(type) && BODY_PLACEHOLDERS.has(candidateType)) return true;
    return false;
  });
  return compatible ? compatible.sp : null;
}

function alignFromOoxml(value) {
  if (value === 'ctr') return 'center';
  if (value === 'r') return 'right';
  return 'left';
}

function lineSpacing(node) {
  const spacing = node ? firstChild(node, NS.A, 'lnSpc') : null;
  const pct = spacing ? firstChild(spacing, NS.A, 'spcPct') : null;
  if (!pct) return undefined;
  const value = numAttr(pct, 'val', 0) / 100000;
  return value > 0 ? value : undefined;
}

class ImportContext {
  constructor(zip, buffer, options = {}) {
    this.zip = zip;
    this.buffer = buffer;
    this.filename = options.filename || '';
    this.title = typeof options.title === 'string' ? options.title.trim() : '';
    this.warnings = [];
    this.truncatedWarnings = false;
    this.docCache = new Map();
    this.relCache = new Map();
    this.themeCache = new Map();
    this.backdropCache = new Map();
    this.backdrops = {};
    this.cx = 12192000;
    this.cy = 6858000;
    this.parts = { contentTypes: '[Content_Types].xml' };
    this.bindings = {
      version: 1,
      filename: this.filename,
      sha256: sha256(buffer),
      size: buffer.length,
      canvas: null,
      package: {},
      slides: {},
      order: [],
    };
  }

  warn(message) {
    if (!message) return;
    if (this.warnings.includes(message)) return;
    if (this.warnings.length >= 100) {
      if (!this.truncatedWarnings) {
        this.truncatedWarnings = true;
        this.warnings.push('…更多警告已省略');
      }
      return;
    }
    this.warnings.push(message);
  }

  slideWarn(index, message) {
    this.warn(`第 ${index + 1} 页：${message}`);
  }

  async readDoc(part) {
    if (this.docCache.has(part)) return this.docCache.get(part);
    const promise = (async () => {
      const text = await readTextPart(this.zip, part, { maxBytes: 32 * 1024 * 1024 });
      if (text == null) return null;
      return parseXml(text, `PPTX 部件 ${part}`);
    })();
    this.docCache.set(part, promise);
    return promise;
  }

  async readRels(part) {
    if (this.relCache.has(part)) return this.relCache.get(part);
    const promise = (async () => {
      const text = await readTextPart(this.zip, relsPath(part));
      return parseRels(text, part);
    })();
    this.relCache.set(part, promise);
    return promise;
  }

  async loadPackage() {
    const rootRels = await this.readRels('');
    const officeRel = pickRel(rootRels, '/officeDocument');
    const presentationPart = officeRel?.targetPart || 'ppt/presentation.xml';
    this.parts.presentation = presentationPart;
    this.parts.presentationRels = relsPath(presentationPart);
    const presentationDoc = await this.readDoc(presentationPart);
    if (!presentationDoc) throw new ProjectError('PPTX 缺少 presentation.xml', 'invalid_pptx');
    this.presentationDoc = presentationDoc;
    const presentationRels = await this.readRels(presentationPart);
    this.presentationRels = presentationRels;

    const size = firstChild(presentationDoc.documentElement, NS.P, 'sldSz');
    if (size) {
      const cx = numAttr(size, 'cx');
      const cy = numAttr(size, 'cy');
      if (cx > 0 && cy > 0) {
        this.cx = cx;
        this.cy = cy;
      } else {
        this.warn('幻灯片尺寸无效，已按 16:9 导入');
      }
    } else {
      this.warn('PPTX 未声明幻灯片尺寸，已按 16:9 导入');
    }
    const ratio = this.cy / this.cx;
    if (ratio < 0.2 || ratio > 5) throw new ProjectError('幻灯片宽高比异常，无法导入', 'invalid_pptx');

    this.parts.defaultLayout = null;
    this.parts.defaultLayoutRels = null;
    this.parts.notesMaster = pickRel(presentationRels, '/notesMaster')?.targetPart || null;

    const sldIdLst = firstChild(presentationDoc.documentElement, NS.P, 'sldIdLst');
    const ordered = [];
    if (sldIdLst) {
      for (const node of childrenNs(sldIdLst, NS.P, 'sldId')) {
        const rId = relAttr(node);
        const rel = presentationRels.get(rId);
        if (!rel || !rel.targetPart) {
          this.warn('演示文稿中存在无法解析的幻灯片引用，已跳过');
          continue;
        }
        ordered.push({ part: rel.targetPart, rId, sldId: attr(node, 'id', '') });
      }
    }
    if (!ordered.length) {
      // A package without sldIdLst is unusual; fall back to relationship order.
      for (const rel of presentationRels.values()) {
        if (rel.type.endsWith('/slide') && rel.targetPart) {
          ordered.push({ part: rel.targetPart, rId: rel.id, sldId: '' });
        }
      }
      if (ordered.length) this.warn('演示文稿缺少 sldIdLst，已按关系顺序导入幻灯片');
    }
    if (ordered.length > MAX_SLIDES) {
      throw new ProjectError(`幻灯片页数（${ordered.length}）超过 ${MAX_SLIDES} 页限制`, 'limit_exceeded');
    }
    this.slideEntries = ordered;
  }

  async themeContextFor(layoutPart) {
    const cacheKey = layoutPart || '';
    if (this.themeCache.has(cacheKey)) return this.themeCache.get(cacheKey);
    const promise = (async () => {
      const context = {
        theme: { colors: {}, fonts: { major: '', minor: '' } },
        clrMap: {},
        masterDoc: null,
        layoutDoc: null,
        layoutPart: layoutPart || null,
        masterPart: null,
        layoutRels: new Map(),
        masterRels: new Map(),
        styles: { title: {}, body: {}, other: {} },
        defaultTextColor: '1F2430',
        backgroundColor: 'FFFFFF',
      };
      try {
        let masterPart = null;
        if (layoutPart) {
          context.layoutDoc = await this.readDoc(layoutPart).catch(() => null);
          context.layoutRels = await this.readRels(layoutPart).catch(() => new Map());
          masterPart = pickRel(context.layoutRels, '/slideMaster')?.targetPart || null;
        }
        if (!masterPart) {
          masterPart = pickRel(this.presentationRels, '/slideMaster')?.targetPart || null;
        }
        context.masterPart = masterPart || null;
        if (masterPart) {
          context.masterDoc = await this.readDoc(masterPart).catch(() => null);
          context.masterRels = await this.readRels(masterPart).catch(() => new Map());
          const masterRels = context.masterRels;
          const themePart = pickRel(masterRels, '/theme')?.targetPart || null;
          if (themePart) {
            const themeDoc = await this.readDoc(themePart).catch(() => null);
            context.theme = themeFromXml(themeDoc);
            this.parts.theme = themePart;
          }
          context.clrMap = clrMapFromXml(context.masterDoc);
        }
        const txStyles = context.masterDoc ? descendants(context.masterDoc.documentElement, NS.P, 'txStyles')[0] : null;
        for (const [key, local] of [['title', 'titleStyle'], ['body', 'bodyStyle'], ['other', 'otherStyle']]) {
          context.styles[key] = levelsFromStyle(txStyles ? firstChild(txStyles, NS.P, local) : null, context);
        }
        const tx1 = resolveSchemeColor('tx1', context);
        if (tx1) context.defaultTextColor = tx1;
        const bg = resolveSchemeColor('bg1', context);
        if (bg) context.backgroundColor = bg;
      } catch (error) {
        if (error instanceof ProjectError && error.code === 'unsafe_xml') throw error;
        this.warn(`主题继承解析不完整：${error.message}`);
      }
      return context;
    })();
    this.themeCache.set(cacheKey, promise);
    return promise;
  }

  placeholderStyleChain(node, context) {
    const ph = placeHolder(node);
    if (!ph) return [];
    const type = attr(ph, 'type', 'obj');
    const idx = attr(ph, 'idx', '');
    const chain = [];
    for (const doc of [context.layoutDoc, context.masterDoc]) {
      const sp = findPlaceholderShape(doc, type, idx);
      if (!sp) { chain.push(null); continue; }
      const txBody = firstChild(sp, NS.P, 'txBody');
      chain.push({ levels: levelsFromStyle(txBody ? firstChild(txBody, NS.A, 'lstStyle') : null, context) });
    }
    return chain;
  }

  resolveTextStyle(txBody, styleLevels, phType, context, styleChain = []) {
    const paragraphs = txBody ? childrenNs(txBody, NS.A, 'p') : [];
    const chosen = paragraphs.find(paragraph => readParagraphText(paragraph).trim()) || paragraphs[0] || null;
    const pPr = chosen ? firstChild(chosen, NS.A, 'pPr') : null;
    const level = Math.min(9, Math.max(1, (Number.parseInt(attr(pPr, 'lvl', '0'), 10) || 0) + 1));
    const master = context.styles[placeholderStyleKey(phType)]?.[level] || {};
    const shapeLevel = styleLevels?.[level] || {};
    const runs = chosen ? childrenNs(chosen, NS.A, 'r') : [];
    const firstRun = runs[0] || null;
    const runRPr = firstRun ? firstChild(firstRun, NS.A, 'rPr') : null;
    const endRPr = chosen ? firstChild(chosen, NS.A, 'endParaRPr') : null;
    const layoutLevel = styleChain[0]?.levels?.[level];
    const masterPlaceholderLevel = styleChain[1]?.levels?.[level];
    const props = {
      sz: 1800,
      bold: false,
      color: context.defaultTextColor,
      font: context.theme.fonts.minor || 'Inter',
      ...(master.props || {}),
      ...(masterPlaceholderLevel?.props || {}),
      ...(layoutLevel?.props || {}),
      ...(shapeLevel.props || {}),
      ...extractRunProps(firstChild(pPr, NS.A, 'defRPr'), context),
      ...extractRunProps(runRPr || endRPr, context),
    };
    const align = attr(pPr, 'algn', '')
      || shapeLevel.align
      || layoutLevel?.align
      || masterPlaceholderLevel?.align
      || master.align
      || 'l';
    const spacing = lineSpacing(pPr)
      ?? lineSpacing(shapeLevel.pPr)
      ?? lineSpacing(layoutLevel?.pPr)
      ?? lineSpacing(masterPlaceholderLevel?.pPr)
      ?? lineSpacing(master.pPr);
    const bulleted = !!(
      (pPr && (firstChild(pPr, NS.A, 'buChar') || firstChild(pPr, NS.A, 'buAutoNum') || firstChild(pPr, NS.A, 'buBlip')))
      || shapeLevel.bullet
      || layoutLevel?.bullet
      || masterPlaceholderLevel?.bullet
      || master.bullet
    );
    return {
      fontSize: ptToFontUnits((props.sz || 1800) / 100, this.cx),
      bold: props.bold === true,
      color: `#${props.color || context.defaultTextColor}`,
      align: alignFromOoxml(align),
      lineHeight: spacing && spacing >= 0.7 && spacing <= 3 ? round(spacing, 2) : undefined,
      bulleted,
    };
  }

  readBackground(doc) {
    if (!doc) return null;
    const bg = descendants(doc.documentElement, NS.P, 'bg')[0];
    if (!bg) return null;
    const bgPr = firstChild(bg, NS.P, 'bgPr');
    if (bgPr) {
      if (firstChild(bgPr, NS.A, 'noFill')) return { kind: 'none' };
      const solid = firstChild(bgPr, NS.A, 'solidFill');
      if (solid) {
        const fill = readFill(bgPr, this.currentThemeContext || {});
        if (fill?.color) return { kind: 'solid', color: fill.color };
      }
      if (firstChild(bgPr, NS.A, 'gradFill')) return { kind: 'gradient' };
      if (firstChild(bgPr, NS.A, 'blipFill')) return { kind: 'image' };
      return { kind: 'none' };
    }
    const bgRef = firstChild(bg, NS.P, 'bgRef');
    if (bgRef) {
      const fill = readFill(bg, this.currentThemeContext || {});
      if (fill?.color) return { kind: 'solid', color: fill.color };
    }
    return null;
  }

  resolveBackground(slideDoc, layoutDoc, masterDoc, slideIndex, context) {
    this.currentThemeContext = context;
    let sawImage = false;
    for (const doc of [slideDoc, layoutDoc, masterDoc]) {
      const state = this.readBackground(doc);
      if (!state) continue;
      if (state.kind === 'solid') return { color: state.color, explicit: doc === slideDoc };
      if (state.kind === 'image' || state.kind === 'gradient') sawImage = true;
    }
    if (sawImage) this.slideWarn(slideIndex, '背景为图片或渐变，编辑预览使用主题底色；未改动的背景原样保留');
    return { color: context.backgroundColor, explicit: false };
  }

  async backdropFor(slideDoc, context) {
    const layoutDoc = context.layoutDoc;
    const masterDoc = context.masterDoc;
    if (!layoutDoc && !masterDoc) return null;
    const slideShowMaster = attr(slideDoc.documentElement, 'showMasterSp', '1') !== '0';
    const layoutShowMaster = layoutDoc ? attr(layoutDoc.documentElement, 'showMasterSp', '1') !== '0' : true;
    const includeMaster = slideShowMaster && layoutShowMaster;
    const key = `${context.layoutPart || ''}|${context.masterPart || ''}|${includeMaster ? 1 : 0}`;
    if (this.backdropCache.has(key)) return this.backdropCache.get(key);
    const svg = await buildBackdropSvg({
      layoutDoc,
      masterDoc,
      layoutRels: context.layoutRels,
      masterRels: context.masterRels,
      themeContext: context,
      cx: this.cx,
      cy: this.cy,
      includeMaster,
      readImage: part => readBinaryPart(this.zip, part, { maxBytes: 16 * 1024 * 1024 }),
      warn: message => this.warn(`版式背景：${message}`),
    });
    let result = null;
    if (svg) {
      const hash = sha256(svg);
      const id = `bd_${hash.slice(0, 16)}`;
      if (!this.backdrops[id]) {
        let dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
        if (dataUrl.length > 8_000_000) {
          this.warn('版式背景超过 8,000,000 字符限制，未生成预览');
          dataUrl = null;
        }
        if (dataUrl) this.backdrops[id] = dataUrl;
      }
      if (this.backdrops[id]) {
        if (!this.bindings.backdrops) this.bindings.backdrops = {};
        if (!this.bindings.backdrops[id]) {
          this.bindings.backdrops[id] = {
            layoutPart: context.layoutPart || null,
            layoutRels: context.layoutPart ? relsPath(context.layoutPart) : null,
            masterPart: context.masterPart || null,
            includeMaster,
          };
        }
        result = { id };
      } else {
        result = null;
      }
    }
    this.backdropCache.set(key, result);
    return result;
  }

  async importSlide(entry, index) {
    const slideDoc = await this.readDoc(entry.part);
    if (!slideDoc) throw new ProjectError(`缺少幻灯片部件 ${entry.part}`, 'invalid_pptx');
    const rels = await this.readRels(entry.part);
    const layoutRel = pickRel(rels, '/slideLayout');
    const layoutPart = layoutRel?.targetPart || null;
    if (!this.parts.defaultLayout && layoutPart) {
      this.parts.defaultLayout = layoutPart;
      this.parts.defaultLayoutRels = relsPath(layoutPart);
    }
    const context = await this.themeContextFor(layoutPart);
    this.currentThemeContext = context;
    const backgroundState = this.resolveBackground(slideDoc, context.layoutDoc, context.masterDoc, index, context);

    const notesRel = pickRel(rels, '/notesSlide');
    const notesPart = notesRel?.targetPart || null;
    let note = '';
    if (notesPart) {
      note = await this.readNotes(notesPart);
      if (note.length > MAX_NOTE) {
        note = note.slice(0, MAX_NOTE);
        this.slideWarn(index, `备注超过 ${MAX_NOTE} 字符，已截断`);
      }
    }

    const slideId = `s_${index + 1}`;
    const slide = { id: slideId, note, elements: [] };
    if (backgroundState.explicit && backgroundState.color) slide.background = `#${backgroundState.color}`;
    const backdrop = await this.backdropFor(slideDoc, context);
    if (backdrop) slide.backdropId = backdrop.id;

    const binding = {
      part: entry.part,
      rels: relsPath(entry.part),
      notesPart,
      notesRels: notesPart ? relsPath(notesPart) : null,
      layoutPart,
      background: slide.background || null,
      noteBaseline: note,
      elements: {},
      maxShapeId: 0,
    };
    this.bindings.slides[slideId] = binding;

    const spTree = descendants(slideDoc.documentElement, NS.P, 'spTree')[0];
    if (!spTree) throw new ProjectError(`幻灯片 ${entry.part} 缺少 spTree`, 'invalid_pptx');
    const elementCounter = { value: 0 };
    await this.walkShapes(spTree, IDENTITY, 0, [], index, slide, rels, context, binding, elementCounter, 0);
    binding.maxShapeId = maxShapeId(slideDoc);
    return slide;
  }

  async walkShapes(container, matrix, groupRot, path, slideIndex, slide, rels, context, binding, counter, depth) {
    const nodes = shapeChildren(container);
    for (let position = 0; position < nodes.length; position += 1) {
      const node = nodes[position];
      const nodePath = [...path, position];
      if (node.localName === 'grpSp') {
        if (hasFlip(node)) {
          this.slideWarn(slideIndex, `镜像组合「${shapeName(node) || '未命名'}」未导入，已保留原样`);
          continue;
        }
        if (depth >= 20) {
          this.slideWarn(slideIndex, '组合嵌套过深，未导入');
          continue;
        }
        const nextMatrix = multiply(matrix, groupMatrix(node));
        const nextRot = groupRot + groupRotation(node);
        await this.walkShapes(node, nextMatrix, nextRot, nodePath, slideIndex, slide, rels, context, binding, counter, depth + 1);
        continue;
      }
      if (slide.elements.length >= MAX_ELEMENTS_PER_SLIDE) {
        this.slideWarn(slideIndex, `元素超过 ${MAX_ELEMENTS_PER_SLIDE} 个，其余元素未导入（导出时保留原样）`);
        return;
      }
      try {
        await this.importLeaf(node, matrix, groupRot, nodePath, slideIndex, slide, rels, context, binding, counter);
      } catch (error) {
        if (error instanceof ProjectError && (error.code === 'unsafe_xml' || error.code === 'limit_exceeded')) throw error;
        this.slideWarn(slideIndex, `元素「${shapeName(node) || '未命名'}」导入失败：${error.message}`);
      }
    }
  }

  async readNotes(part) {
    const doc = await this.readDoc(part).catch(() => null);
    if (!doc) return '';
    const candidates = descendants(doc.documentElement, NS.P, 'sp');
    let fallback = '';
    for (const node of candidates) {
      const ph = placeHolder(node);
      const type = ph ? attr(ph, 'type', 'body') : '';
      if (SKIP_PLACEHOLDERS.has(type)) continue;
      const txBody = firstChild(node, NS.P, 'txBody');
      const text = readTextBody(txBody);
      if (type === 'body' && text) return text;
      if (!fallback && text) fallback = text;
    }
    return fallback;
  }

  geometryFor(node, matrix, groupRot) {
    const rect = rectangleOf(node);
    if (!rect) return null;
    const absolute = absoluteRect(rect, matrix, groupRot);
    return {
      x: emuToUnits(absolute.x, this.cx),
      y: emuToUnits(absolute.y, this.cx),
      w: Math.max(1, emuToUnits(absolute.w, this.cx)),
      h: Math.max(1, emuToUnits(absolute.h, this.cx)),
      rotate: round(absolute.rotate, 2),
      flipH: rect.flipH,
      flipV: rect.flipV,
    };
  }

  geometryFromEmuRect(rect) {
    return {
      x: emuToUnits(rect.x, this.cx),
      y: emuToUnits(rect.y, this.cx),
      w: Math.max(1, emuToUnits(rect.w, this.cx)),
      h: Math.max(1, emuToUnits(rect.h, this.cx)),
      rotate: round(rect.rotate || 0, 2),
      flipH: false,
      flipV: false,
    };
  }

  // Placeholders frequently omit <a:xfrm> on the slide and inherit their box
  // from the layout, then from the master. Dropping those shapes loses real
  // slide text, so resolve the chain explicitly.
  placeholderRect(node, context) {
    const ph = placeHolder(node);
    if (!ph) return null;
    const type = attr(ph, 'type', 'obj');
    const idx = attr(ph, 'idx', '');
    for (const doc of [context.layoutDoc, context.masterDoc]) {
      const candidate = findPlaceholderShape(doc, type, idx);
      if (!candidate) continue;
      const rect = rectangleOf(candidate);
      if (rect && rect.w > 0 && rect.h > 0) return rect;
    }
    return null;
  }

  defaultPlaceholderGeometry(node, context, slideIndex) {
    const ph = placeHolder(node);
    const type = ph ? attr(ph, 'type', 'obj') : 'obj';
    const rect = placeholderStyleKey(type) === 'title'
      ? { x: 628650, y: 365125, w: 7886700, h: 1325563, rotate: 0 }
      : { x: 628650, y: 1825625, w: 7886700, h: 4351338, rotate: 0 };
    this.slideWarn(slideIndex, '占位符未找到布局/母版位置，已使用默认文本框位置');
    return this.geometryFromEmuRect(rect);
  }

  elementId(slideIndex, shapeId, path, slide) {
    const suffix = shapeId ? String(shapeId) : path.join('_');
    const safe = suffix.replace(/[^A-Za-z0-9_-]/g, '_') || 'n';
    let id = `e_${slideIndex + 1}_${safe}`;
    let attempt = 1;
    while (slide.elements.some(element => element.id === id)) {
      attempt += 1;
      id = `e_${slideIndex + 1}_${safe}_${attempt}`;
    }
    return id;
  }

  fitsProject(element) {
    if (element.type === 'shape' && typeof element.text === 'string' && element.text.length > MAX_NOTE) {
      return false;
    }
    try {
      assertProjectLimits({ slides: [{ id: 's_check', note: '', elements: [element] }] });
      return true;
    } catch (error) {
      if (error instanceof ProjectError && error.code === 'limit_exceeded') return false;
      throw error;
    }
  }

  async importLeaf(node, matrix, groupRot, path, slideIndex, slide, rels, context, binding, counter) {
    const kind = node.localName;
    if (kind === 'graphicFrame') {
      await this.importGraphicFrame(node, matrix, groupRot, path, slideIndex, slide, rels, context, binding, counter);
      return;
    }
    let geometry = this.geometryFor(node, matrix, groupRot);
    if (!geometry && kind === 'sp' && placeHolder(node) && isIdentity(matrix)) {
      const rect = this.placeholderRect(node, context);
      geometry = rect
        ? this.geometryFromEmuRect(rect)
        : this.defaultPlaceholderGeometry(node, context, slideIndex);
    }
    if (!geometry) {
      this.slideWarn(slideIndex, `元素「${shapeName(node) || '未命名'}」缺少位置信息，已保留原样`);
      return;
    }
    if (geometry.flipH || geometry.flipV) {
      this.slideWarn(slideIndex, `元素「${shapeName(node) || '未命名'}」包含翻转，未编辑时原样保留；编辑该元素后翻转不会保留`);
    }

    if (kind === 'pic') {
      await this.importPicture(node, geometry, path, slideIndex, slide, rels, binding, counter);
      return;
    }

    const txBody = firstChild(node, NS.P, 'txBody');
    const text = readTextBody(txBody);
    const fieldOnly = hasField(txBody) && !text.trim();
    const ph = placeHolder(node);
    const phType = ph ? attr(ph, 'type', 'body') : '';
    if (SKIP_PLACEHOLDERS.has(phType) || fieldOnly) return;

    const cNvSpPr = descendants(node, NS.P, 'cNvSpPr')[0];
    const isTextBox = attr(cNvSpPr, 'txBox', '') === '1';
    const spPr = firstChild(node, NS.P, 'spPr');
    const prstNode = firstChild(spPr, NS.A, 'prstGeom');
    const prst = attr(prstNode, 'prst', 'rect');
    const mappedShape = SUPPORTED_PRST.get(prst) || null;
    const placeholderText = TEXT_PLACEHOLDERS.has(phType);
    const styleLevels = levelsFromStyle(txBody ? firstChild(txBody, NS.A, 'lstStyle') : null, context);
    const resolvedStyle = this.resolveTextStyle(
      txBody,
      styleLevels,
      phType || null,
      context,
      placeholderText ? this.placeholderStyleChain(node, context) : [],
    );
    if (resolvedStyle.bulleted) {
      this.slideWarn(slideIndex, `文本「${shapeName(node) || text.slice(0, 20) || '未命名'}」的项目符号未纳入编辑模型，预览不显示；未编辑的文字原样保留`);
    }

    const fill = readFill(spPr, context);
    const styleNode = firstChild(node, NS.P, 'style');
    const fillRef = styleNode ? firstChild(styleNode, NS.A, 'fillRef') : null;
    const fillRefIdx = numAttr(fillRef, 'idx', 0);
    const fillColor = fill?.kind === 'solid' && fill.color
      ? fill.color
      : (fillRef && fillRefIdx > 0 ? this.colorFromRef(fillRef) : null);
    const strokeState = this.strokeFor(node, spPr, styleNode);
    // PptxGenJS and PowerPoint emit plain text boxes as rect shapes without
    // txBox="1", but with noFill and an empty <a:ln>. Those are text, not
    // filled shapes; shapes that actually paint a fill or stroke stay shapes.
    const plainTextBox = text.trim().length > 0
      && mappedShape !== 'line'
      && !(fill?.kind === 'solid' || fill?.kind === 'gradient' || fill?.kind === 'pattern')
      && !strokeState.color;
    const wantsText = isTextBox || placeholderText || plainTextBox || (text.trim().length > 0 && !mappedShape);

    let type = 'shape';
    if (wantsText) type = 'text';
    else if (!mappedShape) {
      if (fillColor || strokeState.color || text.trim()) {
        this.slideWarn(slideIndex, `形状「${shapeName(node) || prst}」暂不支持编辑，已保留原样`);
      }
      return;
    } else if (!fillColor && !strokeState.color && !text.trim()) {
      return; // invisible decoration
    }

    const element = {
      id: this.elementId(slideIndex, attr(findCNvPr(node), 'id', ''), path, slide),
      type,
      ...geometry,
    };
    delete element.flipH;
    delete element.flipV;
    if (type === 'text') {
      element.text = text;
      element.fontSize = resolvedStyle.fontSize;
      element.color = resolvedStyle.color;
      element.bold = resolvedStyle.bold;
      element.align = resolvedStyle.align;
      if (resolvedStyle.lineHeight) element.lineHeight = resolvedStyle.lineHeight;
      if (fillColor) element.fill = `#${fillColor}`;
    } else {
      element.shape = mappedShape;
      element.fill = fillColor ? `#${fillColor}` : '#ffffff';
      element.stroke = strokeState.color ? `#${strokeState.color}` : '';
      element.strokeWidth = strokeState.width;
      if (text.trim()) {
        element.text = text;
        element.fontSize = resolvedStyle.fontSize;
        element.color = resolvedStyle.color;
        element.bold = resolvedStyle.bold;
        element.align = resolvedStyle.align;
        if (resolvedStyle.lineHeight) element.lineHeight = resolvedStyle.lineHeight;
      }
    }

    if (!this.fitsProject(element)) {
      this.slideWarn(slideIndex, `元素「${shapeName(node) || element.id}」超过项目容量，已保留原样`);
      return;
    }
    if (element.type === 'shape' && element.shape === 'roundRect') {
      const avLst = firstChild(prstNode, NS.A, 'avLst');
      const guide = avLst ? childrenNs(avLst, NS.A, 'gd').find(item => attr(item, 'name', '') === 'adj') : null;
      const match = guide ? /val\s+(-?\d+(?:\.\d+)?)/.exec(attr(guide, 'fmla', '')) : null;
      const adjustment = match ? Math.max(0, Math.min(50000, Number(match[1]))) : 16667;
      element.radius = round(Math.min(element.w, element.h) * adjustment / 100000, 2);
    }
    this.addElement(slide, element, node, path, binding, null);
  }

  colorFromRef(ref) {
    const child = childElements(ref).find(node => /Clr$/.test(node.localName || ''));
    if (!child) return null;
    return colorFromElement(child, this.currentThemeContext || {});
  }

  strokeFor(node, spPr, styleNode) {
    let color = null;
    let width = 1;
    const ln = firstChild(spPr, NS.A, 'ln');
    if (ln) {
      const fill = readFill(ln, this.currentThemeContext || {});
      if (fill && fill.kind === 'solid' && fill.color) color = fill.color;
      const widthEmu = numAttr(ln, 'w', 0);
      if (widthEmu) width = Math.max(0.25, strokeFromEmu(widthEmu));
    }
    if (!color && styleNode) {
      const lnRef = firstChild(styleNode, NS.A, 'lnRef');
      if (lnRef && numAttr(lnRef, 'idx', 0) > 0) color = this.colorFromRef(lnRef);
    }
    return { color, width: round(Math.max(0, width), 2) };
  }

  addElement(slide, element, node, path, binding, extras) {
    slide.elements.push(element);
    binding.elements[element.id] = {
      shapeId: attr(findCNvPr(node), 'id', '') || null,
      path,
      node: node.localName,
      inGroup: path.length > 0,
      baseline: null,
      ...(extras || {}),
    };
    return element;
  }

  async importPicture(node, geometry, path, slideIndex, slide, rels, binding, counter) {
    const blip = descendants(node, NS.A, 'blip')[0];
    if (!blip) {
      this.slideWarn(slideIndex, '图片缺少 image 数据，已保留原样');
      return;
    }
    const rId = relAttr(blip, 'embed');
    const rel = rId ? rels.get(rId) : null;
    if (!rel || rel.mode === 'External' || !rel.targetPart) {
      this.slideWarn(slideIndex, '图片为外部链接，已保留原样（不联网读取）');
      return;
    }
    const buffer = await readBinaryPart(this.zip, rel.targetPart, { maxBytes: 32 * 1024 * 1024 }).catch(() => null);
    if (!buffer) {
      this.slideWarn(slideIndex, `图片部件 ${rel.targetPart} 缺失，已保留原样`);
      return;
    }
    const info = imageInfo(buffer);
    const src = dataUrlFor(buffer, info.mime);
    if (src.length > MAX_IMAGE_SRC) {
      this.slideWarn(slideIndex, `图片「${shapeName(node) || rel.targetPart}」超过项目容量，已保留原样`);
      return;
    }
    const element = {
      id: this.elementId(slideIndex, attr(findCNvPr(node), 'id', ''), path, slide),
      type: 'image',
      ...geometry,
      src,
      fit: 'cover',
    };
    delete element.flipH;
    delete element.flipV;
    if (!this.fitsProject(element)) {
      this.slideWarn(slideIndex, `图片「${shapeName(node) || element.id}」超过项目容量，已保留原样`);
      return;
    }
    this.addElement(slide, element, node, path, binding, null);
  }

  async importGraphicFrame(node, matrix, groupRot, path, slideIndex, slide, rels, context, binding, counter) {
    const geometry = this.geometryFor(node, matrix, groupRot);
    if (!geometry) return;
    const graphicData = descendants(node, NS.A, 'graphicData')[0];
    const uri = attr(graphicData, 'uri', '');
    if (!graphicData || !uri) return;
    if (uri.endsWith('/table')) {
      this.importTable(node, geometry, path, slideIndex, slide, binding);
      return;
    }
    if (uri.endsWith('/chart')) {
      await this.importChart(node, geometry, path, slideIndex, slide, rels, context, binding);
      return;
    }
    this.slideWarn(slideIndex, `不支持的结构「${shapeName(node) || uri.split('/').pop()}」已保留原样`);
  }

  importTable(node, geometry, path, slideIndex, slide, binding) {
    const tbl = descendants(node, NS.A, 'tbl')[0];
    if (!tbl) return;
    const rowNodes = childrenNs(tbl, NS.A, 'tr');
    const mergeWarning = rowNodes.some(row => childrenNs(row, NS.A, 'tc').some(tc => (
      attr(tc, 'gridSpan', '') !== '' || attr(tc, 'rowSpan', '') !== ''
      || attr(tc, 'hMerge', '') !== '' || attr(tc, 'vMerge', '') !== ''
    )));
    const rows = rowNodes.map(row => childrenNs(row, NS.A, 'tc').map(tc => readTextBody(firstChild(tc, NS.A, 'txBody'))));
    if (!rows.length) {
      this.slideWarn(slideIndex, '表格没有行，已保留原样');
      return;
    }
    const width = Math.max(...rows.map(row => row.length), 0);
    if (rows.length > 60 || width > 12 || rows.some(row => row.some(cell => cell.length > 500))) {
      this.slideWarn(slideIndex, '表格超过项目容量限制，已保留原样（导出时保留原表）');
      return;
    }
    if (mergeWarning) this.slideWarn(slideIndex, '表格包含合并单元格，已按未合并文本导入；编辑该表后合并会丢失');
    const heights = rowNodes.map(row => numAttr(row, 'h', 0)).filter(value => value > 0);
    if (heights.length > 1) {
      const min = Math.min(...heights);
      const max = Math.max(...heights);
      if (min > 0 && max / min > 1.2) this.slideWarn(slideIndex, '表格行高不一致，未编辑时原样保留；编辑该表后按均分行高导出');
    }

    let headerFill = null;
    const firstCell = childrenNs(rowNodes[0], NS.A, 'tc')[0];
    if (firstCell) {
      const tcPr = firstChild(firstCell, NS.A, 'tcPr');
      const fill = readFill(tcPr, this.currentThemeContext || {});
      if (fill?.color) headerFill = fill.color;
    }
    let rowFillWarned = false;
    for (let rowIndex = 1; rowIndex < rowNodes.length && !rowFillWarned; rowIndex += 1) {
      for (const tc of childrenNs(rowNodes[rowIndex], NS.A, 'tc')) {
        const fill = readFill(firstChild(tc, NS.A, 'tcPr'), this.currentThemeContext || {});
        if (fill?.kind === 'solid' && fill.color && fill.color !== 'FFFFFF') {
          this.slideWarn(slideIndex, '表格正文单元格底色未纳入编辑模型，未编辑时原样保留；编辑该表后正文底色为白色');
          rowFillWarned = true;
          break;
        }
      }
    }

    let fontSize = 16;
    let color = '#1f2430';
    let align = 'left';
    // Prefer a body cell: the table model has one text colour and the first row
    // is usually a dark header with white text.
    let sampleCell = null;
    for (let rowIndex = 1; rowIndex < rowNodes.length && !sampleCell; rowIndex += 1) {
      sampleCell = childrenNs(rowNodes[rowIndex], NS.A, 'tc').find(tc => readTextBody(firstChild(tc, NS.A, 'txBody')).trim()) || null;
    }
    if (!sampleCell) {
      sampleCell = childrenNs(rowNodes[0], NS.A, 'tc').find(tc => readTextBody(firstChild(tc, NS.A, 'txBody')).trim());
    }
    if (sampleCell) {
      const txBody = firstChild(sampleCell, NS.A, 'txBody');
      const style = this.resolveTextStyle(txBody, levelsFromStyle(firstChild(txBody, NS.A, 'lstStyle'), this.currentThemeContext), null, this.currentThemeContext);
      fontSize = style.fontSize;
      color = style.color;
      align = style.align;
    }

    const element = {
      id: this.elementId(slideIndex, attr(findCNvPr(node), 'id', ''), path, slide),
      type: 'table',
      ...geometry,
      rows,
      fontSize,
      color,
      headerFill: headerFill ? `#${headerFill}` : '#f3f4f6',
      align,
    };
    delete element.flipH;
    delete element.flipV;
    if (!this.fitsProject(element)) {
      this.slideWarn(slideIndex, '表格超过项目容量限制，已保留原样（导出时保留原表）');
      return;
    }
    this.addElement(slide, element, node, path, binding, null);
  }

  async importChart(node, geometry, path, slideIndex, slide, rels, context, binding) {
    const chartNode = descendants(node, NS.C, 'chart')[0];
    const rId = chartNode ? relAttr(chartNode) : '';
    const rel = rId ? rels.get(rId) : null;
    if (!rel || rel.mode === 'External' || !rel.targetPart) {
      this.slideWarn(slideIndex, '图表缺少部件引用，已保留原样');
      return;
    }
    const text = await readTextPart(this.zip, rel.targetPart).catch(() => null);
    if (!text) {
      this.slideWarn(slideIndex, '图表部件缺失，已保留原样');
      return;
    }
    let parsed;
    try {
      parsed = parseChartXml(text, context);
    } catch (error) {
      if (error instanceof ProjectError && error.code === 'unsafe_xml') throw error;
      this.slideWarn(slideIndex, `图表无法解析：${error.message}`);
      return;
    }
    if (!parsed.ok) {
      this.slideWarn(slideIndex, `图表未纳入编辑模型：${parsed.reason}`);
      return;
    }
    for (const warning of parsed.warnings || []) this.slideWarn(slideIndex, warning);
    const element = {
      id: this.elementId(slideIndex, attr(findCNvPr(node), 'id', ''), path, slide),
      type: 'chart',
      ...geometry,
      chartType: parsed.chartType,
      data: parsed.data,
      fill: '#ffffff',
    };
    delete element.flipH;
    delete element.flipV;
    if (!this.fitsProject(element)) {
      this.slideWarn(slideIndex, '图表超过项目容量限制，已保留原样');
      return;
    }
    this.addElement(slide, element, node, path, binding, {
      chartPart: rel.targetPart,
      chartRels: relsPath(rel.targetPart),
      chartColors: parsed.colors,
    });
  }

  async readCoreTitle() {
    const doc = await this.readDoc('docProps/core.xml').catch(() => null);
    if (!doc) return '';
    const title = descendants(doc.documentElement, NS.DC, 'title')[0];
    return title ? title.textContent.trim() : '';
  }

  async run() {
    await this.loadPackage();
    const slides = [];
    for (let index = 0; index < this.slideEntries.length; index += 1) {
      slides.push(await this.importSlide(this.slideEntries[index], index));
    }

    const height = round(this.cy * 1000 / this.cx, 4);
    const boundedHeight = Math.min(2000, Math.max(300, height));
    if (boundedHeight !== height) this.warn(`幻灯片高度 ${height} 超出项目画布范围，已按 ${boundedHeight} 导入`);

    const themeContext = this.currentThemeContext || { theme: { fonts: {} }, backgroundColor: 'FFFFFF', defaultTextColor: '1F2430', themeColors: [] };
    const accentColors = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'dk2', 'lt2', 'hlink', 'folHlink']
      .map(name => themeContext.theme?.colors?.[name])
      .filter(Boolean)
      .map(color => `#${color}`);
    const theme = {
      backgroundColor: `#${themeContext.backgroundColor || 'FFFFFF'}`,
      fontColor: `#${themeContext.defaultTextColor || '1F2430'}`,
      fontName: themeContext.theme?.fonts?.minor || themeContext.theme?.fonts?.major || 'Inter',
    };
    if (accentColors.length) theme.themeColors = accentColors;

    const coreTitle = await this.readCoreTitle();
    const fallbackTitle = String(this.filename || '').replace(/\.pptx$/i, '').trim();
    const title = this.title || coreTitle || fallbackTitle || '导入的演示文稿';

    const raw = {
      title,
      viewport: { width: 1000, height: boundedHeight },
      theme,
      slides,
    };
    if (Object.keys(this.backdrops).length) raw.backdrops = this.backdrops;
    const canonical = normalizeProject(raw, { keepId: false });
    assertProjectLimits(canonical);

    // Rebase every element baseline on the canonical model so an untouched
    // import (and every later Store normalization) compares equal.
    for (let index = 0; index < canonical.slides.length; index += 1) {
      const slide = canonical.slides[index];
      const binding = this.bindings.slides[slide.id];
      if (!binding) continue;
      binding.noteBaseline = slide.note || '';
      binding.background = slide.background || null;
      for (const element of slide.elements) {
        const entryBinding = binding.elements[element.id];
        if (!entryBinding) continue;
        entryBinding.baseline = baselineOf(element);
      }
    }

    this.bindings.canvas = {
      cx: this.cx,
      cy: this.cy,
      width: 1000,
      height: canonical.viewport.height,
    };
    this.bindings.package = {
      presentation: this.parts.presentation,
      presentationRels: this.parts.presentationRels,
      contentTypes: this.parts.contentTypes,
      theme: this.parts.theme || null,
      notesMaster: this.parts.notesMaster || null,
      defaultLayout: this.parts.defaultLayout || null,
      defaultLayoutRels: this.parts.defaultLayoutRels || null,
    };
    this.bindings.order = canonical.slides.map(slide => slide.id);
    this.bindings.formatVersion = 2;

    const template = {
      title: canonical.title,
      viewport: canonical.viewport,
      theme: canonical.theme,
      slides: canonical.slides,
    };
    if (canonical.backdrops) template.backdrops = canonical.backdrops;

    return {
      template,
      warnings: this.warnings,
      bindings: this.bindings,
    };
  }
}

function maxShapeId(doc) {
  let max = 1;
  for (const node of descendants(doc.documentElement, NS.P, 'cNvPr')) {
    const id = Number.parseInt(attr(node, 'id', ''), 10);
    if (Number.isInteger(id) && id > max) max = id;
  }
  return max;
}

function baselineOf(element) {
  const copy = structuredClone(element);
  if (copy.type === 'image' && typeof copy.src === 'string') {
    copy.src = `sha256:${sha256(copy.src)}`;
  }
  return copy;
}

export async function importPptx(buffer, options = {}) {
  const bytes = toBuffer(buffer);
  if (!bytes || !bytes.length) throw new ProjectError('PPTX 文件为空', 'invalid_pptx');
  if (bytes.length > PPTX_LIMITS.maxBytes) {
    throw new ProjectError('PPTX 文件超过 50 MiB 限制', 'limit_exceeded');
  }
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ProjectError('无法解析 PPTX：文件不是有效的 ZIP 包', 'invalid_pptx');
  }
  await validateZip(zip, { maxEntries: PPTX_LIMITS.maxEntries, maxUncompressed: PPTX_LIMITS.maxUncompressed });
  if (!zip.file('[Content_Types].xml')) {
    throw new ProjectError('PPTX 缺少 [Content_Types].xml', 'invalid_pptx');
  }
  const context = new ImportContext(zip, bytes, options);
  return context.run();
}
