// Shared OOXML helpers for the PPTX importer and fidelity exporter.
// Everything in this module is local: no network access, no script execution and
// no DTD/entity expansion. Malformed or hostile packages raise ProjectError.
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { ProjectError } from './project.js';

export const NS = {
  A: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  P: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  R: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  C: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  CT: 'http://schemas.openxmlformats.org/package/2006/content-types',
  PR: 'http://schemas.openxmlformats.org/package/2006/relationships',
  DC: 'http://purl.org/dc/elements/1.1/',
  DCTERMS: 'http://purl.org/dc/terms/',
  CP: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  EP: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
  MC: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
};

export const REL_TYPE = {
  officeDocument: '/officeDocument',
  slide: '/slide',
  slideLayout: '/slideLayout',
  slideMaster: '/slideMaster',
  notesSlide: '/notesSlide',
  notesMaster: '/notesMaster',
  theme: '/theme',
  image: '/image',
  chart: '/chart',
  table: '/table',
  diagram: '/diagramData',
};

export const PPTX_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  maxUncompressed: 200 * 1024 * 1024,
  maxEntries: 20000,
};

const EMU_PER_INCH = 914400;
const EMU_PER_PT = 12700;
export const UNITS_PER_CANVAS = 1000;

// ---------------------------------------------------------------------------
// XML

export function parseXml(text, label = 'XML') {
  if (typeof text !== 'string' || !text.trim()) {
    throw new ProjectError(`${label} 内容为空或不是文本`, 'invalid_pptx');
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new ProjectError(`${label} 包含不受支持的 DTD/实体声明`, 'unsafe_xml');
  }
  let doc;
  try {
    const problems = [];
    const parser = new DOMParser({
      onError: (level, message) => {
        if (level === 'error' || level === 'fatalError') problems.push(String(message));
      },
    });
    doc = parser.parseFromString(text, 'application/xml');
    if (problems.length) throw new Error(problems[0]);
  } catch (error) {
    throw new ProjectError(`${label} 解析失败：${error.message}`, 'invalid_pptx');
  }
  if (!doc || !doc.documentElement || doc.documentElement.nodeName === 'parsererror') {
    throw new ProjectError(`${label} 解析失败`, 'invalid_pptx');
  }
  return doc;
}

export function serializeXml(doc) {
  const xml = new XMLSerializer().serializeToString(doc);
  return /^<\?xml/i.test(xml) ? xml : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n${xml}`;
}

export function parseFragment(xml, label = 'XML fragment') {
  const wrapper = `<root xmlns:a="${NS.A}" xmlns:p="${NS.P}" xmlns:r="${NS.R}" xmlns:c="${NS.C}">${xml}</root>`;
  return parseXml(wrapper, label).documentElement;
}

export function importFragment(doc, parent, xml) {
  const wrapper = parseFragment(xml);
  const imported = [];
  for (let node = wrapper.firstChild; node; node = node.nextSibling) {
    const copy = doc.importNode(node, true);
    parent.appendChild(copy);
    imported.push(copy);
  }
  return imported;
}

export function childElements(el) {
  const out = [];
  if (!el) return out;
  for (let node = el.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) out.push(node);
  }
  return out;
}

export function firstChild(el, ns, local) {
  if (!el) return null;
  for (let node = el.firstChild; node; node = node.nextSibling) {
    if (node.nodeType !== 1) continue;
    if (node.localName !== local) continue;
    if (ns && node.namespaceURI && node.namespaceURI !== ns) continue;
    return node;
  }
  return null;
}

export function childrenNs(el, ns, local) {
  return childElements(el).filter(node => node.localName === local && (!ns || !node.namespaceURI || node.namespaceURI === ns));
}

export function descendants(el, ns, local) {
  if (!el) return [];
  return Array.from(el.getElementsByTagNameNS(ns, local));
}

export function firstDescendant(el, ns, local) {
  const all = descendants(el, ns, local);
  return all.length ? all[0] : null;
}

export function attr(el, name, fallback = '') {
  if (!el || !el.hasAttribute || !el.hasAttribute(name)) return fallback;
  return el.getAttribute(name);
}

export function numAttr(el, name, fallback = 0) {
  const raw = attr(el, name, '');
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function relAttr(el, local = 'id') {
  if (!el) return '';
  return el.getAttributeNS(NS.R, local) || el.getAttribute(`r:${local}`) || '';
}

export function setRelAttr(el, local, value) {
  el.setAttributeNS(NS.R, `r:${local}`, value);
}

export function xmlEscape(value) {
  return String(value ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}

export function xmlAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[ch]));
}

export function removeNode(node) {
  if (node && node.parentNode) node.parentNode.removeChild(node);
}

// ---------------------------------------------------------------------------
// Package paths / relationships

export function isSafePartPath(name) {
  if (typeof name !== 'string' || !name || name.length > 1024) return false;
  if (/[\u0000-\u001f]/.test(name)) return false;
  const text = name.replace(/\\/g, '/');
  if (text.startsWith('/') || /^[A-Za-z]:/.test(text)) return false;
  const parts = text.split('/').filter(part => part !== '');
  if (!parts.length) return false;
  return !parts.some(part => part === '..');
}

export function resolvePart(basePart, target) {
  if (typeof target !== 'string' || !target.trim()) return null;
  let text = target.trim();
  if (text.startsWith('#')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text)) return null; // external URI (http:, file:, mailto:)
  text = text.replace(/\\/g, '/');
  const resolved = text.startsWith('/')
    ? posix.normalize(text.slice(1))
    : posix.normalize(posix.join(posix.dirname(basePart), text));
  if (resolved === '..' || resolved.startsWith('../') || resolved.startsWith('/')) {
    throw new ProjectError(`PPTX 关系目标越界：${target}`, 'unsafe_path');
  }
  return resolved;
}

export function relsPath(part) {
  return posix.join(posix.dirname(part), '_rels', `${posix.basename(part)}.rels`);
}

export function parseRels(xml, basePart) {
  const out = new Map();
  if (!xml) return out;
  const doc = parseXml(xml, 'PPTX 关系文件');
  for (const rel of descendants(doc.documentElement, NS.PR, 'Relationship')) {
    const id = attr(rel, 'Id', '');
    if (!id) continue;
    const type = attr(rel, 'Type', '');
    const mode = attr(rel, 'TargetMode', 'Internal');
    const target = attr(rel, 'Target', '');
    let targetPart = null;
    if (mode !== 'External') {
      try {
        targetPart = resolvePart(basePart, target);
      } catch (error) {
        throw error;
      }
    }
    out.set(id, { id, type, target, mode, targetPart });
  }
  return out;
}

export function pickRel(rels, suffix) {
  for (const rel of rels.values()) {
    if (rel.type.endsWith(suffix)) return rel;
  }
  return null;
}

export function relsByType(rels, suffix) {
  return [...rels.values()].filter(rel => rel.type.endsWith(suffix));
}

export function entrySize(entry) {
  const data = entry?._data || {};
  if (Number.isFinite(data.uncompressedSize)) return data.uncompressedSize;
  if (Number.isFinite(data.compressedSize)) return data.compressedSize;
  return 0;
}

export async function validateZip(zip, limits = {}) {
  const maxEntries = limits.maxEntries ?? PPTX_LIMITS.maxEntries;
  const maxUncompressed = limits.maxUncompressed ?? PPTX_LIMITS.maxUncompressed;
  let count = 0;
  let total = 0;
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry || entry.dir) continue;
    if (!isSafePartPath(name)) {
      throw new ProjectError(`PPTX 中包含不安全路径：${name}`, 'unsafe_path');
    }
    count += 1;
    if (count > maxEntries) {
      throw new ProjectError(`PPTX 文件条目数量超过 ${maxEntries} 限制`, 'limit_exceeded');
    }
    const mode = entry.unixPermissions ?? entry._data?.unixPermissions ?? 0;
    if (typeof mode === 'number' && (mode & 0o170000) === 0o120000) {
      throw new ProjectError(`PPTX 中包含符号链接：${name}`, 'unsafe_path');
    }
    const size = entrySize(entry);
    if (size > maxUncompressed) {
      throw new ProjectError(`PPTX 解压后 ${name} 超过 200 MiB 限制`, 'limit_exceeded');
    }
    total += size;
    if (total > maxUncompressed) {
      throw new ProjectError('PPTX 解压后总大小超过 200 MiB 限制', 'limit_exceeded');
    }
  }
}

export async function readTextPart(zip, part, { maxBytes = 16 * 1024 * 1024 } = {}) {
  const entry = zip.file(part);
  if (!entry) return null;
  const declared = entrySize(entry);
  if (declared > maxBytes) {
    throw new ProjectError(`PPTX 部件 ${part} 超过大小限制`, 'limit_exceeded');
  }
  const text = await entry.async('string');
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new ProjectError(`PPTX 部件 ${part} 超过大小限制`, 'limit_exceeded');
  }
  return text;
}

export async function readBinaryPart(zip, part, { maxBytes = 64 * 1024 * 1024 } = {}) {
  const entry = zip.file(part);
  if (!entry) return null;
  const declared = entrySize(entry);
  if (declared > maxBytes) {
    throw new ProjectError(`PPTX 部件 ${part} 超过大小限制`, 'limit_exceeded');
  }
  const buffer = await entry.async('nodebuffer');
  if (buffer.length > maxBytes) {
    throw new ProjectError(`PPTX 部件 ${part} 超过大小限制`, 'limit_exceeded');
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Colours / themes

export function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].split('').map(ch => ch + ch).join('') : match[1];
  return hex.toUpperCase();
}

const PRESET_COLORS = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF',
  yellow: 'FFFF00', gray: '808080', grey: '808080', silver: 'C0C0C0', maroon: '800000',
  navy: '000080', purple: '800080', teal: '008080', olive: '808000', lime: '00FF00',
  aqua: '00FFFF', fuchsia: 'FF00FF', orange: 'FFA500', brown: 'A52A2A', pink: 'FFC0CB',
};

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const part = value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0').toUpperCase();
  return `${part(r)}${part(g)}${part(b)}`;
}

function rgbToHsl({ r, g, b }) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const value = l * 255;
    return { r: value, g: value, b: value };
  }
  const hue = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue(p, q, h + 1 / 3) * 255,
    g: hue(p, q, h) * 255,
    b: hue(p, q, h - 1 / 3) * 255,
  };
}

function applyColorMods(hex, el) {
  let { h, s, l } = rgbToHsl(hexToRgb(hex));
  for (const child of childElements(el)) {
    const value = numAttr(child, 'val', 0) / 100000;
    switch (child.localName) {
      case 'lumMod': l *= value; break;
      case 'lumOff': l += value; break;
      case 'satMod': s *= value; break;
      case 'satOff': s += value; break;
      case 'tint': {
        const rgb = hslToRgb({ h, s, l });
        const { r, g, b } = rgb;
        return rgbToHex({ r: r + (255 - r) * value, g: g + (255 - g) * value, b: b + (255 - b) * value });
      }
      case 'shade': {
        const rgb = hslToRgb({ h, s, l });
        return rgbToHex({ r: rgb.r * (1 - value), g: rgb.g * (1 - value), b: rgb.b * (1 - value) });
      }
      default: break;
    }
  }
  l = Math.max(0, Math.min(1, l));
  s = Math.max(0, Math.min(1, s));
  return rgbToHex(hslToRgb({ h, s, l }));
}

const DEFAULT_CLR_MAP = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };

export function resolveSchemeColor(name, context = {}) {
  if (!name) return null;
  const { theme, clrMap, phClr } = context;
  if (name === 'phClr') {
    if (phClr) return phClr;
    return resolveSchemeColor('tx1', context);
  }
  const mapped = (clrMap && clrMap[name]) || DEFAULT_CLR_MAP[name] || name;
  return theme?.colors?.[mapped] || theme?.colors?.[name] || null;
}

export function colorFromElement(el, context = {}) {
  if (!el) return null;
  const local = el.localName;
  if (local === 'solidFill' || local === 'gradFill' || local === 'bgRef') {
    const colorChild = childElements(el).find(child => /Clr$/.test(child.localName || ''));
    return colorChild ? colorFromElement(colorChild, context) : null;
  }
  let hex = null;
  if (local === 'srgbClr') hex = normalizeHex(attr(el, 'val', ''));
  else if (local === 'schemeClr') hex = resolveSchemeColor(attr(el, 'val', ''), context);
  else if (local === 'sysClr') hex = normalizeHex(attr(el, 'lastClr', '')) || (attr(el, 'val', '') === 'window' ? 'FFFFFF' : '000000');
  else if (local === 'prstClr') hex = PRESET_COLORS[attr(el, 'val', '').toLowerCase()] || null;
  else if (local === 'scrgbClr') {
    const pct = name => Math.max(0, Math.min(100000, numAttr(el, name, 0))) / 100000;
    hex = rgbToHex({ r: pct('r') * 255, g: pct('g') * 255, b: pct('b') * 255 });
  } else if (local === 'hslClr') {
    hex = rgbToHex(hslToRgb({
      h: (numAttr(el, 'hue', 0) / 60000) / 360,
      s: Math.max(0, Math.min(100000, numAttr(el, 'sat', 0))) / 100000,
      l: Math.max(0, Math.min(100000, numAttr(el, 'lum', 0))) / 100000,
    }));
  }
  if (!hex) return null;
  return applyColorMods(hex, el);
}

export function readFill(container, context = {}) {
  if (!container) return null;
  for (const child of childElements(container)) {
    if (child.localName === 'noFill') return { kind: 'none', color: null };
    if (child.localName === 'solidFill') {
      const color = colorFromElement(child, context);
      if (color) return { kind: 'solid', color };
      return { kind: 'none', color: null };
    }
    if (child.localName === 'gradFill') {
      const stop = descendants(child, NS.A, 'gs')[0];
      const color = stop ? colorFromElement(firstChild(stop, NS.A, 'srgbClr') || firstChild(stop, NS.A, 'schemeClr'), context) : null;
      if (color) return { kind: 'gradient', color };
      return { kind: 'none', color: null };
    }
    if (child.localName === 'pattFill') {
      const color = colorFromElement(firstChild(child, NS.A, 'fgClr'), context);
      if (color) return { kind: 'pattern', color };
      return { kind: 'none', color: null };
    }
  }
  return null;
}

export function themeFromXml(doc) {
  const theme = { colors: {}, fonts: { major: '', minor: '' } };
  if (!doc) return theme;
  const scheme = descendants(doc.documentElement, NS.A, 'clrScheme')[0];
  if (scheme) {
    for (const slot of childElements(scheme)) {
      const colorNode = childElements(slot)[0];
      if (!colorNode) continue;
      let color = null;
      if (colorNode.localName === 'srgbClr') color = normalizeHex(attr(colorNode, 'val', ''));
      else if (colorNode.localName === 'sysClr') color = normalizeHex(attr(colorNode, 'lastClr', '')) || (attr(colorNode, 'val') === 'window' ? 'FFFFFF' : '000000');
      else color = colorFromElement(colorNode, {});
      if (color) theme.colors[slot.localName] = color;
    }
  }
  const major = descendants(doc.documentElement, NS.A, 'majorFont')[0];
  const minor = descendants(doc.documentElement, NS.A, 'minorFont')[0];
  theme.fonts.major = attr(firstChild(major, NS.A, 'latin'), 'typeface', '') || '';
  theme.fonts.minor = attr(firstChild(minor, NS.A, 'latin'), 'typeface', '') || '';
  return theme;
}

export function clrMapFromXml(doc) {
  const node = doc ? descendants(doc.documentElement, NS.P, 'clrMap')[0] : null;
  if (!node) return { ...DEFAULT_CLR_MAP };
  const map = {};
  for (let index = 0; index < node.attributes.length; index += 1) {
    const item = node.attributes[index];
    map[item.name] = item.value;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Geometry / fonts

export function emuToUnits(emu, canvasWidthEmu) {
  return round((Number(emu) || 0) * UNITS_PER_CANVAS / canvasWidthEmu, 4);
}

export function unitsToEmu(units, canvasWidthEmu) {
  return Math.round((Number(units) || 0) * canvasWidthEmu / UNITS_PER_CANVAS);
}

export function ptToFontUnits(points, canvasWidthEmu) {
  // Project font sizes are logical pixels (export: pt = px * 0.75) scaled so a
  // 10 inch deck keeps the source proportions on the fixed 1000 unit canvas.
  const value = (Number(points) || 0) * (4 / 3) * (EMU_PER_INCH * 10 / canvasWidthEmu);
  return round(value, 2);
}

export function fontUnitsToPt100(units, canvasWidthEmu = 9144000) {
  // Inverse of ptToFontUnits: logical px -> points on the source slide size.
  const scale = (Number(canvasWidthEmu) || 9144000) / 9144000;
  return Math.max(600, Math.round((Number(units) || 0) * 0.75 * scale * 100));
}

export function strokeFromEmu(emu) {
  return round((Number(emu) || 0) / EMU_PER_PT * (4 / 3), 2);
}

export function strokeToEmu(width) {
  return Math.max(1, Math.round((Number(width) || 0) * 0.75 * EMU_PER_PT));
}

export function emuToPt(emu) {
  return (Number(emu) || 0) / EMU_PER_PT;
}

export function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}


// Affine helpers for group transforms. Coordinates use screen space (y grows
// downwards) so a positive OOXML rotation is clockwise.
export const IDENTITY_MATRIX = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

export function isIdentityMatrix(matrix) {
  return matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1 && matrix.e === 0 && matrix.f === 0;
}

export function multiplyMatrix(m2, m1) {
  return {
    a: m2.a * m1.a + m2.c * m1.b,
    b: m2.b * m1.a + m2.d * m1.b,
    c: m2.a * m1.c + m2.c * m1.d,
    d: m2.b * m1.c + m2.d * m1.d,
    e: m2.a * m1.e + m2.c * m1.f + m2.e,
    f: m2.b * m1.e + m2.d * m1.f + m2.f,
  };
}

export function translationMatrix(tx, ty) {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scalingMatrix(sx, sy) {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function rotationMatrix(radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export function applyMatrixPoint(matrix, x, y) {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  };
}

export function groupXfrm(group) {
  const grpSpPr = firstChild(group, NS.P, 'grpSpPr');
  return grpSpPr ? firstChild(grpSpPr, NS.A, 'xfrm') : null;
}

export function groupMatrix(group) {
  const xfrm = groupXfrm(group);
  if (!xfrm) return IDENTITY_MATRIX;
  const off = firstChild(xfrm, NS.A, 'off');
  const ext = firstChild(xfrm, NS.A, 'ext');
  const chOff = firstChild(xfrm, NS.A, 'chOff');
  const chExt = firstChild(xfrm, NS.A, 'chExt');
  const ox = numAttr(off, 'x');
  const oy = numAttr(off, 'y');
  const ex = numAttr(ext, 'cx');
  const ey = numAttr(ext, 'cy');
  const cox = numAttr(chOff, 'x');
  const coy = numAttr(chOff, 'y');
  const cex = numAttr(chExt, 'cx');
  const cey = numAttr(chExt, 'cy');
  const sx = cex ? ex / cex : 1;
  const sy = cey ? ey / cey : 1;
  const radians = (numAttr(xfrm, 'rot') / 60000) * (Math.PI / 180);
  const cx = ox + ex / 2;
  const cy = oy + ey / 2;
  let matrix = multiplyMatrix(translationMatrix(ox, oy), multiplyMatrix(scalingMatrix(sx, sy), translationMatrix(-cox, -coy)));
  if (radians) {
    matrix = multiplyMatrix(translationMatrix(cx, cy), multiplyMatrix(rotationMatrix(radians), multiplyMatrix(translationMatrix(-cx, -cy), matrix)));
  }
  return matrix;
}

export function groupRotation(group) {
  return numAttr(groupXfrm(group), 'rot') / 60000;
}

// ---------------------------------------------------------------------------
// Images

export function imageInfo(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (buf.length < 12) return { mime: 'application/octet-stream', ext: 'bin', width: 0, height: 0 };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return {
      mime: 'image/png',
      ext: 'png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) { offset += 1; continue; }
      const marker = buf[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {
          mime: 'image/jpeg',
          ext: 'jpeg',
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }
      const length = buf.readUInt16BE(offset + 2);
      if (!length) break;
      offset += 2 + length;
    }
    return { mime: 'image/jpeg', ext: 'jpeg', width: 0, height: 0 };
  }
  if (buf.slice(0, 6).toString('ascii') === 'GIF87a' || buf.slice(0, 6).toString('ascii') === 'GIF89a') {
    return { mime: 'image/gif', ext: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.slice(0, 2).toString('ascii') === 'BM' && buf.length > 26) {
    return {
      mime: 'image/bmp',
      ext: 'bmp',
      width: Math.abs(buf.readInt32LE(18)),
      height: Math.abs(buf.readInt32LE(22)),
    };
  }
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
    let width = 0;
    let height = 0;
    const chunk = buf.slice(12, 16).toString('ascii');
    if (chunk === 'VP8X' && buf.length >= 30) {
      width = 1 + buf.readUIntLE(24, 3);
      height = 1 + buf.readUIntLE(27, 3);
    } else if (chunk === 'VP8L' && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    } else if (chunk === 'VP8 ' && buf.length >= 30) {
      width = buf.readUInt16LE(26) & 0x3fff;
      height = buf.readUInt16LE(28) & 0x3fff;
    }
    return { mime: 'image/webp', ext: 'webp', width, height };
  }
  const head = buf.slice(0, 256).toString('utf8').trimStart();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) {
    return { mime: 'image/svg+xml', ext: 'svg', width: 0, height: 0 };
  }
  return { mime: 'application/octet-stream', ext: 'bin', width: 0, height: 0 };
}

export function imageMimeFromPath(part) {
  const ext = posix.extname(part || '').slice(1).toLowerCase();
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
    tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/x-emf', wmf: 'image/x-wmf',
  };
  return { mime: map[ext] || 'application/octet-stream', ext: ext || 'bin' };
}

export function dataUrlFor(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export function decodeDataUrl(src) {
  if (typeof src !== 'string') return null;
  const match = src.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  const ext = mime.split('/')[1] === 'svg+xml' ? 'svg' : mime.split('/')[1] === 'jpeg' ? 'jpeg' : mime.split('/')[1];
  return { mime, ext: ext || 'bin', buffer: bytes };
}

// ---------------------------------------------------------------------------
// Misc

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sanitizeFilename(title) {
  const cleaned = String(title ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'presentation';
}

export function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}
