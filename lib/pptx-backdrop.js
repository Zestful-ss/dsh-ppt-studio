// Read-only backdrop renderer for inherited master/layout decorations.
//
// Slides inherit non-placeholder shapes, pictures and static text from their
// layout (and the master). Those decorations are not editable slide content,
// but without them white titles disappear on the real blue header. The preview
// therefore gets a transparent SVG built from those decorations. Nothing is
// added to the ZIP: export keeps the original master/layout untouched.
import {
  NS, firstChild, childElements, childrenNs, descendants, attr, numAttr, relAttr,
  readFill, colorFromElement, resolveSchemeColor, groupMatrix, groupXfrm,
  xmlEscape, xmlAttr, imageInfo,
} from './pptx-xml.js';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const SHAPE_NODES = new Set(['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp']);

function placeHolder(node) {
  const nvPr = descendants(node, NS.P, 'nvPr')[0];
  return nvPr ? firstChild(nvPr, NS.P, 'ph') : null;
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
    rot: numAttr(xfrm, 'rot') / 60000,
    flipH: attr(xfrm, 'flipH') === '1',
    flipV: attr(xfrm, 'flipV') === '1',
  };
}

function readParagraphText(paragraph) {
  let text = '';
  for (const node of childElements(paragraph)) {
    if (node.localName === 'r' || node.localName === 't') {
      for (const item of descendants(node, NS.A, 't')) text += item.textContent || '';
    } else if (node.localName === 'br') {
      text += '\n';
    } else if (node.localName === 'tab') {
      text += '\t';
    }
  }
  return text;
}

function readTextBody(txBody) {
  if (!txBody) return '';
  return childrenNs(txBody, NS.A, 'p').map(readParagraphText).join('\n');
}

function runProps(node, context) {
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
    const face = attr(latin, 'typeface', '');
    if (face) out.font = face;
  }
  return out;
}

function resolveFont(face, theme) {
  if (!face) return theme.fonts.minor || theme.fonts.major || '';
  if (face.startsWith('+mj')) return theme.fonts.major || theme.fonts.minor || '';
  if (face.startsWith('+mn')) return theme.fonts.minor || theme.fonts.major || '';
  return face;
}

function alignment(value) {
  return value === 'ctr' ? 'center' : value === 'r' ? 'right' : 'left';
}

function decorationTextStyle(node, masterDoc, context) {
  const txBody = firstChild(node, NS.P, 'txBody');
  const text = readTextBody(txBody).trim();
  if (!txBody || !text) return null;
  const paragraphs = childrenNs(txBody, NS.A, 'p');
  const chosen = paragraphs.find(paragraph => readParagraphText(paragraph).trim()) || paragraphs[0] || null;
  const pPr = chosen ? firstChild(chosen, NS.A, 'pPr') : null;
  const runs = chosen ? childrenNs(chosen, NS.A, 'r') : [];
  const runRPr = runs.length ? firstChild(runs[0], NS.A, 'rPr') : null;
  const endRPr = chosen ? firstChild(chosen, NS.A, 'endParaRPr') : null;
  const styleRoot = firstChild(txBody, NS.A, 'lstStyle');
  const lvl = styleRoot ? firstChild(styleRoot, NS.A, 'lvl1pPr') : null;
  const shapeDef = lvl ? firstChild(lvl, NS.A, 'defRPr') : null;
  const pDef = pPr ? firstChild(pPr, NS.A, 'defRPr') : null;

  let masterDef = null;
  if (masterDoc) {
    const txStyles = descendants(masterDoc.documentElement, NS.P, 'txStyles')[0];
    const other = txStyles ? firstChild(txStyles, NS.P, 'otherStyle') : null;
    const masterLvl = other ? firstChild(other, NS.A, 'lvl1pPr') : null;
    masterDef = masterLvl ? firstChild(masterLvl, NS.A, 'defRPr') : null;
  }

  const props = {
    sz: 1800,
    bold: false,
    color: resolveSchemeColor('tx1', context) || '000000',
    font: context.theme.fonts.minor || '',
    ...runProps(masterDef, context),
    ...runProps(shapeDef, context),
    ...runProps(pDef, context),
    ...runProps(endRPr, context),
    ...runProps(runRPr, context),
  };
  const align = alignment(attr(pPr, 'algn', '') || attr(lvl, 'algn', '') || 'l');
  const bodyPr = firstChild(txBody, NS.A, 'bodyPr');
  const anchor = attr(bodyPr, 'anchor', 't');
  return {
    text,
    sizePt: Math.max(1, (props.sz || 1800) / 100),
    bold: props.bold === true,
    color: `#${props.color || '000000'}`,
    font: resolveFont(props.font, context.theme),
    align,
    anchor,
  };
}

function textSvg(node, rect, context, masterDoc) {
  const style = decorationTextStyle(node, masterDoc, context);
  if (!style) return '';
  const size = style.sizePt * 12700;
  const lineHeight = size * 1.2;
  const lines = style.text.replace(/\r\n?/g, '\n').split('\n');
  const total = Math.max(lineHeight, lineHeight * lines.length);
  let start;
  if (style.anchor === 'ctr') start = rect.y + rect.h / 2 - total / 2 + size * 0.9;
  else if (style.anchor === 'b') start = rect.y + rect.h - total + size * 0.9;
  else start = rect.y + size * 0.9;
  const x = style.align === 'center' ? rect.x + rect.w / 2 : style.align === 'right' ? rect.x + rect.w : rect.x;
  const anchor = style.align === 'center' ? 'middle' : style.align === 'right' ? 'end' : 'start';
  const spans = lines.map((line, index) => (
    `<tspan x="${round(x)}" y="${round(start + index * lineHeight)}">${xmlEscape(line)}</tspan>`
  )).join('');
  return `<text x="${round(x)}" y="${round(start)}" font-family="${xmlAttr(style.font)}" font-size="${round(size)}" font-weight="${style.bold ? 'bold' : 'normal'}" fill="${style.color}" text-anchor="${anchor}" xml:space="preserve">${spans}</text>`;
}

function round(value) {
  return Math.round(Number(value) || 0);
}

function adjustment(prstGeom) {
  const avLst = prstGeom ? firstChild(prstGeom, NS.A, 'avLst') : null;
  if (!avLst) return null;
  for (const gd of childrenNs(avLst, NS.A, 'gd')) {
    if (attr(gd, 'name', '') !== 'adj') continue;
    const match = attr(gd, 'fmla', '').match(/val\s+(-?\d+(?:\.\d+)?)/);
    if (match) return Number(match[1]);
  }
  return null;
}

function geometrySvg(prst, rect, fill, stroke, strokeWidth, prstGeom) {
  const { x, y, w, h } = rect;
  const common = `fill="${fill || 'none'}" stroke="${stroke || 'none'}"${stroke ? ` stroke-width="${round(strokeWidth)}"` : ''}`;
  if (prst === 'line' || prst === 'straightConnector1') {
    let x1 = x;
    let y1 = y;
    let x2 = x + w;
    let y2 = y + h;
    if (rect.flipH) [x1, x2] = [x2, x1];
    if (rect.flipV) [y1, y2] = [y2, y1];
    return `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" fill="none" stroke="${stroke || '#000000'}" stroke-width="${round(strokeWidth || 12700)}"/>`;
  }
  if (prst === 'ellipse') {
    return `<ellipse cx="${round(x + w / 2)}" cy="${round(y + h / 2)}" rx="${round(w / 2)}" ry="${round(h / 2)}" ${common}/>`;
  }
  if (prst === 'roundRect') {
    const rx = Math.min(w, h) * 0.1667;
    return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${round(rx)}" ry="${round(rx)}" ${common}/>`;
  }
  if (prst === 'parallelogram') {
    const adj = adjustment(prstGeom) ?? 25000;
    const skew = Math.min(w, h) * (adj / 100000);
    return `<polygon points="${round(x + skew)},${round(y)} ${round(x + w)},${round(y)} ${round(x + w - skew)},${round(y + h)} ${round(x)},${round(y + h)}" ${common}/>`;
  }
  if (prst === 'triangle') {
    return `<polygon points="${round(x + w / 2)},${round(y)} ${round(x + w)},${round(y + h)} ${round(x)},${round(y + h)}" ${common}/>`;
  }
  if (prst === 'diamond') {
    return `<polygon points="${round(x + w / 2)},${round(y)} ${round(x + w)},${round(y + h / 2)} ${round(x + w / 2)},${round(y + h)} ${round(x)},${round(y + h / 2)}" ${common}/>`;
  }
  if (prst === 'chevron' || prst === 'homePlate') {
    const skew = Math.min(w, h) * 0.25;
    if (prst === 'homePlate') {
      return `<polygon points="${round(x)},${round(y)} ${round(x + w - skew)},${round(y)} ${round(x + w)},${round(y + h / 2)} ${round(x + w - skew)},${round(y + h)} ${round(x)},${round(y + h)}" ${common}/>`;
    }
    return `<polygon points="${round(x)},${round(y)} ${round(x + w - skew)},${round(y)} ${round(x + w)},${round(y + h / 2)} ${round(x + w - skew)},${round(y + h)} ${round(x)},${round(y + h)} ${round(x + skew)},${round(y + h / 2)}" ${common}/>`;
  }
  if (prst === 'trapezoid') {
    const skew = Math.min(w, h) * 0.25;
    return `<polygon points="${round(x + skew)},${round(y)} ${round(x + w - skew)},${round(y)} ${round(x + w)},${round(y + h)} ${round(x)},${round(y + h)}" ${common}/>`;
  }
  if (prst === 'rect' || prst === 'flowChartProcess' || prst === '') {
    return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" ${common}/>`;
  }
  return null;
}

function styleColor(styleNode, childName, context) {
  if (!styleNode) return null;
  const ref = firstChild(styleNode, NS.A, childName);
  if (!ref || numAttr(ref, 'idx', 0) <= 0) return null;
  const color = childElements(ref).find(node => /Clr$/.test(node.localName || ''));
  return color ? colorFromElement(color, context) : null;
}

function shapePaint(spPr, styleNode, context, name, warn) {
  const fillState = readFill(spPr, context);
  let fill = fillState && fillState.kind !== 'none' ? fillState.color : null;
  if (fillState && (fillState.kind === 'gradient' || fillState.kind === 'pattern')) {
    warn(`装饰「${name}」的${fillState.kind === 'gradient' ? '渐变' : '图案'}填充按首色预览`);
  }
  if (!fill) fill = styleColor(styleNode, 'fillRef', context);
  const ln = firstChild(spPr, NS.A, 'ln');
  let stroke = ln ? (readFill(ln, context)?.color || null) : null;
  let strokeWidth = ln ? numAttr(ln, 'w', 12700) : 12700;
  if (!stroke) {
    const refColor = styleColor(styleNode, 'lnRef', context);
    if (refColor) stroke = refColor;
  }
  return { fill: fill ? `#${fill}` : null, stroke: stroke ? `#${stroke}` : null, strokeWidth };
}

function transformFor(rect) {
  if (!rect.rot) return '';
  return `rotate(${rect.rot} ${round(rect.x + rect.w / 2)} ${round(rect.y + rect.h / 2)})`;
}

async function renderPicture(node, rels, options) {
  const rect = rectangleOf(node);
  if (!rect) {
    options.warn(`图片「${attr(descendants(node, NS.P, 'cNvPr')[0], 'name', '')}」缺少位置，未预览`);
    return '';
  }
  const blip = descendants(node, NS.A, 'blip')[0];
  const relId = blip ? relAttr(blip, 'embed') : '';
  const rel = relId && rels ? rels.get(relId) : null;
  if (!rel || !rel.targetPart) {
    options.warn('装饰图片为外部链接或缺少媒体，未预览');
    return '';
  }
  const bytes = await options.readImage(rel.targetPart).catch(() => null);
  if (!bytes) {
    options.warn(`装饰图片部件 ${rel.targetPart} 缺失，未预览`);
    return '';
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    options.warn('装饰图片过大，未生成预览');
    return '';
  }
  const info = imageInfo(bytes);
  if (!info.mime.startsWith('image/')) {
    options.warn('装饰图片格式（EMF/WMF 等）无法在预览中表达');
    return '';
  }
  const srcRect = descendants(node, NS.P, 'blipFill')[0]
    ? firstChild(descendants(node, NS.P, 'blipFill')[0], NS.A, 'srcRect')
    : null;
  if (srcRect) options.warn('装饰图片的裁剪未在预览背景中表达');
  const href = `data:${info.mime};base64,${bytes.toString('base64')}`;
  const transform = transformFor(rect);
  return `<g${transform ? ` transform="${transform}"` : ''}><image x="${round(rect.x)}" y="${round(rect.y)}" width="${round(rect.w)}" height="${round(rect.h)}" preserveAspectRatio="none" href="${xmlAttr(href)}"/></g>`;
}

async function renderShape(node, rels, options) {
  const name = attr(descendants(node, NS.P, 'cNvPr')[0], 'name', '');
  const rect = rectangleOf(node);
  if (!rect) {
    options.warn(`装饰形状「${name || '未命名'}」缺少位置，未预览`);
    return '';
  }
  const spPr = firstChild(node, NS.P, 'spPr');
  const styleNode = firstChild(node, NS.P, 'style');
  const paint = shapePaint(spPr, styleNode, options.context, name, options.warn);
  const prstGeom = spPr ? firstChild(spPr, NS.A, 'prstGeom') : null;
  const prst = attr(prstGeom, 'prst', 'rect');
  let geometry = geometrySvg(prst, rect, paint.fill, paint.stroke, paint.strokeWidth, prstGeom);
  if (geometry === null) {
    if (paint.fill || paint.stroke) options.warn(`装饰形状「${name || prst}」的几何暂无法表达，仅保留其文字`);
    geometry = '';
  }
  const text = textSvg(node, rect, options.context, options.masterDoc);
  if (!geometry && !text) return '';
  const inner = `${geometry}${text}`;
  const transform = transformFor(rect);
  return `<g${transform ? ` transform="${transform}"` : ''}>${inner}</g>`;
}

async function renderNode(node, rels, options) {
  if (!SHAPE_NODES.has(node.localName)) return '';
  if (node.localName === 'grpSp') {
    const xfrm = groupXfrm(node);
    if (xfrm && (attr(xfrm, 'flipH') === '1' || attr(xfrm, 'flipV') === '1')) {
      options.warn('镜像组合装饰未精确预览');
    }
    const matrix = groupMatrix(node);
    const children = await renderChildren(node, rels, options);
    if (!children) return '';
    return `<g transform="matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})">${children}</g>`;
  }
  if (node.localName === 'sp' || node.localName === 'cxnSp') {
    if (placeHolder(node)) return ''; // layout/master placeholder prompt, never previewed
    return renderShape(node, rels, options);
  }
  if (node.localName === 'pic') return renderPicture(node, rels, options);
  if (node.localName === 'graphicFrame') {
    options.warn('母版/版式中的表格、图表或 SmartArt 装饰未生成预览');
  }
  return '';
}

async function renderChildren(parent, rels, options) {
  const out = [];
  for (const node of childElements(parent)) {
    try {
      out.push(await renderNode(node, rels, options));
    } catch (error) {
      options.warn(`装饰渲染失败：${error.message}`);
    }
  }
  return out.filter(Boolean).join('');
}

async function renderDocument(doc, rels, options) {
  const spTree = descendants(doc.documentElement, NS.P, 'spTree')[0];
  if (!spTree) return '';
  return renderChildren(spTree, rels, options);
}

export async function buildBackdropSvg({
  layoutDoc, masterDoc, layoutRels, masterRels, themeContext, cx, cy,
  includeMaster, readImage, warn,
} ) {
  const context = { theme: themeContext.theme, clrMap: themeContext.clrMap };
  const options = { context, masterDoc, readImage, warn };
  const fragments = [];
  if (includeMaster && masterDoc) {
    fragments.push(await renderDocument(masterDoc, masterRels, options));
  }
  if (layoutDoc) {
    fragments.push(await renderDocument(layoutDoc, layoutRels, options));
  }
  const body = fragments.filter(Boolean).join('');
  if (!body) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${round(cy / cx * 1000)}" viewBox="0 0 ${cx} ${cy}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}
