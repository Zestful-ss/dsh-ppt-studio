import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'ppt-studio-render-'));
process.env.DSH_HOME = home;
const { summaryText } = await import('../lib/agent.js');
const { newProject, applyOperations } = await import('../lib/project.js');

test('read output gives the model slide and element ids it can act on', () => {
  const project = newProject('渲染测试');
  const slideId = project.slides[0].id;
  const withText = applyOperations(project, [{
    type: 'addElement',
    slideId,
    element: { type: 'text', x: 90, y: 120, w: 700, h: 90, text: '结论先行', fontSize: 40 },
  }]).project;
  const text = summaryText({ title: withText.title, id: withText.id, revision: withText.revision, project: withText });

  assert.match(text, /渲染测试/);
  assert.match(text, new RegExp(slideId), 'slide id must be present');
  const element = withText.slides[0].elements.at(-1);
  assert.match(text, new RegExp(element.id), 'element id must be present');
  assert.match(text, /结论先行/);
  assert.match(text, /40px/);
});

test('long projects are truncated with an explicit marker', () => {
  const project = newProject('很多元素');
  const slideId = project.slides[0].id;
  const operations = Array.from({ length: 70 }, (_, i) => ({
    type: 'addElement',
    slideId,
    element: { type: 'shape', x: i, y: i, w: 20, h: 20, fill: '#000000' },
  }));
  const big = applyOperations(project, operations).project;
  const text = summaryText({ project: big });
  assert.match(text, /已截断/);
});

test('export and delete render their own lines', () => {
  assert.match(summaryText({ path: 'C:/x/y.pptx', warnings: ['第 2 页元素 e_1：chart needs labels'] }), /已导出：C:\/x\/y\.pptx/);
  assert.match(summaryText({ path: 'a.pptx', warnings: ['warn'] }), /注意：warn/);
  assert.match(summaryText({ deleted: 'p_1', projects: [] }), /已删除：p_1/);
});

test.after(() => rm(home, { recursive: true, force: true }));
