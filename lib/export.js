// Converts a PptProject into a native, editable PPTX with PptxGenJS.
// Text, basic shapes, tables and common chart types stay as PowerPoint objects;
// anything the library cannot express is reported instead of silently rasterised.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import PptxGenJS from 'pptxgenjs';

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
  const options = {
    x: x(element.x),
    y: x(element.y),
    w: x(element.w),
    h: x(element.h),
    fill: element.shape === 'line' ? { color: 'FFFFFF', transparency: 100 } : { color: toHex(element.fill, 'F3F4F6') },
  };
  if (element.stroke) {
    options.line = { color: toHex(element.stroke, '000000'), width: Math.max(1, Math.round((element.strokeWidth ?? 1) * PT_PER_PX)) };
  } else if (element.shape === 'line') {
    options.line = { color: '1F2430', width: 2 };
  }
  if (element.rotate) options.rotate = Math.round(element.rotate);
  slide.addShape(shape, options);
  if (typeof element.text === 'string' && element.text.trim()) {
    slide.addText(element.text, {
      ...textOptions({ ...element, text: element.text }, fontFace),
      align: element.align ?? 'center',
      valign: 'middle',
    });
  }
}

function addImage(slide, element) {
  const source = /^data:image\//.test(element.src) ? { data: element.src } : { path: element.src };
  const options = {
    ...source,
    x: x(element.x),
    y: x(element.y),
    w: x(element.w),
    h: x(element.h),
    sizing: {
      type: element.fit === 'contain' ? 'contain' : 'cover',
      w: x(element.w),
      h: x(element.h),
    },
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
        else if (element.type === 'image') addImage(target, element);
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
  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  await writeFile(path, buffer);
  return { path, filename, bytes: buffer.length, warnings, slides: project.slides.length };
}
