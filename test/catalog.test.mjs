import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Manager} from '../lib/manager.js';
const catalog=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url),'utf8'));
test('proposal installs and updates hidden companion Skills through the same dependency plan',async t=>{
 const home=await mkdtemp(join(tmpdir(),'pf-companions-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const next='f'.repeat(40);
 const m=new Manager({home,catalog,fetcher:async()=>new Response(JSON.stringify({sha:next})),download:async(p,d)=>{await mkdir(d,{recursive:true});await writeFile(join(d,'SKILL.md'),`---\nname: ${p.id}\n---\n`);}});
 m.start('install',['planners-proposal-system']);await m.running;assert.equal(m.job.state,'done',m.job.message);
 for(const id of ['sparkling','storytelling','slide-copy']) {assert.ok((await m.state()).installed[id]);assert.equal(catalog.packages.find(p=>p.id===id).hidden,true);}
 m.start('update',['planners-proposal-system']);await m.running;assert.equal(m.job.state,'done',m.job.message);
 for(const id of ['sparkling','storytelling','slide-copy'])assert.equal((await m.state()).installed[id].revision,next);
});
test('the client bundle registers the PPT workbench tab and nothing else',async()=>{
 const {runInNewContext}=await import('node:vm');
 let plugin=null;
 const React={createElement:(type,props,...children)=>({type,props,children}),useState:initial=>[initial,()=>{}],useRef:current=>({current}),useEffect:()=>{},useMemo:fn=>fn(),useCallback:fn=>fn};
 runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{URL,window:{location:{href:'http://localhost/'}},__ModuleLoader__:{load:({id,factory})=>{assert.equal(id,'dsh-ppt-studio');plugin=factory(()=>React);}}});
 assert.equal(plugin.inject.includes('slots'),true);
 const registered=[];
 const ctx={inject:(_names,cb)=>cb({effect:fn=>fn(),betterSidebar:{registerTab:descriptor=>{registered.push(descriptor);return()=>{}}}})};
 plugin.apply(ctx);
 assert.equal(registered.length,1);
 assert.equal(registered[0].id,'dsh-ppt-studio:workbench');
 assert.equal(registered[0].single,true);
 assert.equal(typeof registered[0].component,'function');
});
test('the client half does not reuse the retired Planners settings page',async()=>{
 let plugin=null;
 const {runInNewContext}=await import('node:vm');
 const React={createElement:()=>null,useState:initial=>[initial,()=>{}],useRef:current=>({current}),useEffect:()=>{},useMemo:fn=>fn(),useCallback:fn=>fn};
 runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{URL,window:{location:{href:'http://localhost/'}},__ModuleLoader__:{load:({factory})=>{plugin=factory(()=>React);}}});
 assert.equal(plugin.Page,undefined);
 assert.deepEqual(Object.keys(plugin).sort(),['apply','inject']);
});
