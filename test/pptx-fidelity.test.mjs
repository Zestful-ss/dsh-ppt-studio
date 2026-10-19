import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { newProject, applyOperations } from '../lib/project.js';
import { buildPptx } from '../lib/export.js';

test('real PPTX ZIP output: contains native editable text, table fills, chart series, and notes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ppt-studio-fidelity-'));
  try {
    const project = newProject('保真度验证演示');
    project.theme.fontName = 'Arial';
    const sId = project.slides[0].id;

    const populated = applyOperations(project, [
      {
        type: 'updateSlide',
        slideId: sId,
        note: '这是关键的演讲者备注内容',
      },
      {
        type: 'addElement',
        slideId: sId,
        element: {
          type: 'text',
          x: 100,
          y: 80,
          w: 500,
          h: 60,
          text: '原生文本元素',
          fontSize: 36,
          color: '#e24b2b',
          bold: true,
        },
      },
      {
        type: 'addElement',
        slideId: sId,
        element: {
          type: 'table',
          x: 100,
          y: 160,
          w: 600,
          h: 140,
          rows: [
            ['表头A', '表头B'],
            ['数据1', '数据2'],
            ['', '留白行数据'],
          ],
          headerFill: '#3b82f6',
        },
      },
      {
        type: 'addElement',
        slideId: sId,
        element: {
          type: 'chart',
          chartType: 'scatter',
          x: 100,
          y: 320,
          w: 400,
          h: 200,
          data: {
            labels: ['1', '5', '10'],
            series: [{ name: '系列Alpha', values: [10, 50, 100] }],
          },
        },
      },
      {
        type: 'addElement',
        slideId: sId,
        element: {
          type: 'image',
          src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          fit: 'contain',
          rotate: 45,
          x: 550,
          y: 320,
          w: 100,
          h: 100,
        },
      },
    ]).project;

    const res = await buildPptx(populated, { outDir: dir });
    assert.deepEqual(res.warnings, []);

    const buffer = await readFile(res.path);
    const zip = await JSZip.loadAsync(buffer);

    // 1. Verify slide1.xml contains native text and table structure
    const slide1Xml = await zip.file('ppt/slides/slide1.xml')?.async('text');
    assert.ok(slide1Xml, 'ppt/slides/slide1.xml must exist in PPTX');
    assert.match(slide1Xml, /原生文本元素/, 'Native text must be preserved in slide DrawingML');
    assert.match(slide1Xml, /表头A/, 'Table header text must exist');
    assert.match(slide1Xml, /留白行数据/, 'Table empty row data must exist');
    assert.match(slide1Xml, /3B82F6/, 'Table headerFill color must be applied');
    assert.match(slide1Xml, /FFFFFF/, 'Table data rows must use white background');
    assert.match(slide1Xml, /rot="2700000"/, 'Rotated image must have rot attribute in DrawingML (45 deg = 2,700,000 units)');

    // 2. Verify notes slide exists and contains speaker note
    const notesXml = await zip.file('ppt/notesSlides/notesSlide1.xml')?.async('text');
    assert.ok(notesXml, 'ppt/notesSlides/notesSlide1.xml must exist for notes');
    assert.match(notesXml, /这是关键的演讲者备注内容/);

    // 3. Verify scatter chart structure has X-Axis
    // 3. Verify scatter chart structure has numerical xVal and yVal
    const chartXml = await zip.file('ppt/charts/chart1.xml')?.async('text');
    assert.ok(chartXml, 'ppt/charts/chart1.xml must exist');
    assert.match(chartXml, /<c:xVal>/, 'Scatter chart must have xVal series');
    assert.match(chartXml, /<c:yVal>/, 'Scatter chart must have yVal series');
    assert.match(chartXml, /系列Alpha/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
