import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readlink,lstat,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Manager,closure,downloadPackage} from '../lib/manager.js';
const a='a'.repeat(40),b='b'.repeat(40);
const pkg=(id,deps=[])=>({id,title:id,available:true,repository:'thePlannerIvan/'+id,revision:a,channel:'main',dependencies:deps});
const catalog={packages:[pkg('planners-review-core'),pkg('core'),pkg('feature',['core']),{id:'private',available:false}]};
async function fixture(t,options={}) {const home=await mkdtemp(join(tmpdir(),'planners-form-test-'));t.after(()=>rm(home,{recursive:true,force:true}));const download=async(p,d)=>{await mkdir(d,{recursive:true});await writeFile(join(d,'SKILL.md'),`---\nname: ${p.id}\ndescription: Fixture\n---\n${p.revision}`);};return new Manager({home,catalog,download,...options});}
async function run(m,action,ids){m.start(action,ids);await m.running;return m.job;}
test('legacy PPT skill mounts are unlinked only when they target the private managed copy',async t=>{
 const m=await fixture(t);const target=join(m.skills,'feature'),global=join(m.home,'skills','feature');
 await mkdir(target,{recursive:true});await writeFile(join(target,'SKILL.md'),`---
name: feature
---
`);
 await mkdir(join(m.home,'skills'),{recursive:true});await symlink(target,global);
 const unrelated=join(m.home,'other-root','feature');await mkdir(unrelated,{recursive:true});await writeFile(join(unrelated,'SKILL.md'),'other');
 const unrelatedLink=join(m.home,'skills','other-feature');await symlink(unrelated,unrelatedLink);
 await writeFile(m.stateFile,JSON.stringify({schema:1,installed:{feature:{revision:a}}}));
 await m.cleanupLegacyGlobalMounts();
 await assert.rejects(lstat(global),{code:'ENOENT'});
 assert.equal(await readlink(unrelatedLink),unrelated);
 assert.equal(await m.ownership('feature',await m.state(),[{name:'feature',resourceBase:{kind:'directory',path:target}}]),'managed');
});
test('dependency closure is ordered, unique, rejects unknown and cycles',()=>{assert.deepEqual(closure(catalog,['feature','core']).map(p=>p.id),['core','feature']);assert.throws(()=>closure(catalog,['../evil']));assert.throws(()=>closure({packages:[pkg('a',['b']),pkg('b',['a'])]},['a']));});
test('installs skills directly in the preset-owned directory',async t=>{const m=await fixture(t);assert.equal((await run(m,'install',['feature'])).state,'done');assert.equal((await m.status()).packages.find(p=>p.id==='feature').ownership,'managed');assert.match(await readFile(join(m.skills,'feature','SKILL.md'),'utf8'),/name: feature/);await assert.rejects(lstat(join(m.home,'skills','feature')),{code:'ENOENT'});assert.deepEqual(Object.keys((await m.state()).installed),['core','feature']);});
test('external installation is preserved byte-for-byte',async t=>{const m=await fixture(t);await mkdir(join(m.mounts,'feature'),{recursive:true});await writeFile(join(m.mounts,'feature','SKILL.md'),'mine');await run(m,'install',['feature']);assert.equal(await readFile(join(m.mounts,'feature','SKILL.md'),'utf8'),'mine');assert.equal((await m.status()).packages.find(p=>p.id==='feature').ownership,'external');assert.equal((await m.state()).installed.feature,undefined);});
test('failed staged download never changes an existing install',async t=>{const m=await fixture(t);await run(m,'install',['feature']);const original=await readFile(join(m.skills,'feature','SKILL.md'),'utf8');m.download=async()=>{throw Error('offline');};await run(m,'repair');assert.equal(m.job.state,'error');assert.equal(await readFile(join(m.skills,'feature','SKILL.md'),'utf8'),original);assert.equal((await m.state()).installed.feature.revision,a);});
test('missing managed skill is repaired in the private root',async t=>{const m=await fixture(t);await run(m,'install',['feature']);await rm(join(m.mounts,'feature'),{recursive:true,force:true});await run(m,'repair');assert.equal(m.job.state,'done');assert.match(await readFile(join(m.skills,'feature','SKILL.md'),'utf8'),/name: feature/);});
test('replaced user skill in the private root is never overwritten on repair',async t=>{const m=await fixture(t);await run(m,'install',['feature']);await rm(join(m.mounts,'feature'),{recursive:true,force:true});await mkdir(join(m.mounts,'feature'));await writeFile(join(m.mounts,'feature','SKILL.md'),'external');await run(m,'repair');assert.equal(await readFile(join(m.mounts,'feature','SKILL.md'),'utf8'),'external');});
test('concurrent operations are rejected',async t=>{let release;const m=await fixture(t,{download:async()=>{await new Promise(r=>release=r);throw Error('test completed');}});m.start('install',['feature']);assert.throws(()=>m.start('repair'),/正在进行/);while(!release)await new Promise(r=>setTimeout(r,1));release();await m.running;});
test('check updates does not change files, explicit update installs new revisions',async t=>{const m=await fixture(t,{fetcher:async()=>new Response(JSON.stringify({sha:b}))});await run(m,'install',['feature']);await m.checkUpdates();assert.equal((await m.state()).installed.feature.revision,a);assert.equal((await m.status()).packages.find(p=>p.id==='feature').update,b);await run(m,'update',['feature']);assert.equal(m.job.state,'done');assert.equal((await m.state()).installed.feature.revision,b);});
test('update failure is shown, never silently treated as latest',async t=>{const m=await fixture(t,{fetcher:async()=>new Response('',{status:403})});await run(m,'install',['feature']);await m.checkUpdates();assert.match(m.checkError,/403/);await run(m,'update',['feature']);assert.equal(m.job.state,'error');assert.equal((await m.state()).installed.feature.revision,a);});
test('rejects malformed sources, unpinned revisions and unsafe paths',async()=>{await assert.rejects(downloadPackage({repository:'not a repo',revision:a},'/tmp/unused'),/无效的发布来源/);await assert.rejects(downloadPackage({repository:'someone/repo',revision:'main'},'/tmp/unused'),/无效的发布来源/);await assert.rejects(downloadPackage({repository:'someone/repo',path:'../escape',revision:a},'/tmp/unused'),/无效的技能路径/);});
test('cross-process lock refuses live owner',async t=>{const m=await fixture(t);await mkdir(m.root,{recursive:true});await writeFile(join(m.root,'install.lock'),JSON.stringify({pid:process.pid}));await run(m,'repair');assert.equal(m.job.state,'error');assert.match(m.job.message,/另一个/);});
test('interrupted activation is rolled back before next operation',async t=>{const m=await fixture(t);await run(m,'install',['feature']);const state=await m.state(),dir=join(m.root,'staging','crash');await mkdir(join(dir,'backup'),{recursive:true});const {rename}=await import('node:fs/promises');await rename(join(m.skills,'feature'),join(dir,'backup','feature'));await mkdir(join(m.skills,'feature'));await writeFile(join(m.skills,'feature','SKILL.md'),'partial');await writeFile(join(m.root,'journal.json'),JSON.stringify({dir,state,items:[{id:'feature',hadTarget:true,hadMount:true}]}));m.download=async()=>{throw Error('offline');};await run(m,'repair');assert.match(await readFile(join(m.skills,'feature','SKILL.md'),'utf8'),new RegExp(a));assert.equal((await m.state()).installed.feature.revision,a);});
test('external shared dependencies are visible beside managed skills',async t=>{const m=await fixture(t);await mkdir(join(m.mounts,'core'),{recursive:true});await writeFile(join(m.mounts,'core','SKILL.md'),'external core');await run(m,'install',['feature']);assert.equal(m.job.state,'done');assert.equal(await readFile(join(m.skills,'core','SKILL.md'),'utf8'),'external core');});
test('cached checks do not re-fetch; explicit checks do',async t=>{let calls=0;const m=await fixture(t,{fetcher:async()=>{calls++;return new Response(JSON.stringify({sha:b}));}});await m.checkUpdates(false);const before=calls;await m.checkUpdates(false);assert.equal(calls,before);await m.checkUpdates(true);assert.equal(calls,before*2);});
test('real tar download extracts matching Skill and excludes secrets',async t=>{const m=await fixture(t);const {create}=await import('tar');const src=join(m.home,'archive-root');await mkdir(join(src,'bundle'),{recursive:true});await writeFile(join(src,'bundle','SKILL.md'),'---\nname: core\ndescription: test\n---\nHello');await writeFile(join(src,'bundle','.env'),'not-shipped');const file=join(m.home,'fixture.tgz');await create({cwd:src,gzip:true,file},['bundle']);const data=await readFile(file),dest=join(m.home,'download');await downloadPackage(pkg('core'),dest,async()=>new Response(data));assert.match(await readFile(join(dest,'SKILL.md'),'utf8'),/Hello/);await assert.rejects(lstat(join(dest,'.env')),{code:'ENOENT'});});
test('real tar rejects symlinks rather than following them',async t=>{const m=await fixture(t);const {create}=await import('tar');const src=join(m.home,'archive-root');await mkdir(join(src,'bundle'),{recursive:true});await symlink('/tmp',join(src,'bundle','outside'));const file=join(m.home,'fixture.tgz');await create({cwd:src,gzip:true,file},['bundle']);const data=await readFile(file);await assert.rejects(downloadPackage(pkg('core'),join(m.home,'download'),async()=>new Response(data)),/不支持/);});
test('uses registry names and resource paths from arbitrary DSH roots without copying external skills',async t=>{
 const m=await fixture(t);const external=join(m.home,'library','category','different-folder');await mkdir(external,{recursive:true});await writeFile(join(external,'SKILL.md'),'user content');
 m.discover=async()=>[{name:'feature',resourceBase:{kind:'directory',path:external}}];
 assert.equal((await m.status()).packages.find(p=>p.id==='feature').ownership,'external');
 assert.equal((await run(m,'install',['feature'])).state,'done');
 assert.equal(await readlink(join(m.skills,'feature')),external);
 await assert.rejects(lstat(join(m.home,'skills','feature')),{code:'ENOENT'});
 assert.equal(await readFile(join(external,'SKILL.md'),'utf8'),'user content');
});
test('realpath aliases from DSH discovery remain managed and updateable',async t=>{
 const m=await fixture(t);await run(m,'install',['feature']);
 const alias=join(m.home,'alias');await symlink(m.skills,alias);
 m.discover=async()=>[{name:'feature',path:join(alias,'feature','SKILL.md')}];
 assert.equal((await m.status()).packages.find(p=>p.id==='feature').ownership,'managed');
});
test('discovery errors stop install rather than duplicating unseen external skills',async t=>{
 const m=await fixture(t,{discover:async()=>{throw Error('discovery unavailable');}});
 assert.equal((await run(m,'install',['feature'])).state,'error');
 assert.match(m.job.message,/discovery unavailable/);assert.deepEqual((await m.state()).installed,{});
});
test('directory without SKILL.md is not shown installed and is not overwritten',async t=>{
 const m=await fixture(t);await mkdir(join(m.mounts,'feature'),{recursive:true});await writeFile(join(m.mounts,'feature','keep.txt'),'keep');
 assert.equal((await m.status()).packages.find(p=>p.id==='feature').ownership,'absent');
 assert.equal((await run(m,'install',['feature'])).state,'error');
 assert.equal(await readFile(join(m.mounts,'feature','keep.txt'),'utf8'),'keep');
});
test('successful installs invalidate the DSH catalog immediately',async t=>{
 let invalidations=0;const m=await fixture(t,{invalidateSkills:()=>invalidations++});
 await run(m,'install',['feature']);assert.equal(invalidations,1);
});
