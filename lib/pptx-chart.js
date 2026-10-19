// Chart cache parsing and native DrawingML chart generation.
// This is intentionally self contained: imported chart data comes from the
// cached values inside the original chart part, never from an external sheet.
import {
  NS, attr, childElements, childrenNs, firstChild, numAttr, readFill,
  normalizeHex, parseXml, xmlEscape,
} from './pptx-xml.js';
import { ProjectError } from './project.js';

export const CHART_TYPES = ['bar', 'column', 'line', 'pie', 'doughnut', 'area', 'radar', 'scatter'];
export const CHART_LIMITS = { maxLabels: 60, maxSeries: 12, maxValues: 60 };

const PLOT_TYPES = {
  barChart: 'column',
  lineChart: 'line',
  pieChart: 'pie',
  doughnutChart: 'doughnut',
  areaChart: 'area',
  radarChart: 'radar',
  scatterChart: 'scatter',
};

const UNSUPPORTED_PLOTS = new Set([
  'bar3DChart', 'line3DChart', 'pie3DChart', 'area3DChart', 'ofPieChart',
  'bubbleChart', 'stockChart', 'surfaceChart', 'surface3DChart',
]);

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pointsFromCache(cache, asString) {
  const count = numAttr(firstChild(cache, NS.C, 'ptCount'), 'val', 0);
  const values = [];
  for (const pt of childrenNs(cache, NS.C, 'pt')) {
    const index = Number.parseInt(attr(pt, 'idx', ''), 10);
    if (!Number.isInteger(index) || index < 0 || index > CHART_LIMITS.maxValues * 4) continue;
    const valueNode = firstChild(pt, NS.C, 'v');
    const raw = valueNode ? valueNode.textContent : '';
    values[index] = asString ? String(raw ?? '') : numeric(raw);
  }
  const length = Math.max(count, values.length);
  for (let index = 0; index < length; index += 1) {
    if (values[index] === undefined) values[index] = asString ? '' : 0;
  }
  return values.slice(0, length);
}

function readCache(container) {
  if (!container) return { missing: true };
  for (const child of childElements(container)) {
    if (child.localName === 'multiLvlStrRef') return { error: '多级分类标签' };
    if (child.localName === 'strRef' || child.localName === 'numRef') {
      const cache = childElements(child).find(node => node.localName.endsWith('Cache'));
      if (!cache) return { missing: true };
      return { values: pointsFromCache(cache, child.localName === 'strRef') };
    }
    if (child.localName === 'strLit' || child.localName === 'numLit') {
      return { values: pointsFromCache(child, child.localName === 'strLit') };
    }
  }
  return { missing: true };
}

function seriesName(ser) {
  const tx = firstChild(ser, NS.C, 'tx');
  if (!tx) return '';
  const ref = childElements(tx).find(node => node.localName === 'strRef' || node.localName === 'numRef');
  if (ref) {
    const cache = childElements(ref).find(node => node.localName.endsWith('Cache'));
    const first = cache ? childrenNs(cache, NS.C, 'pt')[0] : null;
    const value = first ? firstChild(first, NS.C, 'v') : null;
    return value ? value.textContent : '';
  }
  const value = firstChild(tx, NS.C, 'v');
  return value ? value.textContent : '';
}

function seriesColor(ser, context) {
  const fill = readFill(firstChild(ser, NS.C, 'spPr'), context);
  return fill && fill.kind !== 'none' && fill.color ? `#${fill.color}` : null;
}

// Parses the cached chart data required by the editor model. Charts without
// caches (linked spreadsheets) are reported as unsupported instead of guessed.
export function parseChartXml(text, context = {}, limits = CHART_LIMITS) {
  const doc = parseXml(text, '图表部件');
  const root = doc.documentElement;
  const chart = firstChild(root, NS.C, 'chart');
  const plotArea = firstChild(chart, NS.C, 'plotArea');
  if (!plotArea) return { ok: false, reason: '图表缺少 plotArea' };

  let plot = null;
  let plotName = '';
  for (const node of childElements(plotArea)) {
    if (UNSUPPORTED_PLOTS.has(node.localName)) {
      return { ok: false, reason: `不支持 ${node.localName} 图表` };
    }
    if (PLOT_TYPES[node.localName]) {
      plot = node;
      plotName = node.localName;
      break;
    }
  }
  if (!plot) return { ok: false, reason: '未识别的图表类型' };

  let chartType = PLOT_TYPES[plotName];
  if (plotName === 'barChart') {
    const direction = attr(firstChild(plot, NS.C, 'barDir'), 'val', 'col');
    chartType = direction === 'bar' ? 'bar' : 'column';
  }

  const series = childrenNs(plot, NS.C, 'ser');
  if (!series.length) return { ok: false, reason: '图表没有数据系列' };
  if (series.length > limits.maxSeries) {
    return { ok: false, reason: `图表系列数（${series.length}）超过 ${limits.maxSeries} 限制` };
  }

  const isScatter = chartType === 'scatter';
  const labelsResult = readCache(firstChild(series[0], NS.C, isScatter ? 'xVal' : 'cat'));
  if (labelsResult.error) return { ok: false, reason: labelsResult.error };
  if (labelsResult.missing) return { ok: false, reason: '图表缺少分类缓存数据' };
  if (labelsResult.values.length > limits.maxLabels) {
    return { ok: false, reason: `图表分类数（${labelsResult.values.length}）超过 ${limits.maxLabels} 限制` };
  }

  const warnings = [];
  const labels = labelsResult.values.map(value => String(value ?? ''));
  if (!labels.length) return { ok: false, reason: '图表分类为空' };

  const used = chartType === 'pie' || chartType === 'doughnut' ? series.slice(0, 1) : series;
  if (used.length !== series.length) warnings.push('饼图/环形图仅导入第一个数据系列');

  const data = { labels, series: [] };
  const colors = [];
  for (const ser of used) {
    const valueResult = readCache(firstChild(ser, NS.C, isScatter ? 'yVal' : 'val'));
    if (valueResult.error) return { ok: false, reason: valueResult.error };
    if (valueResult.missing) return { ok: false, reason: '图表缺少数值缓存数据' };
    if (valueResult.values.length > limits.maxValues) {
      return { ok: false, reason: `图表数值数（${valueResult.values.length}）超过 ${limits.maxValues} 限制` };
    }
    if (valueResult.values.length !== labels.length) {
      warnings.push('图表标签与数值数量不一致，请修正数据');
    }
    data.series.push({
      name: seriesName(ser),
      values: valueResult.values.map(value => numeric(value)),
    });
    colors.push(seriesColor(ser, context));
  }

  return { ok: true, chartType, data, colors: colors.filter(Boolean), warnings };
}

// ---------------------------------------------------------------------------
// Generation

function colorAt(colors, index, fallback = '#E24B2B') {
  const value = colors && colors.length ? colors[index % colors.length] : fallback;
  const hex = normalizeHex(value) || 'E24B2B';
  return hex;
}

function categoryXml(labels) {
  const points = labels.map((label, index) => `<c:pt idx="${index}"><c:v>${xmlEscape(label)}</c:v></c:pt>`).join('');
  return `<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$${labels.length + 1}</c:f><c:strCache><c:ptCount val="${labels.length}"/>${points}</c:strCache></c:strRef></c:cat>`;
}

function valuesXml(values, column, tag = 'val') {
  const letter = column;
  const points = values.map((value, index) => `<c:pt idx="${index}"><c:v>${numeric(value)}</c:v></c:pt>`).join('');
  return `<c:${tag}><c:numRef><c:f>Sheet1!$${letter}$2:$${letter}$${values.length + 1}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${points}</c:numCache></c:numRef></c:${tag}>`;
}

function seriesRef(name, column) {
  return `<c:tx><c:strRef><c:f>Sheet1!$${column}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEscape(name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`;
}

function seriesFill(hex) {
  return `<c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></c:spPr>`;
}

function catAxis(id, crossId, position = 'b') {
  return `<c:catAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${position}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${crossId}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>`;
}

function valAxis(id, crossId, position = 'l') {
  return `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${position}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${crossId}"/><c:crosses val="autoZero"/></c:valAx>`;
}

export function buildChartXml({ chartType = 'column', data = {}, colors = [] } = {}) {
  const labels = Array.isArray(data.labels) ? data.labels.map(label => String(label ?? '')) : [];
  let series = Array.isArray(data.series) ? data.series : [];
  if (!labels.length || !series.length) {
    throw new ProjectError('图表需要标签和至少一个数据系列', 'invalid');
  }
  const type = CHART_TYPES.includes(chartType) ? chartType : 'column';

  series = series.map((entry, index) => ({
    name: String(entry?.name || `系列 ${index + 1}`),
    values: Array.isArray(entry?.values) ? entry.values.map(value => numeric(value)) : [],
  }));
  if (type === 'pie' || type === 'doughnut') series = series.slice(0, 1);
  if (!series.length) throw new ProjectError('图表没有数据系列', 'invalid');
  if (labels.length > CHART_LIMITS.maxLabels || series.length > CHART_LIMITS.maxSeries) {
    throw new ProjectError('图表数据超过项目容量限制', 'limit_exceeded');
  }
  for (const entry of series) {
    if (entry.values.length !== labels.length) {
      throw new ProjectError('图表标签与数值数量不一致', 'invalid');
    }
    if (entry.values.length > CHART_LIMITS.maxValues) {
      throw new ProjectError('图表数值超过项目容量限制', 'limit_exceeded');
    }
  }

  const ax1 = 1000001;
  const ax2 = 1000002;
  let plot = '';
  if (type === 'bar' || type === 'column') {
    const serXml = series.map((entry, index) => {
      const column = String.fromCharCode(66 + (index % 24));
      return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/>${seriesRef(entry.name, column)}${seriesFill(colorAt(colors, index))}${categoryXml(labels)}${valuesXml(entry.values, column)}</c:ser>`;
    }).join('');
    plot = `<c:barChart><c:barDir val="${type === 'bar' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${serXml}<c:gapWidth val="150"/><c:overlap val="0"/><c:axId val="${ax1}"/><c:axId val="${ax2}"/></c:barChart>${catAxis(ax1, ax2)}${valAxis(ax2, ax1)}`;
  } else if (type === 'line' || type === 'area') {
    const tag = type === 'line' ? 'lineChart' : 'areaChart';
    const serXml = series.map((entry, index) => {
      const column = String.fromCharCode(66 + (index % 24));
      return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/>${seriesRef(entry.name, column)}${seriesFill(colorAt(colors, index))}${categoryXml(labels)}${valuesXml(entry.values, column)}<c:smooth val="0"/></c:ser>`;
    }).join('');
    plot = `<c:${tag}><c:grouping val="standard"/><c:varyColors val="0"/>${serXml}<c:marker val="1"/><c:axId val="${ax1}"/><c:axId val="${ax2}"/></c:${tag}>${catAxis(ax1, ax2, 'b')}${valAxis(ax2, ax1)}`;
  } else if (type === 'radar') {
    const serXml = series.map((entry, index) => {
      const column = String.fromCharCode(66 + (index % 24));
      return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/>${seriesRef(entry.name, column)}${seriesFill(colorAt(colors, index))}${categoryXml(labels)}${valuesXml(entry.values, column)}</c:ser>`;
    }).join('');
    plot = `<c:radarChart><c:radarStyle val="marker"/><c:varyColors val="0"/>${serXml}<c:axId val="${ax1}"/><c:axId val="${ax2}"/></c:radarChart>${catAxis(ax1, ax2, 'b')}${valAxis(ax2, ax1)}`;
  } else if (type === 'pie' || type === 'doughnut') {
    const entry = series[0];
    const column = 'B';
    const serXml = `<c:ser><c:idx val="0"/><c:order val="0"/>${seriesRef(entry.name, column)}${seriesFill(colorAt(colors, 0))}${categoryXml(labels)}${valuesXml(entry.values, column)}</c:ser>`;
    plot = type === 'pie'
      ? `<c:pieChart><c:varyColors val="1"/>${serXml}<c:firstSliceAng val="0"/></c:pieChart>`
      : `<c:doughnutChart><c:varyColors val="1"/>${serXml}<c:holeSize val="60"/></c:doughnutChart>`;
  } else {
    const xValues = labels.map((label, index) => {
      const value = Number(label);
      return Number.isFinite(value) ? value : index + 1;
    });
    const xCache = xValues.map((value, index) => `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`).join('');
    const xRef = `<c:xVal><c:numRef><c:f>Sheet1!$A$2:$A$${xValues.length + 1}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${xValues.length}"/>${xCache}</c:numCache></c:numRef></c:xVal>`;
    const serXml = series.map((entry, index) => {
      const column = String.fromCharCode(66 + (index % 24));
      return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/>${seriesRef(entry.name, column)}${seriesFill(colorAt(colors, index))}${xRef}${valuesXml(entry.values, column, 'yVal')}</c:ser>`;
    }).join('');
    plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${serXml}<c:axId val="${ax1}"/><c:axId val="${ax2}"/></c:scatterChart>${valAxis(ax1, ax2, 'b')}${valAxis(ax2, ax1, 'l')}`;
  }

  const showLegend = type === 'pie' || type === 'doughnut' || series.length > 1;
  const legend = showLegend ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${NS.C}" xmlns:a="${NS.A}" xmlns:r="${NS.R}"><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}
