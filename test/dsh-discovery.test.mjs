import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile,symlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Manager} from '../lib/manager.js';
const runtime=process.env.DSH_TEST_RUNTIME;
test('DSH rc.2 discovers custom roots and loads newly installed skills through its real registry', {skip:!runtime},async t=>{
 const temp=await mkdtemp(join(tmpdir(),'pf-dsh-discovery-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const modules=join(runtime,'node_modules');
 const load=name=>import(pathToFileURL(join(modules,'@deepseek-ai',name,'lib/index.js')));
 const {Context}=await load('cordis');const {SkillRegistry}=await load('dsh-skill');const filesystem=await load('dsh-skill-filesystem');const {FileSystemSkillProvider}=filesystem;
 const ctx=new Context();await ctx.plugin(SkillRegistry).await();t.after(()=>ctx.fiber.dispose());
 const custom=join(temp,'custom','different-directory');await mkdir(custom,{recursive:true});
 await writeFile(join(custom,'SKILL.md'),'---\nname: existing\ndescription: Existing custom skill\n---\nUser owned content');
 ctx.skills.registerProvider(control=>new FileSystemSkillProvider(ctx,control,{providerName:'custom-fixture',includeDefaultRoots:false,customSkillDirs:[join(temp,'custom')],watch:false}));
 // Resolve the integration module against the real DSH runtime, without changing this checkout.
 await copyFile(new URL('../lib/skill-discovery.js',import.meta.url),join(temp,'discovery.mjs'));await symlink(modules,join(temp,'node_modules'));
 const {connectSkillDiscovery}=await import(pathToFileURL(join(temp,'discovery.mjs')));
 const pkg=id=>({id,title:id,description:id,available:true,revision:'a'.repeat(40),dependencies:[]});
 const manager=new Manager({home:join(temp,'dsh'),catalog:{packages:['existing','agent-existing','fresh','planners-review-core'].map(pkg)},download:async(p,d)=>{await mkdir(d,{recursive:true});await writeFile(join(d,'SKILL.md'),`---\nname: ${p.id}\ndescription: Installed skill\n---\nInstalled content`);}});
 const oldAgents=process.env.DSH_AGENTS_HOME;process.env.DSH_AGENTS_HOME=join(temp,'agents');
 t.after(()=>{if(oldAgents===undefined)delete process.env.DSH_AGENTS_HOME;else process.env.DSH_AGENTS_HOME=oldAgents;});
 const agentSkill=join(temp,'agents','skills','agent-existing');await mkdir(agentSkill,{recursive:true});
 await writeFile(join(agentSkill,'SKILL.md'),'---\nname: agent-existing\ndescription: Shared agent skill\n---\nShared content');
 await ctx.plugin(filesystem,{providerName:'planners-form-local',dshHome:manager.home}).await();
 connectSkillDiscovery(ctx,manager);
 assert.equal((await manager.status()).packages.find(p=>p.id==='agent-existing').ownership,'external');
 assert.equal((await manager.status()).packages.find(p=>p.id==='existing').ownership,'external');
 assert.equal(await manager.location('existing',await manager.detectedSkills()),custom);
 await ctx.skills.list(); // Seed the cache before installation.
 manager.start('install',['fresh']);await manager.running;assert.equal(manager.job.state,'done',manager.job.message);
 const loaded=await ctx.skills.get('fresh');assert.equal(loaded.content.trim(),'Installed content');
 assert.equal((await manager.status()).packages.find(p=>p.id==='fresh').ownership,'managed');
 assert.equal((await ctx.skills.get('existing')).content.trim(),'User owned content');
});
