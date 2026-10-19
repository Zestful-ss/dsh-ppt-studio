import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';

const home = await mkdtemp(join(tmpdir(), 'ppt-import-flow-'));
process.env.DSH_HOME = home;
const { createHandler } = await import('../lib/index.js');
const handler = createHandler({ authorizePreset: async id => id === 'ppt-import-session' });
test.after(() => rm(home, { recursive: true, force: true }));
const endpoint = 'http://localhost/api/dsh-ppt-studio';
const get = (action = '', id = '', sessionId = 'ppt-import-session') => handler(new Request(`${endpoint}?sessionId=${sessionId}&action=${action}&id=${id}`));
const post = (body, token, sessionId = 'ppt-import-session') => handler(new Request(endpoint, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-ppt-studio-token': token },
  body: JSON.stringify({ ...body, sessionId }),
}));

async function fixture() {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = 'Imported research deck';
  pptx.addSlide().addText('Research source title', { x: 1, y: 1, w: 8, h: 1, fontSize: 30 });
  pptx.addSlide().addText('Independent second slide', { x: 1, y: 2, w: 8, h: 1, fontSize: 20 });
  const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer' }));
  zip.file('customXml/research-data.xml', '<research xmlns="urn:research">PRESERVE-RESEARCH-DATA</research>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('uploaded and new decks share saves, selection requests, guarded exports and independent draft copies', async () => {
  const boot = await (await get()).json();
  const native = await (await post({ action: 'create', title: 'Created in workbench' }, boot.token)).json();
  const before = await (await get('listRevision')).json();
  const input = await fixture();
  const importedResponse = await post({ action: 'import', filename: 'research.pptx', data: input.toString('base64') }, boot.token);
  assert.equal(importedResponse.status, 200);
  const imported = await importedResponse.json();
  assert.equal(imported.project.revision, 1);
  assert.equal(imported.project.slides.length, 2);
  assert.equal(imported.project.slides[0].elements.find(el => el.type === 'text').text, 'Research source title');
  assert.equal(imported.project.slides[1].elements.find(el => el.type === 'text').text, 'Independent second slide');
  assert.ok(imported.projects.some(project => project.id === native.project.id));
  assert.notEqual((await (await get('listRevision')).json()).revision, before.revision);

  const body = structuredClone(imported.project);
  const element = body.slides[0].elements.find(el => el.type === 'text');
  element.text = 'Edited in the same workbench';
  const saved = await (await post({ action: 'save', project: body, baseRevision: 1, operationId: 'imported-edit' }, boot.token)).json();
  assert.equal(saved.revision, 2);
  const requested = await (await post({ action: 'request', id: body.id, baseRevision: 2, operationId: 'imported-request', slideId: body.slides[0].id, elementIds: [element.id], instruction: 'Enlarge the imported title' }, boot.token)).json();
  assert.equal(requested.request.elementIds[0], element.id);
  assert.equal(requested.project.revision, 3);

  const sourceCopy = await (await post({ action: 'create', title: 'Imported draft copy', template: requested.project, sourceProjectId: body.id }, boot.token)).json();
  assert.notEqual(sourceCopy.project.id, body.id);
  assert.equal(sourceCopy.project.revision, 1);
  assert.deepEqual(sourceCopy.project.pending, []);
  assert.equal((await post({ action: 'delete', id: body.id }, boot.token)).status, 200);
  const exportedResponse = await post({ action: 'export', id: sourceCopy.project.id, baseRevision: 1 }, boot.token);
  assert.equal(exportedResponse.status, 200);
  const exported = await exportedResponse.json();
  const { readFile } = await import('node:fs/promises');
  const result = await JSZip.loadAsync(await readFile(exported.path));
  const text = await result.file('ppt/slides/slide1.xml').async('text');
  assert.match(text, /Edited in the same workbench/);
  assert.doesNotMatch(text, /Research source title/);
  assert.match(await result.file('customXml/research-data.xml').async('text'), /PRESERVE-RESEARCH-DATA/);
  assert.equal((await post({ action: 'export', id: sourceCopy.project.id }, boot.token)).status, 400);
  assert.equal((await get('project', sourceCopy.project.id, 'standard-session')).status, 403);

  const count = (await (await get()).json()).projects.length;
  const invalid = await post({ action: 'import', filename: 'broken.pptx', data: Buffer.from('not a zip').toString('base64') }, boot.token);
  assert.equal(invalid.status, 400);
  assert.equal((await (await get()).json()).projects.length, count);
});

test('shared inherited backgrounds survive edits and new slides, and export with native content', async () => {
  const { ProjectStore, newProject, applyOperations } = await import('../lib/project.js');
  const store = new ProjectStore(join(home, 'dsh-ppt-studio'));
  const template = newProject('Shared layout preview');
  template.viewport.height = 750;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="750" viewBox="0 0 1000 750"><rect x="0" y="0" width="1000" height="100" fill="#013E80"/></svg>';
  const original = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  template.backdrops = { b_layout: original };
  template.slides[0].backdropId = 'b_layout';
  const created = await store.create(template.title, { template });
  const incoming = structuredClone(created);
  incoming.title = 'Background stays while editing';
  incoming.backdrops.b_layout = 'data:image/svg+xml;base64,' + Buffer.from(svg.replace('#013E80', '#FFFFFF')).toString('base64');
  const saved = await store.save(incoming, 1, 'background-body-edit');
  assert.equal(saved.project.backdrops.b_layout, original);
  const added = await store.commit(created.id, {
    baseRevision: 2, operationId: 'background-add-slide', kind: 'update', payload: { operations: [{ type: 'addSlide', afterId: created.slides[0].id }] },
  }, project => applyOperations(project, [{ type: 'addSlide', afterId: created.slides[0].id }]));
  assert.equal(added.project.slides[1].backdropId, 'b_layout');
  const output = await store.export(created.id, 3);
  const { readFile } = await import('node:fs/promises');
  const archive = await JSZip.loadAsync(await readFile(output.path));
  const svgParts = Object.entries(archive.files).filter(([name, entry]) => !entry.dir && name.endsWith('.svg'));
  assert.ok(svgParts.length);
  assert.ok((await Promise.all(svgParts.map(([, entry]) => entry.async('text')))).some(text => text.includes('#013E80')));
  assert.match(await archive.file('ppt/slides/slide1.xml').async('text'), /演示标题/);
});
