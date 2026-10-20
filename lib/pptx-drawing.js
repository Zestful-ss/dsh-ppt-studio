// Native DrawingML/PresentationML fragment builders used by the fidelity
// exporter. Everything generated here stays editable in PowerPoint: text runs,
// preset geometry, pictures, tables and chart frames.
import {
  NS, unitsToEmu, fontUnitsToPt100, strokeToEmu, normalizeHex, xmlEscape, xmlAttr,
} from './pptx-xml.js';

const ALIGN = { left: 'l', center: 'ctr', right: 'r' };

function hex(value, fallback) {
  return normalizeHex(value) || fallback;
}

function shapeId(value) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 2;
}

function xfrmXml(element, { cx, box, graphicFrame = false } = {}) {
  const source = box || {
    x: unitsToEmu(element.x, cx),
    y: unitsToEmu(element.y, cx),
    w: unitsToEmu(element.w, cx),
    h: unitsToEmu(element.h, cx),
  };
  const rot = Math.round((Number(element.rotate) || 0) * 60000);
  const tag = graphicFrame ? 'p:xfrm' : 'a:xfrm';
  return `<${tag}${rot ? ` rot="${rot}"` : ''}><a:off x="${Math.round(source.x)}" y="${Math.round(source.y)}"/><a:ext cx="${Math.max(1, Math.round(source.w))}" cy="${Math.max(1, Math.round(source.h))}"/></${tag}>`;
}

function solidFill(color) {
  return `<a:solidFill><a:srgbClr val="${hex(color, 'FFFFFF')}"/></a:solidFill>`;
}

function runPropsXml(element, fontFace, cx) {
  const sz = fontUnitsToPt100(element.fontSize ?? 24, cx);
  const color = hex(element.color, '1F2430');
  const bold = element.bold === true ? 1 : 0;
  const font = fontFace ? `<a:latin typeface="${xmlAttr(fontFace)}"/>` : '';
  return `<a:rPr lang="zh-CN" altLang="en-US" sz="${sz}" b="${bold}" dirty="0">${solidFill(color)}${font}</a:rPr>`;
}

function paragraphXml(line, element, { fontFace, align, anchor, cx } = {}) {
  const code = ALIGN[align] || ALIGN[element.align] || 'l';
  const spacing = typeof element.lineHeight === 'number'
    ? `<a:lnSpc><a:spcPct val="${Math.round(element.lineHeight * 100000)}"/></a:lnSpc>`
    : '';
  const pPr = `<a:pPr algn="${code}">${spacing}</a:pPr>`;
  if (!line) {
    const sz = fontUnitsToPt100(element.fontSize ?? 24, cx);
    return `<a:p>${pPr}<a:endParaRPr lang="zh-CN" altLang="en-US" sz="${sz}" dirty="0">${solidFill(element.color)}</a:endParaRPr></a:p>`;
  }
  return `<a:p>${pPr}<a:r>${runPropsXml(element, fontFace, cx)}<a:t xml:space="preserve">${xmlEscape(line)}</a:t></a:r></a:p>`;
}

export function textBodyXml(element, { fontFace = '', align, anchor = 't', cx } = {}) {
  const lines = String(element.text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const paragraphs = lines.map(line => paragraphXml(line, element, { fontFace, align, cx })).join('');
  return `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${anchor}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody>`;
}

export function textShapeXml(element, { id, cx, fontFace = '' }) {
  const sid = shapeId(id);
  const fill = element.fill ? solidFill(element.fill) : '<a:noFill/>';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${sid}" name="TextBox ${sid}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrmXml(element, { cx })}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr>${textBodyXml(element, { fontFace, cx })}</p:sp>`;
}

function roundRectAdjustment(element) {
  const shortest = Math.max(1, Math.min(Number(element.w) || 1, Number(element.h) || 1));
  const radius = Math.max(0, Math.min(Number(element.radius) || 0, shortest / 2));
  return Math.round(radius * 100000 / shortest);
}

export function shapeXml(element, { id, cx, fontFace = '' }) {
  const sid = shapeId(id);
  const shape = ['rect', 'roundRect', 'ellipse', 'line'].includes(element.shape) ? element.shape : 'rect';
  const prst = shape === 'line' ? 'line' : shape;
  const geometry = shape === 'roundRect'
    ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${roundRectAdjustment(element)}"/></a:avLst></a:prstGeom>`
    : `<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>`;
  let fill = '<a:noFill/>';
  let line = '<a:ln><a:noFill/></a:ln>';
  if (shape === 'line') {
    if ((Number(element.strokeWidth) || 0) > 0) {
      line = `<a:ln w="${strokeToEmu(element.strokeWidth)}">${solidFill(element.stroke || '#1f2430')}<a:prstDash val="solid"/></a:ln>`;
    }
  } else {
    fill = solidFill(element.fill || '#f3f4f6');
    if (element.stroke && (Number(element.strokeWidth) || 0) > 0) {
      line = `<a:ln w="${strokeToEmu(element.strokeWidth)}">${solidFill(element.stroke)}<a:prstDash val="solid"/></a:ln>`;
    }
  }
  const text = typeof element.text === 'string' && element.text.length
    ? textBodyXml(element, { fontFace, align: element.align || 'center', anchor: 'ctr', cx })
    : '';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${sid}" name="Shape ${sid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrmXml(element, { cx })}${geometry}${fill}${line}</p:spPr>${text}</p:sp>`;
}

function srcRectXml(srcRect) {
  if (!srcRect) return '';
  const values = ['l', 'r', 't', 'b'].map(side => Math.round((srcRect[side] || 0) * 100000));
  if (!values.some(value => value !== 0)) return '';
  return `<a:srcRect l="${values[0]}" t="${values[2]}" r="${values[1]}" b="${values[3]}"/>`;
}

export function pictureXml(element, { id, cx, relId, box, srcRect }) {
  const sid = shapeId(id);
  return `<p:pic><p:nvPicPr><p:cNvPr id="${sid}" name="Picture ${sid}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip xmlns:r="${NS.R}" r:embed="${xmlAttr(relId)}"/>${srcRectXml(srcRect)}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrmXml(element, { cx, box })}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

function cellParagraphs(text, element, fontFace, cx) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const sz = fontUnitsToPt100(element.fontSize ?? 16, cx);
  const color = hex(element.color, '1F2430');
  const font = fontFace ? `<a:latin typeface="${xmlAttr(fontFace)}"/>` : '';
  const align = ALIGN[element.align] || 'l';
  return lines.map(line => {
    const pPr = `<a:pPr algn="${align}"/>`;
    if (!line) return `<a:p>${pPr}<a:endParaRPr lang="zh-CN" altLang="en-US" sz="${sz}" dirty="0">${solidFill(color)}</a:endParaRPr></a:p>`;
    return `<a:p>${pPr}<a:r><a:rPr lang="zh-CN" altLang="en-US" sz="${sz}" dirty="0">${solidFill(color)}${font}</a:rPr><a:t xml:space="preserve">${xmlEscape(line)}</a:t></a:r></a:p>`;
  }).join('');
}

export function tableBodyXml(element, { cx, fontFace = '' } = {}) {
  const rows = Array.isArray(element.rows) ? element.rows : [];
  const columns = Math.max(1, ...rows.map(row => (Array.isArray(row) ? row.length : 0)));
  const width = unitsToEmu(element.w, cx);
  const height = unitsToEmu(element.h, cx);
  const colW = Math.max(1, Math.floor(width / columns));
  const rowH = Math.max(1, Math.floor(height / Math.max(rows.length, 1)));
  const grid = Array.from({ length: columns }, (_, index) => `<a:gridCol w="${index === columns - 1 ? Math.max(1, width - colW * (columns - 1)) : colW}"/>`).join('');
  const headerFill = hex(element.headerFill, 'F3F4F6');
  const trs = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columns }, (_, columnIndex) => {
      const text = Array.isArray(row) && row[columnIndex] != null ? String(row[columnIndex]) : '';
      const fill = hex(rowIndex === 0 ? headerFill : 'FFFFFF', 'FFFFFF');
      return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${cellParagraphs(text, element, fontFace, cx)}</a:txBody><a:tcPr marL="28800" marR="28800" marT="14400" marB="14400" anchor="ctr">${solidFill(fill)}</a:tcPr></a:tc>`;
    }).join('');
    return `<a:tr h="${rowH}">${cells}</a:tr>`;
  }).join('');
  return `<a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr><a:tblGrid>${grid}</a:tblGrid>${trs}</a:tbl>`;
}

export function tableFrameXml(element, { id, cx, fontFace = '' }) {
  const sid = shapeId(id);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${sid}" name="Table ${sid}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>${xfrmXml(element, { cx, graphicFrame: true })}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">${tableBodyXml(element, { cx, fontFace })}</a:graphicData></a:graphic></p:graphicFrame>`;
}

export function chartFrameXml(element, { id, cx, relId }) {
  const sid = shapeId(id);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${sid}" name="Chart ${sid}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>${xfrmXml(element, { cx, graphicFrame: true })}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="${NS.C}" xmlns:r="${NS.R}" r:id="${xmlAttr(relId)}"/></a:graphicData></a:graphic></p:graphicFrame>`;
}

export function backgroundXml(color) {
  if (!color) return '';
  return `<p:bg><p:bgPr>${solidFill(color)}<a:effectLst/></p:bgPr></p:bg>`;
}

export function slideSkeletonXml({ background, shapes = '', showMasterSp = true } = {}) {
  const masterShapes = showMasterSp === false ? ' showMasterSp="0"' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<p:sld xmlns:a="${NS.A}" xmlns:r="${NS.R}" xmlns:p="${NS.P}"${masterShapes}><p:cSld>${backgroundXml(background)}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function notesParagraphs(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  return lines.map(line => (line
    ? `<a:p><a:r><a:rPr lang="zh-CN" altLang="en-US" dirty="0"/><a:t xml:space="preserve">${xmlEscape(line)}</a:t></a:r></a:p>`
    : '<a:p><a:endParaRPr lang="zh-CN" altLang="en-US" dirty="0"/></a:p>')).join('');
}

export function notesBodyShapeXml(text, id = 2) {
  const sid = shapeId(id);
  return `<p:sp><p:nvSpPr><p:cNvPr id="${sid}" name="Notes Placeholder ${sid}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${notesParagraphs(text)}</p:txBody></p:sp>`;
}

export function notesPartXml(text) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<p:notes xmlns:a="${NS.A}" xmlns:r="${NS.R}" xmlns:p="${NS.P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${notesBodyShapeXml(text)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}
