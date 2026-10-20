// Converts a PptProject into a native, editable PPTX with PptxGenJS.
// Text, basic shapes, tables and common chart types stay as PowerPoint objects;
// anything the library cannot express is reported instead of silently rasterised.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { NS, attr, descendants, firstChild, parseXml, serializeXml } from './pptx-xml.js';

const INCH_PER_UNIT = 1 / 100; // 1000 logical units = 10in wide
const PT_PER_PX = 0.75;

const toHex = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const match = value.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!match) return fallback;
  const hex = match[1].length === 3 ? match[1].split('').map(c => c + c).join('') : match[1];
  return hex.toUpperCase();
};

const x = (units) => units * INCH_PER_UNIT;
const pt = (px) => Math.max(6, Math.round(px * PT_PER_PX));

function imageSizeFromBuffer(buffer) {
  if (!buffer || buffer.length < 24) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { w: buffer.readUInt16BE(offset + 7), h: buffer.readUInt16BE(offset + 5) };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
    return null;
  }
  if (buffer.toString('ascii', 0, 3) === 'GIF') {
    return { w: buffer.readUInt16LE(6), h: buffer.readUInt16LE(8) };
  }
  return null;
}

async function imageSize(src) {
  if (typeof src !== 'string') return null;
  const match = /^data:image\/[^;]+;base64,(.+)$/i.exec(src);
  try {
    if (match) return imageSizeFromBuffer(Buffer.from(match[1], 'base64'));
    if (/^https?:\/\//i.test(src)) return null;
    return imageSizeFromBuffer(await readFile(src));
  } catch {
    return null;
  }
}

const CHART_TYPES = {
  bar: 'bar',
  column: 'bar',
  line: 'line',
  pie: 'pie',
  doughnut: 'doughnut',
  area: 'area',
  radar: 'radar',
  scatter: 'scatter',
};

export function sanitizeFilename(title) {
  const cleaned = String(title ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'presentation';
}

function fontSizeFor(element) {
  return pt(element.fontSize ?? 24);
}

function textOptions(element, fontFace) {
  const options = {
    x: x(element.x),
    y: x(element.y),
    w: x(element.w),
    h: x(element.h),
    fontSize: fontSizeFor(element),
    color: toHex(element.color, '1F2430'),
    bold: element.bold === true,
    align: element.align ?? 'left',
    valign: 'top',
    margin: 0,
    fontFace: fontFace || undefined,
    wrap: true,
    autoFit: false,
  };
  if (element.fill) options.fill = { color: toHex(element.fill, 'FFFFFF') };
  if (typeof element.lineHeight === 'number') options.lineSpacingMultiple = element.lineHeight;
  if (element.rotate) options.rotate = Math.round(element.rotate);
  return options;
}

function addText(slide, element, fontFace) {
  slide.addText(String(element.text ?? ''), textOptions(element, fontFace));
}

function addShape(slide, element, fontFace) {
  const shape = element.shape === 'ellipse' ? 'ellipse' : element.shape === 'line' ? 'line' : element.shape === 'roundRect' ? 'roundRect' : 'rect';
  const shortest = Math.max(1, Math.min(element.w, element.h));
  const radius = Math.min(Math.max(Number(element.radius) || 0, 0), shortest / 2);
  // PptxGenJS ignores rectRadius=0 (falls back to the preset default), so a
  // square-cornered rounded rectangle is emitted as the equivalent rect.
  const resolvedShape = shape === 'roundRect' && radius <= 0 ? 'rect' : shape;
  const options = {
    x: x(element.x),
    y: x(element.y),
    w: x(element.w),
    h: x(element.h),
    fill: element.shape === 'line' ? { color: 'FFFFFF', transparency: 100 } : { color: toHex(element.fill, 'F3F4F6') },
    objectName: element.id,
  };
  if (resolvedShape === 'roundRect') options.rectRadius = x(radius);
  if (element.shape === 'line') {
    options.line = {
      color: toHex(element.stroke, '1F2430'),
      width: Math.max(1, Math.round((element.strokeWidth ?? 1) * PT_PER_PX)),
    };
  } else if (element.stroke && (element.strokeWidth ?? 0) > 0) {
    options.line = { color: toHex(element.stroke, '1F2430'), width: Math.max(1, Math.round(element.strokeWidth * PT_PER_PX)) };
  }
  if (element.rotate) options.rotate = Math.round(element.rotate);
  slide.addShape(resolvedShape, options);
  if (typeof element.text === 'string' && element.text.trim()) {
    slide.addText(element.text, {
      ...textOptions({ ...element, text: element.text }, fontFace),
      align: element.align ?? 'center',
      valign: 'middle',
    });
  }
}

function addImage(slide, element, intrinsic) {
  const source = /^data:image\//.test(element.src) ? { data: element.src } : { path: element.src };
  const targetW = x(element.w);
  const targetH = x(element.h);
  let boxW = targetW;
  let boxH = targetH;
  let sizing;
  if (intrinsic && intrinsic.w > 0 && intrinsic.h > 0) {
    const imageRatio = intrinsic.h / intrinsic.w;
    const boxRatio = targetH / targetW;
    if (element.fit === 'contain') {
      if (boxRatio > imageRatio) boxH = targetW * imageRatio;
      else boxW = targetH / imageRatio;
    } else {
      if (boxRatio > imageRatio) boxW = targetH / imageRatio;
      else boxH = targetW * imageRatio;
    }
    sizing = { type: element.fit === 'contain' ? 'contain' : 'cover', w: targetW, h: targetH };
  }
  const options = {
    ...source,
    x: x(element.x),
    y: x(element.y),
    w: boxW,
    h: boxH,
    ...(sizing ? { sizing } : {}),
    objectName: element.id,
  };
  if (element.rotate) options.rotate = Math.round(element.rotate);
  slide.addImage(options);
}

function addChart(slide, element) {
  const data = element.data ?? { labels: [], series: [] };
  if (!data.labels.length || !data.series.length) throw new Error('chart needs labels and at least one series');
  const type = CHART_TYPES[element.chartType] ?? 'bar';

  let series;
  if (element.chartType === 'scatter') {
    const xValues = (data.labels || []).map(v => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    });
    series = [
      { name: 'X-Axis', values: xValues.length ? xValues : [0] },
      ...data.series.map((entry, index) => ({
        name: entry.name || `系列 ${index + 1}`,
        values: entry.values || [],
      })),
    ];
  } else if (element.chartType === 'pie' || element.chartType === 'doughnut') {
    const first = data.series[0] || { name: '系列 1', values: [] };
    series = [{
      name: first.name || '系列 1',
      labels: data.labels.slice(0, first.values.length || data.labels.length),
      values: first.values,
    }];
  } else {
    series = data.series.map((entry, index) => ({
      name: entry.name || `系列 ${index + 1}`,
      labels: data.labels.slice(0, entry.values.length || data.labels.length),
      values: entry.values,
    }));
  }

  const options = {
    x: x(element.x),
    y: x(element.y),
    w: x(element.w),
    h: x(element.h),
    showTitle: false,
    showLegend: series.length > 1,
    showValue: false,
  };
  const colors = (element.themeColors ?? []).map(c => toHex(c, 'E24B2B')).filter(Boolean);
  if (colors.length) options.chartColors = colors;
  if (element.chartType === 'column') options.barDir = 'col';
  if (element.chartType === 'bar') options.barDir = 'bar';
  if (element.rotate) options.rotate = Math.round(element.rotate);
  slide.addChart(type, series, options);
}

function addTable(slide, element, fontFace) {
  const rawRows = element.rows ?? [];
  if (!rawRows.length) throw new Error('table has no rows');
  const width = Math.max(...rawRows.map(row => (Array.isArray(row) ? row.length : 0)), 1);

  const normalized = rawRows.map((row, rIndex) => {
    const copy = Array.isArray(row) ? row.slice(0, width) : [];
    while (copy.length < width) copy.push('');
    const isHeader = rIndex === 0;
    return copy.map(cell => ({
      text: String(cell ?? ''),
      options: {
        fontSize: pt(element.fontSize ?? 16),
        color: toHex(element.color, '1F2430'),
        fill: { color: isHeader ? toHex(element.headerFill, 'F3F4F6') : 'FFFFFF' },
        valign: 'middle',
        align: element.align ?? 'left',
        fontFace: fontFace || undefined,
      },
    }));
  });

  slide.addTable(normalized, {
    x: x(element.x),
    y: x(element.y),
    w: x(element.w),
    colW: undefined,
    rowH: Math.max(0.2, (element.h * INCH_PER_UNIT) / Math.max(rawRows.length, 1)),
    border: { type: 'solid', color: 'D8D8DE', pt: 1 },
    margin: 2,
    autoPage: false,
    objectName: element.id,
  });
}

// Returns the written file path plus the elements that could not be represented natively.
export async function buildPptx(project, { outDir }) {
  const pptx = new PptxGenJS();
  const ratio = (project.viewport?.height ?? 562.5) / (project.viewport?.width ?? 1000);
  const widthIn = 10;
  pptx.defineLayout({ name: 'PPT_STUDIO', width: widthIn, height: widthIn * ratio });
  pptx.layout = 'PPT_STUDIO';
  pptx.author = 'PPT Studio';
  pptx.title = project.title ?? 'presentation';

  const fontFace = project.theme?.fontName || 'Inter';

  const imageSizes = new Map();
  for (const slide of project.slides ?? []) {
    for (const element of slide.elements ?? []) {
      if (element.type !== 'image' || imageSizes.has(element.id)) continue;
      imageSizes.set(element.id, await imageSize(element.src));
    }
  }

  const warnings = [];
  project.slides.forEach((slide, index) => {
    const target = pptx.addSlide();
    const background = slide.background || project.theme?.backgroundColor;
    if (background) target.background = { color: toHex(background, 'FFFFFF') };
    const backdrop = project.backdrops?.[slide.backdropId];
    if (backdrop) target.addImage({ data: backdrop, x: 0, y: 0, w: x(project.viewport.width), h: x(project.viewport.height) });
    for (const element of slide.elements ?? []) {
      try {
        if (element.type === 'text') addText(target, element, fontFace);
        else if (element.type === 'shape') addShape(target, element, fontFace);
        else if (element.type === 'image') addImage(target, element, imageSizes.get(element.id));
        else if (element.type === 'chart') addChart(target, element);
        else if (element.type === 'table') addTable(target, element, fontFace);
        else warnings.push(`第 ${index + 1} 页：跳过未知元素 ${element.type}`);
      } catch (error) {
        warnings.push(`第 ${index + 1} 页元素 ${element.id}：${error.message}`);
      }
    }
    if (slide.note) target.addNotes(String(slide.note));
  });

  const dir = join(outDir, project.id);
  await mkdir(dir, { recursive: true });
  const filename = `${sanitizeFilename(project.title)}-r${project.revision}.pptx`;
  const path = join(dir, filename);
  const raw = await pptx.write({ outputType: 'nodebuffer' });
  const buffer = await applyTableRotation(raw, project);
  await writeFile(path, buffer);
  return { path, filename, bytes: buffer.length, warnings, slides: project.slides.length };
}

// PptxGenJS cannot rotate tables, so patch the generated graphicFrame by the
// stable object name it writes for each table.
async function applyTableRotation(buffer, project) {
  const rotations = new Map();
  for (const slide of project.slides ?? []) {
    for (const element of slide.elements ?? []) {
      if (element.type !== 'table' || !Number(element.rotate)) continue;
      rotations.set(element.id, Math.round(Number(element.rotate) * 60000));
    }
  }
  if (!rotations.size) return buffer;
  const zip = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(zip.files)) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(name)) continue;
    const text = await zip.file(name).async('string');
    const doc = parseXml(text, name);
    let changed = false;
    for (const frame of descendants(doc.documentElement, NS.P, 'graphicFrame')) {
      const props = firstChild(frame, NS.P, 'nvGraphicFramePr');
      const idNode = props ? firstChild(props, NS.P, 'cNvPr') : null;
      const rot = idNode ? rotations.get(attr(idNode, 'name', '')) : null;
      if (!rot) continue;
      const xfrm = firstChild(frame, NS.P, 'xfrm');
      if (!xfrm) continue;
      xfrm.setAttribute('rot', String(rot));
      changed = true;
    }
    if (changed) zip.file(name, serializeXml(doc));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
