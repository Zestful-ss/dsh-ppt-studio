import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Manager} from '../lib/manager.js';
const catalog=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url),'utf8'));

test('a catalog skill installs from its pinned source and updates to the checked revision',async t=>{
 const home=await mkdtemp(join(tmpdir(),'ppt-catalog-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const next='f'.repeat(40);
 const m=new Manager({home,catalog,fetcher:async()=>new Response(JSON.stringify({sha:next})),download:async(p,d)=>{await mkdir(d,{recursive:true});await writeFile(join(d,'SKILL.md'),`---\nname: ${p.id}\n---\n`);}});
 const target='image-to-editable-ppt';
 await m.start('install',[target]);await m.running;assert.equal(m.job.state,'done',m.job.message);
 assert.ok((await m.state()).installed[target]);
 const entry=catalog.packages.find(p=>p.id===target);
 assert.equal(entry.repository,'ningzimu/image-to-editable-ppt-skill');
 assert.equal(entry.path,'skills/image-to-editable-ppt');
 await m.start('update',[target]);await m.running;assert.equal(m.job.state,'done',m.job.message);
 assert.equal((await m.state()).installed[target].revision,next);
});

test('the client bundle registers the Settings panel and PPT workbench tab',async()=>{
 const {runInNewContext}=await import('node:vm');
 let plugin=null;
 const React={createElement:(type,props,...children)=>({type,props,children}),useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:current=>({current}),useEffect:()=>{},useMemo:fn=>fn(),useCallback:fn=>fn};
 runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{URL,window:{location:{href:'http://localhost/'},localStorage:{getItem:()=>null,setItem:()=>{}}},__ModuleLoader__:{load:({id,factory})=>{assert.equal(id,'dsh-ppt-studio');plugin=factory(()=>React);}}});
 const registered=[],sections=[];let disposed=0;
 const ctx={
  slots:{inject:(name,cb)=>{assert.equal(name,'settings.section');cb();return()=>{};},register:(options,component)=>{sections.push({options,component});return()=>{};}},
  effect:fn=>fn(),
  get:()=>undefined,
  inject:(_names,cb)=>cb({effect:fn=>fn(),betterSidebar:{registerTab:descriptor=>{registered.push(descriptor);return()=>{disposed++;}}}}),
 };
 plugin.apply(ctx);
 assert.equal(registered.length,1);
 assert.equal(registered[0].id,'dsh-ppt-studio:workbench');
 assert.equal(typeof registered[0].component,'function');
 assert.equal(typeof registered[0].available,'function');
 assert.equal(sections.length,1);
 assert.equal(sections[0].options.id,'dsh-ppt-studio');
 assert.equal(sections[0].options.label(),'PPT Studio');
 const tree=sections[0].component({});
 const nodes=[];const texts=[];const visit=node=>{if(node==null)return;if(Array.isArray(node)){node.forEach(visit);return;}if(typeof node!=='object'){texts.push(String(node));return;}nodes.push(node);visit(node.children);};visit(tree);
 assert.ok(texts.includes('PPT Studio'),'settings page title');
 assert.ok(texts.includes('技能库'),'skills section');
 assert.ok(!texts.includes('新建 PPT 专用会话'),'session shortcut removed');
 const toggle=nodes.find(node=>node.type==='input'&&node.props.type==='checkbox');
 toggle.props.onChange({target:{checked:false}});
 assert.equal(disposed,1);
});

test('the sidebar workbench is hidden outside PPT preset sessions',async()=>{
 const {runInNewContext}=await import('node:vm');
 let plugin=null;
 const React={createElement:(type,props,...children)=>({type,props,children}),useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:current=>({current}),useEffect:()=>{},useMemo:fn=>fn(),useCallback:fn=>fn};
 const replies={
  'standard-session':{status:403,ok:false,json:async()=>({code:'PRESET_REQUIRED'})},
  'ppt-session':{status:200,ok:true,json:async()=>({mode:'ppt-studio'})},
 };
 runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{URL,AbortController,setTimeout,clearTimeout,fetch:async value=>replies[new URL(value).searchParams.get('sessionId')],window:{location:{href:'http://localhost/'},localStorage:{getItem:()=>null,setItem:()=>{}}},__ModuleLoader__:{load:({factory})=>{plugin=factory(()=>React);}}});
 const descriptors=[];
 const ctx={slots:{inject:(_name,cb)=>{cb();return()=>{};},register:()=>()=>{}},effect:fn=>fn(),get:()=>undefined,inject:(_names,cb)=>cb({effect:fn=>fn(),betterSidebar:{registerTab:d=>{descriptors.push(d);return()=>{};}}})};
 plugin.apply(ctx);
 assert.equal(descriptors[0].available({}, {sessionId:'standard-session'}),false);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(descriptors.at(-1).available({}, {sessionId:'standard-session'}),false);
 assert.equal(descriptors.at(-1).available({}, {sessionId:'ppt-session'}),false);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(descriptors.at(-1).available({}, {sessionId:'ppt-session'}),true);
});

test('the client half no longer exports the old Planners settings page',async()=>{
 let plugin=null;
 const {runInNewContext}=await import('node:vm');
 const React={createElement:()=>null,useState:initial=>[initial,()=>{}],useRef:current=>({current}),useEffect:()=>{},useMemo:fn=>fn(),useCallback:fn=>fn};
 runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{URL,AbortController,setTimeout,clearTimeout,window:{location:{href:'http://localhost/'}},__ModuleLoader__:{load:({factory})=>{plugin=factory(()=>React);}}});
 assert.equal(plugin.Page,undefined);
 assert.deepEqual(Object.keys(plugin).sort(),['apply','inject']);
});
