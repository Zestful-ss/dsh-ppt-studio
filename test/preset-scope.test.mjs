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
