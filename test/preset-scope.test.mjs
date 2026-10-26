import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { Context } from '@deepseek-ai/cordis';
import { createScope, scopeTarget } from '@deepseek-ai/dsh-scope';
import { SystemPrompt, renderPrompt } from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { SkillRegistry } from '@deepseek-ai/dsh-skill';
import * as persona from '@deepseek-ai/dsh-persona';
import * as filesystem from '@deepseek-ai/dsh-skill-filesystem';
import * as skillLoader from '@deepseek-ai/dsh-tool-skill';
import * as pptAgent from '../lib/agent.js';

async function mountPreset(t) {
  const home = await mkdtemp(join(tmpdir(), 'ppt-native-preset-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const ctx = new Context();
  const mounted = [];
  t.after(async () => {
    for (const scope of mounted.reverse()) await scope.dispose();
    await ctx.fiber.dispose();
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  });
  await ctx.plugin(SystemPrompt, { personaPrefix: 'Standard deployment identity' }).await();
  await ctx.plugin(ToolRuntime).await();
  await ctx.plugin(SkillRegistry).await();
  // Session lifecycle and cwd are host fixtures; prompt, tool and skill registries are real.
  ctx.reflect.provide('agents', {});
  ctx.reflect.provide('workingDirectory', { ensure: async () => home });
  const patch = parse(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), {
    customTags: [{
      tag: 'tag:yaml.org,2002:js',
      resolve(source) {
        const path = /^dshHomePath\('([^']+)'\)$/.exec(source);
        if (!path) throw new Error(`Unexpected host path expression: ${source}`);
        return join(home, path[1]);
      },
    }],
  });
  const preset = patch.flatMap(row => row.insert ?? []).find(row => row.config?.id === 'ppt-studio');
  assert.ok(preset, 'The configured PPT preset must exist');
  const key = {};
  const mount = createScope(ctx, key);
  mounted.push(mount);
  const modules = new Map([
    ['@deepseek-ai/dsh-persona', persona],
    ['@deepseek-ai/dsh-skill-filesystem', filesystem],
    ['@deepseek-ai/dsh-tool-skill', skillLoader],
    ['dsh-ppt-studio/agent', pptAgent],
  ]);
  for (const entry of preset.config.plugins) {
    const plugin = modules.get(entry.name);
    assert.ok(plugin, `Unsupported preset fixture plugin: ${entry.name}`);
    const config = entry.name === '@deepseek-ai/dsh-skill-filesystem'
      ? { ...entry.config, watch: false }
      : entry.config;
    await mount.ctx.plugin(plugin, config).await();
  }
  return { ctx, home, key, mount, mounted, preset };
}

test('PPT session prompt identifies its preset while Standard and other scopes retain their identity', async t => {
  const { ctx, key, mount } = await mountPreset(t);
  const ppt = await ctx.systemPrompt.assemble({ scope: key });
  const standard = await ctx.systemPrompt.assemble({ scope: {} });
  const other = await ctx.systemPrompt.assemble({ scope: {} });

  assert.match(renderPrompt(ppt), /ppt-studio/);
  assert.doesNotMatch(renderPrompt(ppt), /Standard deployment identity/);
  assert.match(renderPrompt(standard), /Standard deployment identity/);
  assert.doesNotMatch(renderPrompt(standard), /ppt-studio/);
  assert.equal(renderPrompt(other), renderPrompt(standard));
  assert.deepEqual(standard.tools, []);
  assert.deepEqual(ppt.tools.map(tool => tool.name).filter(name => name.startsWith('ppt_')).sort(), ['ppt_project', 'ppt_skills']);

  await mount.dispose();
  const after = await ctx.systemPrompt.assemble({ scope: key });
  assert.equal(renderPrompt(after), renderPrompt(standard));
});

test('installed PPT skills reach the model catalog and loader only in the PPT scope', async t => {
  const { ctx, home, key, mounted } = await mountPreset(t);
  const skillPath = join(home, 'dsh-ppt-studio', 'skills', 'ppt-master');
  await mkdir(skillPath, { recursive: true });
  await writeFile(join(skillPath, 'SKILL.md'), '---\nname: ppt-master\ndescription: Create native editable presentation slides.\n---\nPPT-PRIVATE-INSTRUCTIONS: use the editable-deck workflow.\n');
  ctx.skills.register({
    name: 'global-notes', description: 'A shared non-PPT skill.',
    source: 'fixture', content: 'Shared notes instructions.',
  });
  const agent = { session: { seq: 0, surface: { nodes: [] } } };
  const sessionScope = createScope(ctx, agent, { parent: key });
  mounted.push(sessionScope);
  agent.ctx = sessionScope.ctx;
  const standard = {};
  const signal = new AbortController().signal;
  const tool = ctx.tools.get('skill', agent);
  assert.ok(tool, 'A PPT session must have the native skill loader');

  const decision = await ctx.waterfall(scopeTarget(ctx, agent), 'agent/pre-step', {
    agent, signal, messages: [],
  }, () => Promise.resolve({ kind: 'accept', messages: [] }));
  const catalog = decision.messages.find(message => message.source.kind === 'skill-catalog');
  assert.ok(catalog, 'The model must receive a catalog of available skills');
  assert.ok(catalog.source.entries.some(entry => entry.name === 'ppt-master'));
  assert.doesNotMatch(JSON.stringify(catalog), /PPT-PRIVATE-INSTRUCTIONS/);

  const loaded = await tool.execute({ name: 'ppt-master' }, { agent, signal });
  assert.match(loaded.content, /PPT-PRIVATE-INSTRUCTIONS/);
  assert.equal(loaded.resourceBase.path, skillPath);
  assert.equal(await ctx.skills.get('ppt-master', { scope: standard, cwd: home }), undefined);
  assert.equal(ctx.tools.get('skill', standard), undefined);
  assert.equal((await ctx.skills.get('global-notes', { scope: standard })).content, 'Shared notes instructions.');
});

test('a model can create, update, read a selection and export using the advertised PPT schema', async t => {
  const { ctx, key } = await mountPreset(t);
  const signal = new AbortController().signal;
  const assembly = await ctx.systemPrompt.assemble({ scope: key });
  const schema = assembly.tools.find(tool => tool.name === 'ppt_project').parameters;
  let call = 0;
  const invoke = async args => {
    assert.deepEqual(validateJsonSchemaValue(schema, args), [], 'The model-visible schema must accept the supported action');
    return ctx.tools.execute({
      name: 'ppt_project', arguments: args, agent: key,
      callId: `ppt-native-${++call}`, signal,
    });
  };
  const created = await invoke({ action: 'create', title: 'Native preset deck' });
  assert.equal(created.isError, false, JSON.stringify(created));
  const project = created.value.project;
  const slide = project.slides[0];
  const element = slide.elements[0];
  const update = {
    action: 'update', id: project.id, baseRevision: project.revision,
    operationId: 'native-slide-edit',
    operations: [{ type: 'updateElement', slideId: slide.id, elementId: element.id, props: { text: 'Model-visible editable content' } }],
  };
  const edited = await invoke(update);
  assert.equal(edited.isError, false, JSON.stringify(edited));
  assert.equal(edited.value.revision, 2);
  const replayed = await invoke(update);
  assert.equal(replayed.isError, false, JSON.stringify(replayed));
  assert.equal(replayed.value.replayed, true);
  assert.equal(replayed.value.revision, 2);

  const selection = await invoke({ action: 'read', id: project.id, slideId: slide.id, elementIds: [element.id] });
  assert.equal(selection.isError, false, JSON.stringify(selection));
  assert.equal(selection.value.slide.elements[0].text, 'Model-visible editable content');
  assert.match(selection.content.map(block => block.text ?? '').join('\n'), /Model-visible editable content/);
  const stale = await invoke({ ...update, operationId: 'outdated-native-edit' });
  assert.equal(stale.isError, true);
  const exported = await invoke({ action: 'export', id: project.id, baseRevision: 2 });
  assert.equal(exported.isError, false, JSON.stringify(exported));
  const { default: JSZip } = await import('jszip');
  const archive = await JSZip.loadAsync(await readFile(exported.value.path));
  assert.match(await archive.file('ppt/slides/slide1.xml').async('text'), /Model-visible editable content/);
});

test('a model imports a local PPTX into the same editable project library', async t => {
  const { ctx, home, key } = await mountPreset(t);
  const { default: PptxGenJS } = await import('pptxgenjs');
  const input = new PptxGenJS();
  input.layout = 'LAYOUT_WIDE';
  input.addSlide().addText('Imported through the native model tool', { x: 1, y: 1, w: 8, h: 1, fontSize: 28 });
  const path = join(home, 'model-source.pptx');
  const source = await input.write({ outputType: 'nodebuffer' });
  await writeFile(path, source);
  const assembly = await ctx.systemPrompt.assemble({ scope: key });
  const args = { action: 'import', path };
  assert.deepEqual(validateJsonSchemaValue(assembly.tools.find(tool => tool.name === 'ppt_project').parameters, args), []);
  const result = await ctx.tools.execute({ name: 'ppt_project', arguments: args, agent: key, signal: new AbortController().signal, callId: 'native-model-import' });
  assert.equal(result.isError, false, JSON.stringify(result));
  const { ProjectStore } = await import('../lib/project.js');
  const store = new ProjectStore(join(home, 'dsh-ppt-studio'));
  const project = await store.read(result.value.id);
  assert.equal(project.slides[0].elements.find(element => element.type === 'text').text, 'Imported through the native model tool');
  assert.deepEqual(await readFile(path), source);
});

test('the model lists only the session workspace by default and can widen it explicitly', async t => {
  const { ctx, home, key } = await mountPreset(t);
  const { ProjectStore } = await import('../lib/project.js');
  const store = new ProjectStore(join(home, 'dsh-ppt-studio'));
  const workspaceA = join(home, 'workspace-a');
  const workspaceB = join(home, 'workspace-b');
  await mkdir(workspaceA, { recursive: true });
  await mkdir(workspaceB, { recursive: true });
  const inA = await store.create('A 文稿', { workspace: workspaceA });
  const inB = await store.create('B 文稿', { workspace: workspaceB });
  const unowned = await store.create('未归属文稿');
  const agent = key;
  agent.session = { header: { cwd: workspaceA } };
  const invoke = async args => {
    const result = await ctx.tools.execute({ name: 'ppt_project', arguments: args, agent, signal: new AbortController().signal, callId: `scope-${Math.random().toString(36).slice(2, 8)}` });
    assert.equal(result.isError, false, JSON.stringify(result));
    return result;
  };
  const scoped = await invoke({ action: 'list' });
  assert.deepEqual(scoped.value.projects.map(project => project.id), [inA.id], 'default list is the session workspace only');
  assert.equal(scoped.value.workspace, workspaceA);
  assert.equal(scoped.value.scope, 'workspace');
  const text = scoped.content.map(block => block.text ?? '').join('\n');
  assert.match(text, /\[当前工作区\]/);
  assert.match(text, new RegExp(inA.id));
  assert.match(text, new RegExp(`r${inA.revision}`));

  const all = await invoke({ action: 'list', scope: 'all' });
  assert.deepEqual(all.value.projects.map(project => project.id).sort(), [inA.id, inB.id, unowned.id].sort());
  const allText = all.content.map(block => block.text ?? '').join('\n');
  assert.match(allText, /\[其他工作区：/);
  assert.match(allText, /\[未归属\]/);

  // Without a session cwd the default scope must not silently widen.
  const savedSession = key.session;
  delete key.session;
  const anonymous = await ctx.tools.execute({ name: 'ppt_project', arguments: { action: 'list' }, agent: key, signal: new AbortController().signal, callId: 'scope-anonymous' });
  const anonymousAll = await ctx.tools.execute({ name: 'ppt_project', arguments: { action: 'list', scope: 'all' }, agent: key, signal: new AbortController().signal, callId: 'scope-anonymous-all' });
  key.session = savedSession;
  assert.equal(anonymous.isError, false, JSON.stringify(anonymous));
  assert.deepEqual(anonymous.value.projects, []);
  assert.match(anonymous.content.map(block => block.text ?? '').join('\n'), /未识别当前会话工作区/);
  assert.equal(anonymousAll.value.projects.length, 3);

  const crossWorkspace = await invoke({ action: 'read', id: inB.id });
  assert.equal(crossWorkspace.value.id, inB.id);

  const { sameWorkspace } = await import('../lib/project.js');
  assert.equal(sameWorkspace('C:\\Work\\Deck', 'c:/work/deck/'), true);
  assert.equal(sameWorkspace('C:/', 'C:'), false, 'a drive root is not a drive-relative path');
  assert.equal(sameWorkspace('C:/', 'c:'), false, 'case folding must not turn a root into drive-relative');
  assert.equal(sameWorkspace('C:/', 'c:/'), true);
  assert.equal(sameWorkspace('C:\\', 'c:/'), true, 'a backslash drive root is the same root');
  assert.equal(sameWorkspace('\\\\server\\Share\\A', '//SERVER/share/a/'), true);
  assert.equal(sameWorkspace('/home/Deck', '/home/deck'), false);
  assert.equal(sameWorkspace('/home/Deck/', '/home/Deck'), true);
  assert.equal(sameWorkspace('', '/home/deck'), false);
});

test('setTitle renames through the tool and rejects empty or stale edits', async t => {
  const { ctx, key } = await mountPreset(t);
  const signal = new AbortController().signal;
  const assembly = await ctx.systemPrompt.assemble({ scope: key });
  const schema = assembly.tools.find(tool => tool.name === 'ppt_project').parameters;
  const invoke = async args => {
    assert.deepEqual(validateJsonSchemaValue(schema, args), [], 'the schema accepts the action');
    return ctx.tools.execute({ name: 'ppt_project', arguments: args, agent: key, callId: `retitle-${Math.random().toString(36).slice(2, 8)}`, signal });
  };
  const created = await invoke({ action: 'create', title: '原标题' });
  assert.equal(created.isError, false, JSON.stringify(created));
  const project = created.value.project;
  const coverText = project.slides[0].elements[0].text;
  const update = {
    action: 'update',
    id: project.id,
    baseRevision: project.revision,
    operationId: 'retitle-once',
    operations: [{ type: 'setTitle', title: '下一版汇报' }],
  };
  const retitled = await invoke(update);
  assert.equal(retitled.isError, false, JSON.stringify(retitled));
  assert.equal(retitled.value.title, '下一版汇报');
  assert.equal(retitled.value.project.slides[0].elements[0].text, coverText, 'the cover body is unchanged');
  const replayed = await invoke(update);
  assert.equal(replayed.value.replayed, true);
  assert.equal(replayed.value.revision, retitled.value.revision, 'the same operationId applies once');
  const listed = await invoke({ action: 'list', scope: 'all' });
  assert.equal(listed.value.projects.find(item => item.id === project.id).title, '下一版汇报');
  const exported = await invoke({ action: 'export', id: project.id, baseRevision: retitled.value.revision });
  assert.equal(exported.isError, false, JSON.stringify(exported));
  assert.match(exported.value.filename, /下一版汇报-r\d+\.pptx$/);
  const blank = await invoke({ ...update, operationId: 'retitle-blank', baseRevision: retitled.value.revision, operations: [{ type: 'setTitle', title: '   ' }] });
  assert.equal(blank.isError, true);
  const tooLong = await invoke({ ...update, operationId: 'retitle-long', baseRevision: retitled.value.revision, operations: [{ type: 'setTitle', title: 'x'.repeat(201) }] });
  assert.equal(tooLong.isError, true);
  const stale = await invoke({ ...update, operationId: 'retitle-stale' });
  assert.equal(stale.isError, true, 'an old baseRevision cannot retitle');
});

test('an agent export can also copy into the session workspace', async t => {
  const { ctx, home, key } = await mountPreset(t);
  const workspace = join(home, 'agent-workspace');
  await mkdir(workspace, { recursive: true });
  key.session = { header: { cwd: workspace } };
  const signal = new AbortController().signal;
  const assembly = await ctx.systemPrompt.assemble({ scope: key });
  const schema = assembly.tools.find(tool => tool.name === 'ppt_project').parameters;
  const invoke = async args => {
    assert.deepEqual(validateJsonSchemaValue(schema, args), [], 'the schema accepts the action');
    return ctx.tools.execute({ name: 'ppt_project', arguments: args, agent: key, callId: `export-${Math.random().toString(36).slice(2, 8)}`, signal });
  };
  const { ProjectStore } = await import('../lib/project.js');
  const store = new ProjectStore(join(home, 'dsh-ppt-studio'));
  // The project belongs to another workspace; the copy still goes to the
  // session workspace resolved from the agent header.
  const foreign = await store.create('其他工作区项目', { workspace: '/somewhere/else' });
  const privateExport = await invoke({ action: 'export', id: foreign.id, baseRevision: foreign.revision });
  assert.equal(privateExport.isError, false, JSON.stringify(privateExport));
  assert.equal(privateExport.value.workspacePath, undefined, 'private is the default');
  const publicExport = await invoke({ action: 'export', id: foreign.id, baseRevision: foreign.revision, destination: 'workspace' });
  assert.equal(publicExport.isError, false, JSON.stringify(publicExport));
  assert.equal(publicExport.value.workspacePath.startsWith(workspace), true, JSON.stringify(publicExport.value));
  assert.deepEqual(await readFile(publicExport.value.workspacePath), await readFile(publicExport.value.path));
  const second = await invoke({ action: 'export', id: foreign.id, baseRevision: foreign.revision, destination: 'workspace' });
  assert.notEqual(second.value.workspacePath, publicExport.value.workspacePath, 'a repeated copy never overwrites');
  assert.deepEqual(await readFile(second.value.workspacePath), await readFile(second.value.path));
  const text = publicExport.content.map(block => block.text ?? '').join('\n');
  assert.match(text, /已导出：/);
  assert.match(text, /工作区副本：/);
  delete key.session;
  const noWorkspace = await invoke({ action: 'export', id: foreign.id, baseRevision: foreign.revision, destination: 'workspace' });
  assert.equal(noWorkspace.isError, true, 'without a session workspace the copy is refused');
});
