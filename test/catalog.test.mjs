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
test('settings renders invocation names but hides companion rows in both lists',async()=>{
 const {runInNewContext}=await import('node:vm');let plugin,hook=0;
 const data={packages:catalog.packages.map(p=>({...p,ownership:'absent'})),environment:{node:'24.21.0',pythonReady:false}};
 const React={createElement:(type,props,...children)=>({type,props,children}),useState:initial=>[hook++===0?data:initial,()=>{}],useRef:current=>({current}),useEffect:()=>{}};
 runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{URL,window:{location:{href:'http://localhost/'}},__ModuleLoader__:{load:({factory})=>{plugin=factory(()=>React);}}});
 const tree=JSON.stringify(plugin.Page());
 for(const id of ['sparkling','storytelling','slide-copy'])assert.ok(!tree.includes(id));
 for(const id of ['planners-proposal-system','planners-bypage','video-idea-system','video-craft'])assert.ok(tree.includes(id));
});
test('installed rows show an accessible checkmark instead of a disabled checkbox',async()=>{
 const {runInNewContext}=await import('node:vm');let plugin,hook=0;
 const data={packages:[{id:'existing',title:'已有能力',ownership:'external'},{id:'managed',title:'托管能力',ownership:'managed'},{id:'new',title:'新能力',ownership:'absent',available:true}],environment:{node:'24',pythonReady:false}};
 const React={createElement:(type,props,...children)=>({type,props,children}),useState:initial=>[hook++===0?data:initial,()=>{}],useRef:current=>({current}),useEffect:()=>{}};
 runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{URL,window:{location:{href:'http://localhost/'}},__ModuleLoader__:{load:({factory})=>{plugin=factory(()=>React);}}});
 const nodes=[];function visit(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(visit);return;}nodes.push(x);x.children?.forEach(visit);}visit(plugin.Page());
 assert.equal(nodes.filter(n=>n.props?.role==='img'&&n.children.includes('✅')).length,2);
 assert.equal(nodes.filter(n=>n.type==='input'&&n.props.type==='checkbox').length,1);
});
