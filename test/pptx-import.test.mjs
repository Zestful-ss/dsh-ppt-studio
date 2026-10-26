import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { importPptx, exportImportedPptx } from '../lib/pptx.js';
import { buildPptx } from '../lib/export.js';
import { applyOperations, normalizeProject, ProjectError } from '../lib/project.js';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';

// 1x1 transparent PNG. Real image bytes so the importer embeds a data URL and
// the exporter can keep/copy the media part.
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const temp = () => mkdtemp(join(tmpdir(), 'ppt-studio-pptx-'));

function catCache(labels) {
  return `<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$${labels.length + 1}</c:f><c:strCache><c:ptCount val="${labels.length}"/>${labels
    .map((value, index) => `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`)
    .join('')}</c:strCache></c:strRef></c:cat>`;
}

function valCache(values) {
  return `<c:val><c:numRef><c:f>Sheet1!$B$2:$B$${values.length + 1}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values
    .map((value, index) => `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`)
    .join('')}</c:numCache></c:numRef></c:val>`;
}

function chartSeries(name, color, labels, values, index) {
  return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${name}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr>${catCache(labels)}${valCache(values)}</c:ser>`;
}

function tableCell(text, fill, color, bold) {
  const paragraph = text
    ? `<a:p><a:pPr algn="l"/><a:r><a:rPr lang="zh-CN" sz="1400" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r></a:p>`
    : '<a:p><a:pPr algn="l"/><a:endParaRPr lang="zh-CN" sz="1400" dirty="0"/></a:p>';
  return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paragraph}</a:txBody><a:tcPr marL="28800" marR="28800" anchor="ctr"><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></a:tcPr></a:tc>`;
}

function fixtureParts() {
  const theme = `${XML_HEAD}<a:theme xmlns:a="${A}" name="Fixture"><a:themeElements><a:clrScheme name="Fixture"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="222222"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="112233"/></a:accent1><a:accent2><a:srgbClr val="445566"/></a:accent2><a:accent3><a:srgbClr val="778899"/></a:accent3><a:accent4><a:srgbClr val="AABBCC"/></a:accent4><a:accent5><a:srgbClr val="DDEEFF"/></a:accent5><a:accent6><a:srgbClr val="123456"/></a:accent6><a:hlink><a:srgbClr val="0000EE"/></a:hlink><a:folHlink><a:srgbClr val="551A8B"/></a:folHlink></a:clrScheme><a:fontScheme name="Fixture"><a:majorFont><a:latin typeface="FixtureDisplay"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="FixtureSans"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Fixture"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

  const master = `${XML_HEAD}<p:sldMaster xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Master Body"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="609600" y="1828800"/><a:ext cx="6096000" cy="2743200"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>MASTER-PLACEHOLDER-TEXT</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="6" name="Master Logo"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="609600" y="5486400"/><a:ext cx="1828800" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="445566"/></a:solidFill></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1200" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>MASTER-LOGO</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId3"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr algn="l"><a:defRPr sz="2800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr algn="l"><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
  const masterRels = `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${R}/theme" Target="../theme/theme1.xml"/><Relationship Id="rId3" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout2.xml"/></Relationships>`;

  const layout = `${XML_HEAD}<p:sldLayout xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Layout Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="609600" y="304800"/><a:ext cx="6096000" cy="914400"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Layout Body"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="6" name="平行四边形 Header"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="914400"/></a:xfrm><a:prstGeom prst="parallelogram"><a:avLst><a:gd name="adj" fmla="val 48207"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="013E80"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const layoutRels = `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${R}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
  const layout2 = `${XML_HEAD}<p:sldLayout xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}" showMasterSp="0"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const layout2Rels = `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${R}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;

  const notesMaster = `${XML_HEAD}<p:notesMaster xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr algn="l"><a:defRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`;
  const notesMasterRels = `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${R}/theme" Target="../theme/theme1.xml"/></Relationships>`;

  const slideNumPlaceholder = '<p:sp><p:nvSpPr><p:cNvPr id="7" name="页码"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" idx="4294967295"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="900000" cy="300000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id="{11111111-1111-1111-1111-111111111111}" type="slidenum"><a:rPr lang="en-US" sz="1200"/></a:fld></a:p></p:txBody></p:sp>';

  const slide1 = `${XML_HEAD}<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FAFAFA"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${slideNumPlaceholder}<p:sp><p:nvSpPr><p:cNvPr id="2" name="标题 1"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="838200"/><a:ext cx="6400800" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr algn="l"><a:defRPr sz="4000"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></a:lstStyle><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="zh-CN"/><a:t>第一页标题</a:t></a:r></a:p></p:txBody></p:sp><p:grpSp><p:nvGrpSpPr><p:cNvPr id="3" name="Group 3"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2286000" cy="1143000"/><a:chOff x="0" y="0"/><a:chExt cx="1143000" cy="571500"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="4" name="组合矩形"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="91440" y="91440"/><a:ext cx="457200" cy="228600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="1600" b="1"/><a:t>组合文本</a:t></a:r></a:p></p:txBody></p:sp></p:grpSp><p:pic><p:nvPicPr><p:cNvPr id="5" name="Picture 5"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm rot="1800000"><a:off x="914400" y="2286000"/><a:ext cx="1828800" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic><p:extLst><p:ext uri="{FIXTURE-UNKNOWN}"><fx:marker xmlns:fx="urn:fixture:unknown">UNKNOWN-EXT-MARKER</fx:marker></p:ext></p:extLst></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const slide1Rels = `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout2.xml"/><Relationship Id="rId2" Type="${R}/image" Target="../media/image1.png"/><Relationship Id="rId3" Type="${R}/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`;

  const slide2 = `${XML_HEAD}<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="4" name="目录占位符"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="2400"/><a:t>目录文本</a:t></a:r></a:p></p:txBody></p:sp><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="Table 2"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="609600" y="609600"/><a:ext cx="7315200" cy="3657600"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid><a:gridCol w="2438400"/><a:gridCol w="2438400"/><a:gridCol w="2438400"/></a:tblGrid><a:tr h="914400">${tableCell('列A', '1F4E79', 'FFFFFF', true)}${tableCell('列B', '1F4E79', 'FFFFFF', true)}${tableCell('列C', '1F4E79', 'FFFFFF', true)}</a:tr><a:tr h="914400">${tableCell('a', 'FFFFFF', '222222', false)}${tableCell('1', 'FFFFFF', '222222', false)}${tableCell('2', 'FFFFFF', '222222', false)}</a:tr><a:tr h="914400">${tableCell('', 'FFFFFF', '222222', false)}${tableCell('', 'FFFFFF', '222222', false)}${tableCell('', 'FFFFFF', '222222', false)}</a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame><p:sp><p:nvSpPr><p:cNvPr id="3" name="椭圆"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="6858000" y="4572000"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="1200"/><a:t>椭圆</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const slide2Rels = `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;

  const chart = `${XML_HEAD}<c:chartSpace xmlns:c="${C}" xmlns:a="${A}" xmlns:r="${R}"><c:chart><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${chartSeries('A', '112233', ['一', '二', '三'], [1, 2, 3], 0)}${chartSeries('B', '445566', ['一', '二', '三'], [4, 5, 6], 1)}<c:axId val="1000001"/><c:axId val="1000002"/></c:barChart><c:catAx><c:axId val="1000001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="1000002"/></c:catAx><c:valAx><c:axId val="1000002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1000001"/></c:valAx></c:plotArea></c:chart></c:chartSpace>`;

  const slide3 = `${XML_HEAD}<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}" showMasterSp="0"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="5" name="继承标题占位符"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="3000"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>继承标题</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="2" name="文本框 2"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="3657600" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="2400"/><a:t>第三页</a:t></a:r></a:p></p:txBody></p:sp><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Chart 3"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="1219200" y="1828800"/><a:ext cx="7315200" cy="3657600"/></p:xfrm><a:graphic><a:graphicData uri="${C}"><c:chart xmlns:c="${C}" xmlns:r="${R}" r:id="rId2"/></a:graphicData></a:graphic></p:graphicFrame><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Diagram 4"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="5000000"/><a:ext cx="1000000" cy="1000000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><fx:keep xmlns:fx="urn:fixture:unknown">DIAGRAM-MARKER</fx:keep></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const slide3Rels = `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${R}/chart" Target="../charts/chart1.xml"/></Relationships>`;

  const notesSlide = `${XML_HEAD}<p:notes xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>第一页备注</a:t></a:r></a:p></p:txBody></p:sp>${slideNumPlaceholder}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
  const notesSlideRels = `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${R}/notesMaster" Target="../notesMasters/notesMaster1.xml"/></Relationships>`;

  const presentation = `${XML_HEAD}<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId5"/></p:notesMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/><p:sldId id="258" r:id="rId4"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  const presentationRels = `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${R}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${R}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${R}/slide" Target="slides/slide2.xml"/><Relationship Id="rId4" Type="${R}/slide" Target="slides/slide3.xml"/><Relationship Id="rId5" Type="${R}/notesMaster" Target="notesMasters/notesMaster1.xml"/></Relationships>`;

  const contentTypes = `${XML_HEAD}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="dat" ContentType="application/octet-stream"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/><Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

  const core = `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Fixture Deck</dc:title></cp:coreProperties>`;
  const app = `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Fixture</Application></Properties>`;

  return {
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${R}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    'docProps/core.xml': core,
    'docProps/app.xml': app,
    'ppt/presentation.xml': presentation,
    'ppt/_rels/presentation.xml.rels': presentationRels,
    'ppt/slideMasters/slideMaster1.xml': master,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': masterRels,
    'ppt/slideLayouts/slideLayout1.xml': layout,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': layoutRels,
    'ppt/slideLayouts/slideLayout2.xml': layout2,
    'ppt/slideLayouts/_rels/slideLayout2.xml.rels': layout2Rels,
    'ppt/notesMasters/notesMaster1.xml': notesMaster,
    'ppt/notesMasters/_rels/notesMaster1.xml.rels': notesMasterRels,
    'ppt/theme/theme1.xml': theme,
    'ppt/slides/slide1.xml': slide1,
    'ppt/slides/_rels/slide1.xml.rels': slide1Rels,
    'ppt/slides/slide2.xml': slide2,
    'ppt/slides/_rels/slide2.xml.rels': slide2Rels,
    'ppt/slides/slide3.xml': slide3,
    'ppt/slides/_rels/slide3.xml.rels': slide3Rels,
    'ppt/notesSlides/notesSlide1.xml': notesSlide,
    'ppt/notesSlides/_rels/notesSlide1.xml.rels': notesSlideRels,
    'ppt/charts/chart1.xml': chart,
    'ppt/media/image1.png': Buffer.from(PNG_1X1, 'base64'),
    'ppt/media/preserved.dat': Buffer.from('PRESERVED-BYTES', 'utf8'),
  };
}

async function buildFixture() {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(fixtureParts())) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function importFixture(options = {}) {
  return importPptx(await buildFixture(), { filename: 'fixture.pptx', ...options });
}

function projectFrom(template, revision = 1) {
  return normalizeProject({ ...template, id: 'p_fixture', revision });
}

async function exportDeck(project, bindings, dir, source) {
  const sourcePath = join(dir, 'source.pptx');
  await writeFile(sourcePath, source);
  const out = await exportImportedPptx(project, { sourcePath, bindings, outDir: dir });
  return { ...out, buffer: await readFile(out.path) };
}

function partText(presXml, relsXml, suffix) {
  const targets = {};
  for (const tag of relsXml.match(/<Relationship\b[^>]*\/>/g) || []) {
    const id = tag.match(/Id="([^"]+)"/)?.[1];
    const target = tag.match(/Target="([^"]+)"/)?.[1];
    const type = tag.match(/Type="([^"]+)"/)?.[1] || '';
    if (id && target && type.endsWith(suffix)) targets[id] = target;
  }
  const order = [...presXml.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map(match => targets[match[1]]);
  return order;
}

test('real OOXML import: order, geometry, inherited styles, group transform, notes, cache', async () => {
  const { template, warnings, bindings } = await importFixture();
  assert.equal(template.title, 'Fixture Deck');
  assert.equal(template.viewport.width, 1000);
  assert.equal(template.viewport.height, 562.5);
  assert.equal(template.theme.fontName, 'FixtureSans');
  assert.ok(template.theme.themeColors.includes('#112233'));
  assert.equal(template.theme.backgroundColor, '#FFFFFF');
  assert.equal(template.slides.length, 3);

  const [slide1, slide2, slide3] = template.slides;
  assert.equal(slide1.background, '#FAFAFA');
  assert.equal(slide1.note, '第一页备注');
  assert.equal(slide1.elements.length, 3);

  const title = slide1.elements.find(element => element.text === '第一页标题');
  assert.ok(title, JSON.stringify(slide1.elements.map(element => element.text)));
  assert.equal(title.type, 'text');
  assert.equal(title.x, 75);
  assert.equal(title.y, 68.75);
  assert.equal(title.w, 525);
  assert.equal(title.h, 75);
  assert.equal(title.fontSize, 40);
  assert.equal(title.color, '#112233');
  assert.equal(title.align, 'center');
  assert.equal(title.bold, false);

  const grouped = slide1.elements.find(element => element.text === '组合文本');
  assert.ok(grouped);
  assert.equal(grouped.type, 'shape');
  assert.equal(grouped.shape, 'rect');
  assert.equal(grouped.fill, '#112233');
  assert.equal(grouped.x, 15);
  assert.equal(grouped.y, 15);
  assert.equal(grouped.w, 75);
  assert.equal(grouped.h, 37.5);
  assert.equal(grouped.fontSize, 16);
  assert.equal(grouped.bold, true);

  const image = slide1.elements.find(element => element.type === 'image');
  assert.ok(image);
  assert.match(image.src, /^data:image\/png;base64,/);
  assert.equal(image.fit, 'cover');
  assert.equal(image.rotate, 30);
  assert.equal(image.x, 75);
  assert.equal(image.y, 187.5);
  assert.equal(image.w, 150);
  assert.equal(image.h, 75);
  assert.ok(!slide1.elements.some(element => element.text === '' && element.type === 'text' && element.id.includes('7')));

  const table = slide2.elements.find(element => element.type === 'table');
  assert.ok(table);
  assert.deepEqual(table.rows, [['列A', '列B', '列C'], ['a', '1', '2'], ['', '', '']]);
  assert.equal(table.headerFill, '#1F4E79');
  assert.equal(table.fontSize, 14);
  assert.equal(table.color, '#222222');
  assert.equal(table.x, 50);
  assert.equal(table.y, 50);
  assert.equal(table.w, 600);
  assert.equal(table.h, 300);

  const inheritedBody = slide2.elements.find(element => element.text === '目录文本');
  assert.ok(inheritedBody, JSON.stringify(slide2.elements.map(element => element.text)));
  assert.equal(inheritedBody.type, 'text');
  assert.equal(inheritedBody.x, 50);
  assert.equal(inheritedBody.y, 150);
  assert.equal(inheritedBody.w, 500);
  assert.equal(inheritedBody.h, 225);
  assert.equal(inheritedBody.fontSize, 24);

  const inheritedTitle = slide3.elements.find(element => element.text === '继承标题');
  assert.ok(inheritedTitle, JSON.stringify(slide3.elements.map(element => element.text)));
  assert.equal(inheritedTitle.type, 'text');
  assert.equal(inheritedTitle.x, 50);
  assert.equal(inheritedTitle.y, 25);
  assert.equal(inheritedTitle.w, 500);
  assert.equal(inheritedTitle.h, 75);
  assert.equal(inheritedTitle.fontSize, 30);
  assert.equal(inheritedTitle.color, '#FFFFFF');

  assert.ok(template.backdrops, 'template.backdrops');
  assert.equal(Object.keys(template.backdrops).length, 2);
  assert.equal(slide1.backdropId, undefined);
  assert.notEqual(slide3.backdropId, slide2.backdropId);
  const backdropSvg = id => Buffer.from(template.backdrops[id].split(',')[1], 'base64').toString('utf8');
  const sharedBackdrop = backdropSvg(slide2.backdropId);
  assert.match(sharedBackdrop, /013E80/);
  assert.match(sharedBackdrop, /445566/);
  assert.match(sharedBackdrop, /MASTER-LOGO/);
  assert.match(sharedBackdrop, /<polygon/);
  assert.doesNotMatch(sharedBackdrop, /MASTER-PLACEHOLDER-TEXT/);
  assert.doesNotMatch(sharedBackdrop, /第一页标题/);
  const layoutOnlyBackdrop = backdropSvg(slide3.backdropId);
  assert.match(layoutOnlyBackdrop, /013E80/);
  assert.doesNotMatch(layoutOnlyBackdrop, /445566/);
  assert.doesNotMatch(layoutOnlyBackdrop, /MASTER-LOGO/);

  const ellipse = slide2.elements.find(element => element.type === 'shape');
  assert.equal(ellipse.shape, 'ellipse');
  assert.equal(ellipse.fill, '#445566');
  assert.equal(ellipse.text, '椭圆');
  assert.equal(ellipse.fontSize, 12);
  assert.equal(ellipse.x, 562.5);
  assert.equal(ellipse.y, 375);
  assert.equal(ellipse.w, 75);
  assert.equal(ellipse.h, 75);

  const chart = slide3.elements.find(element => element.type === 'chart');
  assert.ok(chart);
  assert.equal(chart.chartType, 'column');
  assert.deepEqual(chart.data.labels, ['一', '二', '三']);
  assert.deepEqual(chart.data.series, [
    { name: 'A', values: [1, 2, 3] },
    { name: 'B', values: [4, 5, 6] },
  ]);
  assert.equal(chart.x, 100);
  assert.equal(chart.y, 150);
  assert.equal(chart.w, 600);
  assert.equal(chart.h, 300);
  assert.ok(slide3.elements.some(element => element.type === 'text' && element.text === '第三页'));

  assert.ok(warnings.some(warning => warning.includes('不支持的结构')), JSON.stringify(warnings));
  assert.ok(!warnings.some(warning => warning.includes('未识别')), JSON.stringify(warnings));

  assert.equal(bindings.version, 1);
  assert.equal(bindings.sha256.length, 64);
  assert.equal(bindings.canvas.cx, 12192000);
  assert.deepEqual(bindings.order, template.slides.map(slide => slide.id));
  const titleBinding = bindings.slides[slide1.id].elements[title.id];
  assert.equal(titleBinding.shapeId, '2');
  const groupedBinding = bindings.slides[slide1.id].elements[grouped.id];
  assert.equal(groupedBinding.inGroup, true);
  assert.equal(groupedBinding.path.length, 2);
  assert.equal(bindings.slides[slide3.id].elements[chart.id].chartPart, 'ppt/charts/chart1.xml');
  assert.equal(bindings.backdrops[slide2.backdropId].layoutPart, 'ppt/slideLayouts/slideLayout1.xml');
  assert.equal(bindings.backdrops[slide2.backdropId].includeMaster, true);
  assert.equal(bindings.backdrops[slide3.backdropId].includeMaster, false);
  assert.equal(bindings.package.defaultLayout, 'ppt/slideLayouts/slideLayout2.xml');
});

// 2x1 PNG: a real image whose aspect ratio differs from a square frame.
const PNG_2X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwPCfAQAI/wH/eBaFJAAAAABJRU5ErkJggg==';

test('native export writes radius, stroke visibility, image fit and table alignment', async () => {
  const image = `data:image/png;base64,${PNG_2X1}`;
  const project = normalizeProject({
    title: 'Formats',
    slides: [{
      id: 's_formats',
      elements: [
        { id: 'e_round', type: 'shape', shape: 'roundRect', x: 100, y: 100, w: 200, h: 100, radius: 40, fill: '#ffffff', stroke: '#112233', strokeWidth: 2 },
        { id: 'e_square', type: 'shape', shape: 'roundRect', x: 400, y: 100, w: 200, h: 100, radius: 0, fill: '#ffffff', stroke: '#112233', strokeWidth: 0 },
        { id: 'e_table', type: 'table', x: 100, y: 250, w: 400, h: 160, rotate: 30, rows: [['A', 'B'], ['1', '2']], align: 'center' },
        { id: 'e_contain', type: 'image', src: image, fit: 'contain', x: 100, y: 450, w: 200, h: 200 },
        { id: 'e_cover', type: 'image', src: image, fit: 'cover', x: 400, y: 450, w: 200, h: 200 },
      ],
    }],
  });
  const dir = await temp();
  try {
    const out = await buildPptx(project, { outDir: dir });
    const zip = await JSZip.loadAsync(await readFile(out.path));
    const xml = await zip.file('ppt/slides/slide1.xml').async('text');
    const shapeXml = id => (xml.match(new RegExp(`<p:sp>(?:(?!</p:sp>)[\\s\\S])*?name="${id}"[\\s\\S]*?</p:sp>`)) || [''])[0];
    const round = shapeXml('e_round');
    assert.match(round, /prst="roundRect"/, round);
    assert.match(round, /<a:gd name="adj" fmla="val 40000"\/>/, round);
    assert.match(round, /<a:solidFill><a:srgbClr val="112233"\/><\/a:solidFill>/, round);
    const square = shapeXml('e_square');
    assert.match(square, /prst="rect"/, square);
    assert.ok(!/<a:ln[^>]*>[\s\S]*?<a:solidFill>/.test(square), square);
    const table = (xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/) || [''])[0];
    assert.ok(table.includes('algn="ctr"'), table);
    assert.ok(!table.includes('algn="l"'), table);
    assert.match(xml, /<p:xfrm rot="1800000">/, xml);
    const pictures = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) || [];
    const contain = pictures.find(pic => pic.includes('name="e_contain"')) || '';
    const cover = pictures.find(pic => pic.includes('name="e_cover"')) || '';
    assert.match(contain, /<a:srcRect l="0" r="0" t="-50000" b="-50000"\/>/, contain);
    assert.match(cover, /<a:srcRect l="25000" r="25000" t="0" b="0"\/>/, cover);
    assert.match(contain, /<a:ext cx="1828800" cy="1828800"\/>/, contain);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('import reads rounded-corner radius and table alignment defaults', async () => {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  const slide = pptx.addSlide();
  slide.addText('圆角', { shape: pptx.ShapeType.roundRect, x: 1, y: 1, w: 4, h: 2, fill: { color: 'FFFFFF' } });
  slide.addTable([['A', 'B'], ['1', '2']], { x: 5, y: 1, w: 4, h: 2 });
  const { template } = await importPptx(await pptx.write({ outputType: 'nodebuffer' }), { filename: 'shapes.pptx' });
  const round = template.slides[0].elements.find(element => element.type === 'shape' && element.shape === 'roundRect');
  const table = template.slides[0].elements.find(element => element.type === 'table');
  assert.ok(round);
  // 2in high (200 canvas units) with PowerPoint's default 16667 adjustment.
  assert.equal(round.radius, 33.33);
  assert.equal(table.align, 'left');
});

test('legacy table baselines without alignment keep their original XML', async () => {
  const source = await buildFixture();
  const { template, bindings } = await importPptx(source, { filename: 'fixture.pptx' });
  const project = projectFrom(template);
  const slide = project.slides.find(item => item.elements.some(element => element.type === 'table'));
  const table = slide.elements.find(element => element.type === 'table');
  const binding = bindings.slides[slide.id].elements[table.id];
  delete table.align;
  delete binding.baseline.align;
  // normalizeProject on the next save would add the default; exercise the
  // exporter directly with the legacy shape to prove comparison compatibility.
  const dir = await temp();
  try {
    const out = await exportDeck(project, bindings, dir, source);
    const original = await JSZip.loadAsync(source);
    const exported = await JSZip.loadAsync(out.buffer);
    const slidePart = Object.keys(original.files).find(name => /^ppt\/slides\/slide\d+\.xml$/.test(name) && name.includes('slide2'));
    assert.equal(
      await exported.file(slidePart).async('text'),
      await original.file(slidePart).async('text'),
      'legacy tables must stay byte-for-byte identical',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('untouched import exports the original package parts byte-for-byte', async () => {
  const source = await buildFixture();
  const { template, bindings } = await importPptx(source, { filename: 'fixture.pptx' });
  const project = projectFrom(template);
  const dir = await temp();
  try {
    const sourceHash = createHash('sha256').update(source).digest('hex');
    const out = await exportDeck(project, bindings, dir, source);
    const original = await JSZip.loadAsync(source);
    const exported = await JSZip.loadAsync(out.buffer);
    const textParts = [
      '[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels', 'ppt/slides/slide1.xml',
      'ppt/slides/slide2.xml', 'ppt/slides/slide3.xml',
      'ppt/slides/_rels/slide1.xml.rels', 'ppt/slides/_rels/slide2.xml.rels',
      'ppt/slides/_rels/slide3.xml.rels', 'ppt/notesSlides/notesSlide1.xml',
      'ppt/charts/chart1.xml', 'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml',
      'docProps/core.xml',
    ];
    for (const part of textParts) {
      assert.equal(
        await exported.file(part).async('text'),
        await original.file(part).async('text'),
        `${part} must be untouched`,
      );
    }
    assert.deepEqual(
      await exported.file('ppt/media/image1.png').async('nodebuffer'),
      await original.file('ppt/media/image1.png').async('nodebuffer'),
    );
    assert.equal(await exported.file('ppt/media/preserved.dat').async('text'), 'PRESERVED-BYTES');
    assert.equal(out.slides, 3);
    assert.equal(out.filename, 'Fixture Deck-r1.pptx');
    assert.equal(createHash('sha256').update(await readFile(join(dir, 'source.pptx'))).digest('hex'), sourceHash);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('edits, deletion, addition and reordering write real content and keep unknown parts', async () => {
  const source = await buildFixture();
  const { template, bindings } = await importPptx(source, { filename: 'fixture.pptx' });
  let project = projectFrom(template);
  const originalZip = await JSZip.loadAsync(source);
  const originalChart = await originalZip.file('ppt/charts/chart1.xml').async('text');
  const originalSlide3 = await originalZip.file('ppt/slides/slide3.xml').async('text');
  const sourceHash = createHash('sha256').update(source).digest('hex');
  const dir = await temp();
  try {
    const slide1 = project.slides[0];
    const slide2 = project.slides[1];
    const slide3 = project.slides[2];
    const title = slide1.elements.find(element => element.text === '第一页标题');
    const grouped = slide1.elements.find(element => element.text === '组合文本');
    const image = slide1.elements.find(element => element.type === 'image');
    const table = slide2.elements.find(element => element.type === 'table');
    const inheritedBody = slide2.elements.find(element => element.text === '目录文本');

    project = applyOperations(project, [
      {
        type: 'updateElement',
        slideId: slide1.id,
        elementId: title.id,
        props: { text: '修改后的标题', x: 125, y: 68.75, fontSize: 32, bold: true, color: '#123456', align: 'left' },
      },
      {
        type: 'updateElement',
        slideId: slide1.id,
        elementId: grouped.id,
        props: { text: '组合修改', bold: true, fontSize: 20, color: '#ABCDEF' },
      },
      { type: 'removeElement', slideId: slide1.id, elementId: image.id },
      {
        type: 'addElement',
        slideId: slide1.id,
        element: { id: 'e_new_text', type: 'text', x: 200, y: 300, w: 400, h: 60, text: '新增文本', fontSize: 24, color: '#654321', align: 'left' },
      },
      {
        type: 'updateElement',
        slideId: slide2.id,
        elementId: inheritedBody.id,
        props: { text: '目录已改' },
      },
      {
        type: 'updateElement',
        slideId: slide2.id,
        elementId: table.id,
        props: { rows: [['新表头', '数值'], ['行一', '7']], fontSize: 18, color: '#111111', headerFill: '#223344' },
      },
      { type: 'addSlide', afterId: slide1.id },
    ]).project;

    const newSlide = project.slides[1];
    project = applyOperations(project, [
      { type: 'updateSlide', slideId: newSlide.id, note: '新页备注' },
      {
        type: 'addElement',
        slideId: newSlide.id,
        element: { id: 'e_new_slide_text', type: 'text', x: 100, y: 100, w: 500, h: 80, text: '新页内容', fontSize: 28, color: '#333333', align: 'left' },
      },
      {
        type: 'addElement',
        slideId: newSlide.id,
        element: { id: 'e_new_slide_image', type: 'image', x: 100, y: 250, w: 120, h: 120, src: `data:image/png;base64,${PNG_1X1}`, fit: 'contain' },
      },
      { type: 'moveSlide', slideId: project.slides[3].id, to: 0 },
    ]).project;
    project.revision = 2;

    const out = await exportDeck(project, bindings, dir, source);
    const zip = await JSZip.loadAsync(out.buffer);
    const slide1Xml = await zip.file('ppt/slides/slide1.xml').async('text');
    assert.match(slide1Xml, /修改后的标题/);
    assert.doesNotMatch(slide1Xml, /<p:pic\b/);
    assert.match(slide1Xml, /UNKNOWN-EXT-MARKER/);
    assert.match(slide1Xml, /<a:off x="1524000" y="838200"\/>/);
    assert.match(slide1Xml, /sz="3200"/);
    assert.match(slide1Xml, /b="1"/);
    assert.match(slide1Xml, /val="123456"/);
    assert.match(slide1Xml, /新增文本/);
    assert.match(slide1Xml, /val="654321"/);
    assert.match(slide1Xml, /<a:off x="2438400" y="3657600"\/>/);
    assert.match(slide1Xml, /组合修改/);
    assert.match(slide1Xml, /sz="2000"/);
    assert.match(slide1Xml, /val="ABCDEF"/);
    assert.match(slide1Xml, /<p:grpSp>/);
    assert.match(slide1Xml, /<a:off x="91440" y="91440"\/>/);
    assert.match(slide1Xml, /<a:ext cx="457200" cy="228600"\/>/);

    const slide2Xml = await zip.file('ppt/slides/slide2.xml').async('text');
    assert.match(slide2Xml, /新表头/);
    assert.match(slide2Xml, /行一/);
    assert.match(slide2Xml, /val="223344"/);
    assert.doesNotMatch(slide2Xml, /列A/);
    assert.match(slide2Xml, /目录已改/);
    assert.match(slide2Xml, /<a:off x="609600" y="1828800"\/>/);
    assert.match(slide2Xml, /<a:ext cx="6096000" cy="2743200"\/>/);

    assert.equal(await zip.file('ppt/slides/slide3.xml').async('text'), originalSlide3);
    assert.equal(await zip.file('ppt/charts/chart1.xml').async('text'), originalChart);

    const presentationXml = await zip.file('ppt/presentation.xml').async('text');
    const presentationRels = await zip.file('ppt/_rels/presentation.xml.rels').async('text');
    assert.deepEqual(partText(presentationXml, presentationRels, '/slide'), [
      'slides/slide3.xml',
      'slides/slide1.xml',
      'slides/slide4.xml',
      'slides/slide2.xml',
    ]);

    const newSlideXml = await zip.file('ppt/slides/slide4.xml').async('text');
    assert.match(newSlideXml, /新页内容/);
    assert.match(newSlideXml, /<p:pic\b/);
    assert.ok(zip.file('ppt/slides/_rels/slide4.xml.rels'));
    const notesParts = Object.keys(zip.files).filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
    const notesText = await Promise.all(notesParts.map(name => zip.file(name).async('text')));
    assert.ok(notesText.some(text => text.includes('新页备注')));
    assert.ok(notesParts.length >= 2);
    assert.ok((await zip.file('ppt/media/image1.png').async('nodebuffer')).length > 0);
    assert.ok(Object.keys(zip.files).some(name => name.startsWith('ppt/media/image') && name.endsWith('.png') && name !== 'ppt/media/image1.png'));
    assert.equal(await zip.file('ppt/media/preserved.dat').async('text'), 'PRESERVED-BYTES');

    const contentTypes = await zip.file('[Content_Types].xml').async('text');
    assert.match(contentTypes, /PartName="\/ppt\/slides\/slide4.xml"/);
    assert.match(contentTypes, /PartName="\/ppt\/notesSlides\/notesSlide2.xml"/);

    assert.equal(createHash('sha256').update(await readFile(join(dir, 'source.pptx'))).digest('hex'), sourceHash);
    assert.equal(out.slides, 4);

    const again = await importPptx(out.buffer, { filename: 'roundtrip.pptx' });
    assert.equal(again.template.slides.length, 4);
    assert.ok(again.template.slides[0].elements.some(element => element.text === '第三页'));
    const reimportedEdited = again.template.slides
      .flatMap(slide => slide.elements)
      .find(element => element.text === '组合修改');
    assert.ok(reimportedEdited);
    assert.equal(reimportedEdited.type, 'shape');
    assert.equal(reimportedEdited.bold, true);
    assert.equal(reimportedEdited.fontSize, 20);
    assert.equal(reimportedEdited.color, '#ABCDEF');
    assert.equal(reimportedEdited.x, 15);
    assert.equal(reimportedEdited.y, 15);
    const reimportedNew = again.template.slides.find(slide => slide.elements.some(element => element.text === '新页内容'));
    assert.ok(reimportedNew);
    assert.equal(reimportedNew.note, '新页备注');
    assert.ok(reimportedNew.elements.some(element => element.type === 'image'));
    const reimportedTable = again.template.slides
      .flatMap(slide => slide.elements)
      .find(element => element.type === 'table');
    assert.deepEqual(reimportedTable.rows, [['新表头', '数值'], ['行一', '7']]);
    assert.equal(reimportedTable.headerFill, '#223344');
    const reimportedInherited = again.template.slides
      .flatMap(slide => slide.elements)
      .find(element => element.text === '目录已改');
    assert.ok(reimportedInherited);
    assert.equal(reimportedInherited.x, 50);
    assert.equal(reimportedInherited.y, 150);
    assert.equal(reimportedInherited.w, 500);
    assert.equal(reimportedInherited.h, 225);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('chart data edits are written as a native editable chart part', async () => {
  const source = await buildFixture();
  const { template, bindings } = await importPptx(source, { filename: 'fixture.pptx' });
  let project = projectFrom(template);
  const chart = project.slides[2].elements.find(element => element.type === 'chart');
  project = applyOperations(project, [{
    type: 'updateElement',
    slideId: project.slides[2].id,
    elementId: chart.id,
    props: {
      chartType: 'line',
      data: { labels: ['甲', '乙'], series: [{ name: 'C', values: [9, 8] }] },
      x: 150,
    },
  }]).project;
  const dir = await temp();
  try {
    const out = await exportDeck(project, bindings, dir, source);
    const zip = await JSZip.loadAsync(out.buffer);
    const chartXml = await zip.file('ppt/charts/chart1.xml').async('text');
    assert.match(chartXml, /<c:lineChart>/);
    assert.doesNotMatch(chartXml, /<c:barChart>/);
    assert.match(chartXml, /甲/);
    assert.match(chartXml, /乙/);
    assert.match(chartXml, /<c:v>9<\/c:v>/);
    assert.match(chartXml, /<c:v>8<\/c:v>/);
    assert.match(chartXml, /Sheet1!/);
    const slide3Xml = await zip.file('ppt/slides/slide3.xml').async('text');
    assert.match(slide3Xml, /<a:off x="1828800" y="1828800"\/>/);
    const again = await importPptx(out.buffer, { filename: 'chart.pptx' });
    const reimported = again.template.slides[2].elements.find(element => element.type === 'chart');
    assert.equal(reimported.chartType, 'line');
    assert.deepEqual(reimported.data.labels, ['甲', '乙']);
    assert.deepEqual(reimported.data.series, [{ name: 'C', values: [9, 8] }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('image source/fit edits embed new media and keep rotation', async () => {
  const source = await buildFixture();
  const { template, bindings } = await importPptx(source, { filename: 'fixture.pptx' });
  let project = projectFrom(template);
  const slide1 = project.slides[0];
  const image = slide1.elements.find(element => element.type === 'image');
  // Same bytes with a folded base64 line: a genuinely different src string,
  // which forces a new media relationship while remaining a valid PNG payload.
  const rewritten = `${PNG_1X1.slice(0, 24)}\n${PNG_1X1.slice(24)}`;
  project = applyOperations(project, [{
    type: 'updateElement',
    slideId: slide1.id,
    elementId: image.id,
    props: { src: `data:image/png;base64,${rewritten}`, fit: 'contain', x: 200, y: 300, w: 200, h: 100 },
  }]).project;
  const dir = await temp();
  try {
    const out = await exportDeck(project, bindings, dir, source);
    const zip = await JSZip.loadAsync(out.buffer);
    const slide1Xml = await zip.file('ppt/slides/slide1.xml').async('text');
    const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('text');
    assert.match(slide1Xml, /<p:pic>/);
    const imageRel = (rels.match(/<Relationship\b[^>]*\/>/g) || [])
      .find(tag => /media\/image2\.png/.test(tag));
    assert.ok(imageRel, rels);
    const imageRelId = imageRel.match(/Id="([^"]+)"/)[1];
    assert.match(slide1Xml, new RegExp(`r:embed="${imageRelId}"`));
    assert.ok(zip.file('ppt/media/image2.png'));
    assert.ok(zip.file('ppt/media/image1.png'));
    // contain for a 1:1 image in a 2:1 box: centered 100x100 at x=150, y=300.
    assert.match(slide1Xml, /<a:off x="3048000" y="3657600"\/>/);
    assert.match(slide1Xml, /<a:ext cx="1219200" cy="1219200"\/>/);
    assert.match(slide1Xml, /rot="1800000"/);
    const again = await importPptx(out.buffer, { filename: 'image.pptx' });
    const reimported = again.template.slides[0].elements.find(element => element.type === 'image');
    assert.equal(reimported.rotate, 30);
    assert.equal(reimported.x, 250);
    assert.equal(reimported.y, 300);
    assert.equal(reimported.w, 100);
    assert.equal(reimported.h, 100);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('new slides export with the inherited backdrop layout and master visibility', async () => {
  const source = await buildFixture();
  const { template, bindings } = await importPptx(source, { filename: 'fixture.pptx' });
  let project = projectFrom(template);
  project = applyOperations(project, [
    { type: 'addSlide', afterId: project.slides[1].id },
  ]).project;
  const afterBody = project.slides[2];
  assert.equal(afterBody.backdropId, project.slides[1].backdropId);
  project = applyOperations(project, [
    { type: 'addSlide', afterId: project.slides[3].id },
  ]).project;
  const afterLayoutOnly = project.slides[4];
  assert.equal(afterLayoutOnly.backdropId, project.slides[3].backdropId);
  const dir = await temp();
  try {
    const out = await exportDeck(project, bindings, dir, source);
    const zip = await JSZip.loadAsync(out.buffer);
    for (const part of ['ppt/slides/slide4.xml', 'ppt/slides/slide5.xml']) {
      const rels = await zip.file(`ppt/slides/_rels/${part.split('/').pop()}.rels`).async('text');
      assert.match(rels, /slideLayouts\/slideLayout1\.xml/, part);
    }
    const slide4 = await zip.file('ppt/slides/slide4.xml').async('text');
    const slide5 = await zip.file('ppt/slides/slide5.xml').async('text');
    assert.doesNotMatch(slide4, /showMasterSp="0"/);
    assert.match(slide5, /showMasterSp="0"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('removing a slide drops its part, relationship, sldId and content type', async () => {
  const source = await buildFixture();
  const { template, bindings } = await importPptx(source, { filename: 'fixture.pptx' });
  let project = projectFrom(template);
  project = applyOperations(project, [{ type: 'removeSlide', slideId: project.slides[1].id }]).project;
  const dir = await temp();
  try {
    const out = await exportDeck(project, bindings, dir, source);
    const zip = await JSZip.loadAsync(out.buffer);
    assert.equal(zip.file('ppt/slides/slide2.xml'), null);
    assert.equal(zip.file('ppt/slides/_rels/slide2.xml.rels'), null);
    const contentTypes = await zip.file('[Content_Types].xml').async('text');
    assert.doesNotMatch(contentTypes, /PartName="\/ppt\/slides\/slide2.xml"/);
    const presentationXml = await zip.file('ppt/presentation.xml').async('text');
    const presentationRels = await zip.file('ppt/_rels/presentation.xml.rels').async('text');
    assert.deepEqual(partText(presentationXml, presentationRels, '/slide'), ['slides/slide1.xml', 'slides/slide3.xml']);
    assert.doesNotMatch(presentationRels, /slides\/slide2\.xml/);
    assert.ok(zip.file('ppt/media/preserved.dat'));

    const again = await importPptx(out.buffer, { filename: 'deleted.pptx' });
    assert.equal(again.template.slides.length, 2);
    assert.ok(!again.template.slides.some(slide => slide.elements.some(element => element.type === 'table')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('unsafe packages and size limits are rejected with ProjectError codes', async () => {
  await assert.rejects(
    () => importPptx(Buffer.from('not a zip'), { filename: 'broken.pptx' }),
    error => error instanceof ProjectError && error.code === 'invalid_pptx',
  );

  const dtdZip = await JSZip.loadAsync(await buildFixture());
  const slide1 = await dtdZip.file('ppt/slides/slide1.xml').async('text');
  dtdZip.file('ppt/slides/slide1.xml', slide1.replace('<p:sld ', '<!DOCTYPE p:sld [<!ENTITY fx "x">]><p:sld '));
  const dtdBuffer = await dtdZip.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(
    () => importPptx(dtdBuffer, { filename: 'dtd.pptx' }),
    error => error instanceof ProjectError && error.code === 'unsafe_xml' && /DTD/.test(error.message),
  );

  const traversal = new JSZip();
  traversal.file('[Content_Types].xml', `${XML_HEAD}<Types xmlns="${CT}"/>`);
  traversal.file('..\\evil.xml', '<x/>');
  const traversalBuffer = await traversal.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(
    () => importPptx(traversalBuffer, { filename: 'traversal.pptx' }),
    error => error instanceof ProjectError && error.code === 'unsafe_path',
  );

  const oversized = Buffer.alloc(50 * 1024 * 1024 + 1);
  await assert.rejects(
    () => importPptx(oversized, { filename: 'large.pptx' }),
    error => error instanceof ProjectError && error.code === 'limit_exceeded',
  );
});

test('export refuses a changed source package and missing bindings', async () => {
  const source = await buildFixture();
  const { template, bindings } = await importPptx(source, { filename: 'fixture.pptx' });
  const project = projectFrom(template);
  const dir = await temp();
  try {
    await assert.rejects(
      () => exportImportedPptx(project, { sourcePath: join(dir, 'missing.pptx'), bindings, outDir: dir }),
      error => error instanceof ProjectError && error.code === 'not_found',
    );
    const sourcePath = join(dir, 'source.pptx');
    await writeFile(sourcePath, Buffer.concat([source, Buffer.from('tampered')]));
    await assert.rejects(
      () => exportImportedPptx(project, { sourcePath, bindings, outDir: dir }),
      error => error instanceof ProjectError && error.code === 'source_changed',
    );
    await assert.rejects(
      () => exportImportedPptx(project, { sourcePath, outDir: dir }),
      error => error instanceof ProjectError && error.code === 'invalid_bindings',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function buildRichFixture() {
  const parts = fixtureParts();
  parts['ppt/charts/_rels/chart1.xml.rels'] = `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${R}/package" Target="../embeddings/Microsoft_Excel_Worksheet1.xlsx"/><Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2011/relationships/chartStyle" Target="style1.xml"/><Relationship Id="rId3" Type="http://schemas.microsoft.com/office/2011/relationships/chartColorStyle" Target="colors1.xml"/></Relationships>`;
  parts['ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx'] = Buffer.from('WORKBOOK-BYTES', 'utf8');
  parts['ppt/charts/style1.xml'] = `${XML_HEAD}<cs:chartStyle xmlns:cs="urn:fixture:chart:style"><cs:marker>STYLE-MARKER</cs:marker></cs:chartStyle>`;
  parts['ppt/charts/colors1.xml'] = `${XML_HEAD}<cs:colorStyle xmlns:cs="urn:fixture:chart:colors"><cs:marker>COLORS-MARKER</cs:marker></cs:colorStyle>`;
  parts['ppt/notesSlides/_rels/notesSlide1.xml.rels'] = `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${R}/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="${R}/slide" Target="../slides/slide1.xml"/></Relationships>`;
  parts['[Content_Types].xml'] = parts['[Content_Types].xml'].replace('</Types>', '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/><Override PartName="/ppt/charts/style1.xml" ContentType="application/vnd.ms-office.chartstyle+xml"/><Override PartName="/ppt/charts/colors1.xml" ContentType="application/vnd.ms-office.chartcolorstyle+xml"/></Types>');
  const zip = new JSZip();
  for (const [name, content] of Object.entries(parts)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}
async function richImport() {
  const source = await buildRichFixture();
  const { template, bindings } = await importPptx(source, { filename: 'fixture.pptx' });
  return { source, template, bindings, project: projectFrom(template) };
}

const assertInternalTargetsExist = async zip => {
  for (const name of Object.keys(zip.files)) {
    if (!/(^|\/)_rels\/[^/]+\.rels$/.test(name)) continue;
    const base = name.replace(/_rels\/[^/]+\.rels$/, '');
    const xml = await zip.file(name).async('text');
    for (const tag of xml.match(/<Relationship\b[^>]*\/>/g) || []) {
      if (/TargetMode="External"/.test(tag)) continue;
      const target = tag.match(/Target="([^"]+)"/)?.[1];
      if (!target) continue;
      const resolved = target.split('/').reduce((stack, part) => {
        if (!part || part === '.') return stack;
        if (part === '..') { stack.pop(); return stack; }
        stack.push(part);
        return stack;
      }, base.split('/').filter(Boolean)).join('/');
      assert.ok(zip.file(resolved), `${name} target ${target} resolves to a real part`);
    }
  }
};

test('duplicated imported pages own their notes, charts and unknown XML', async () => {
  const { source, bindings, project: base } = await richImport();
  const originalZip = await JSZip.loadAsync(source);
  const sourceHash = createHash('sha256').update(source).digest('hex');
  const dir = await temp();
  try {
    const [slide1, , slide3] = base.slides;
    let project = base;
    project = applyOperations(project, [{ type: 'duplicateSlide', slideId: slide1.id }]).project;
    project = applyOperations(project, [{ type: 'duplicateSlide', slideId: slide1.id }]).project;
    project = applyOperations(project, [{ type: 'duplicateSlide', slideId: slide3.id }]).project;
    project = applyOperations(project, [
      { type: 'updateElement', slideId: slide1.id, elementId: slide1.elements.find(element => element.text === '第一页标题').id, props: { text: 'ORIGINAL-TITLE' } },
      { type: 'updateSlide', slideId: slide1.id, note: 'ORIGINAL-NOTE' },
    ]).project;
    const copy1 = project.slides[1];
    const copy2 = project.slides[2];
    const chartCopy = project.slides.find(slide => slide.sourceSlideId === slide3.id);
    project = applyOperations(project, [
      { type: 'updateElement', slideId: copy1.id, elementId: copy1.elements.find(element => element.text === '第一页标题').id, props: { text: 'COPY1-TITLE' } },
      { type: 'updateSlide', slideId: copy1.id, note: 'COPY1-NOTE' },
      { type: 'updateElement', slideId: copy2.id, elementId: copy2.elements.find(element => element.text === '第一页标题').id, props: { text: 'COPY2-TITLE' } },
      { type: 'updateSlide', slideId: copy2.id, note: 'COPY2-NOTE' },
      { type: 'updateElement', slideId: chartCopy.id, elementId: chartCopy.elements.find(element => element.type === 'chart').id, props: { data: { labels: ['七', '八', '九'], series: [{ name: '副本', values: [7, 8, 9] }] } } },
      { type: 'moveSlide', slideId: copy2.id, to: 0 },
      { type: 'removeSlide', slideId: slide1.id },
    ]).project;
    const out = await exportDeck(project, bindings, dir, source);
    const exported = await JSZip.loadAsync(out.buffer);
    await assertInternalTargetsExist(exported);
    const slideParts = Object.keys(exported.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    const texts = await Promise.all(slideParts.map(name => exported.file(name).async('text')));
    assert.ok(texts.some(text => text.includes('COPY1-TITLE')), 'the first copy keeps its own title');
    assert.ok(texts.some(text => text.includes('COPY2-TITLE')), 'the second copy keeps its own title');
    assert.ok(!texts.some(text => text.includes('ORIGINAL-TITLE')), 'the deleted original is gone');
    const markedCopies = texts.filter(text => text.includes('COPY1-TITLE') || text.includes('COPY2-TITLE'));
    assert.equal(markedCopies.length, 2);
    assert.ok(markedCopies.every(text => text.includes('UNKNOWN-EXT-MARKER')), 'unknown slide XML survives in every copy');
    const notesParts = Object.keys(exported.files).filter(name => /^ppt\/notesSlides\/notesSlide(?:Copy)?\d+\.xml$/.test(name));
    const notes = await Promise.all(notesParts.map(name => exported.file(name).async('text')));
    assert.ok(notes.some(text => text.includes('COPY1-NOTE')));
    assert.ok(notes.some(text => text.includes('COPY2-NOTE')));
    assert.ok(!notes.some(text => text.includes('ORIGINAL-NOTE')), 'the deleted original note is not reused');
    assert.equal(new Set(slideParts).size, slideParts.length);
    const chartParts = Object.keys(exported.files).filter(name => /^ppt\/charts\/chart(?:Copy)?\d+\.xml$/.test(name));
    const charts = await Promise.all(chartParts.map(name => exported.file(name).async('text')));
    assert.ok(charts.some(text => text.includes('<c:v>7</c:v>')), 'the copy chart has its edited values');
    assert.ok(charts.some(text => text.includes('<c:v>1</c:v>')), 'the original chart keeps its values');
    const styleParts = Object.keys(exported.files).filter(name => /^ppt\/charts\/styleCopy\d+\.xml$/.test(name));
    const colorParts = Object.keys(exported.files).filter(name => /^ppt\/charts\/colorsCopy\d+\.xml$/.test(name));
    const workbookParts = Object.keys(exported.files).filter(name => /^ppt\/embeddings\/Microsoft_Excel_WorksheetCopy\d+\.xlsx$/.test(name));
    assert.ok(styleParts.length >= 1, 'chart style has an independent part');
    assert.ok(colorParts.length >= 1, 'chart colors have an independent part');
    assert.ok(workbookParts.length >= 1, 'the embedded workbook has an independent part');
    for (const name of workbookParts) assert.equal(await exported.file(name).async('text'), 'WORKBOOK-BYTES');
    assert.equal(await exported.file('ppt/charts/style1.xml').async('text'), await originalZip.file('ppt/charts/style1.xml').async('text'));
    assert.equal(createHash('sha256').update(await readFile(join(dir, 'source.pptx'))).digest('hex'), sourceHash, 'the source package is untouched');
    for (const shared of ['ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml', 'ppt/media/preserved.dat']) {
      assert.ok(exported.file(shared), `${shared} stays in the package`);
    }
    const reimported = await importPptx(out.buffer, { filename: 'roundtrip.pptx' });
    const round = projectFrom(reimported.template);
    const roundTexts = round.slides.map(slide => slide.elements.map(element => element.text || '').join('|'));
    assert.ok(roundTexts.some(text => text.includes('COPY1-TITLE')));
    assert.ok(roundTexts.some(text => text.includes('COPY2-TITLE')));
    const roundCharts = round.slides.flatMap(slide => slide.elements).filter(element => element.type === 'chart');
    assert.ok(roundCharts.some(chart => chart.data.series.some(series => series.values.join(',') === '7,8,9')), 'the copied chart data round-trips');
    assert.ok(roundCharts.some(chart => chart.data.series.some(series => series.values.join(',') === '1,2,3')), 'the original chart data round-trips');
    const roundNotes = round.slides.map(slide => slide.note);
    assert.ok(roundNotes.includes('COPY1-NOTE'));
    assert.ok(roundNotes.includes('COPY2-NOTE'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('page-count-equal copies are never mapped by import order', async () => {
  const { bindings, project: base } = await richImport();
  const dir = await temp();
  try {
    let project = base;
    for (let index = 0; index < 3; index += 1) {
      project = applyOperations(project, [{ type: 'duplicateSlide', slideId: base.slides[0].id }]).project;
    }
    const copies = project.slides.filter(slide => slide.sourceSlideId === base.slides[0].id);
    assert.equal(copies.length, 3);
    const edits = copies.map((slide, index) => ({
      type: 'updateElement',
      slideId: slide.id,
      elementId: slide.elements[0].id,
      props: { text: `COPY-${index + 1}` },
    }));
    const removals = project.slides.filter(slide => !slide.sourceSlideId).map(slide => ({ type: 'removeSlide', slideId: slide.id }));
    project = applyOperations(project, [...edits, ...removals]).project;
    assert.equal(project.slides.length, 3);
    const source = await buildRichFixture();
    const out = await exportDeck(project, bindings, dir, source);
    const exported = await JSZip.loadAsync(out.buffer);
    const parts = Object.keys(exported.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    const texts = await Promise.all(parts.map(name => exported.file(name).async('text')));
    for (const label of ['COPY-1', 'COPY-2', 'COPY-3']) assert.ok(texts.some(text => text.includes(label)), `${label} keeps its own page`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a copy whose source part is missing reports source_changed', async () => {
  const { bindings, project: base } = await richImport();
  const dir = await temp();
  try {
    const project = applyOperations(base, [{ type: 'duplicateSlide', slideId: base.slides[0].id }]).project;
    const damaged = { ...bindings, slides: { ...bindings.slides, [base.slides[0].id]: { ...bindings.slides[base.slides[0].id], part: 'ppt/slides/missing.xml' } } };
    const source = await buildRichFixture();
    await assert.rejects(
      () => exportDeck(project, damaged, dir, source),
      error => error instanceof ProjectError && error.code === 'source_changed',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
