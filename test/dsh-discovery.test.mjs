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
 let invalidateControl;
 ctx.skills.registerProvider(control => {
  invalidateControl = control.invalidate;
  return new FileSystemSkillProvider(ctx, control, {
    providerName: 'dsh-ppt-studio-local',
    includeDefaultRoots: false,
    customSkillDirs: [join(temp, 'dsh', 'dsh-ppt-studio', 'skills')],
    watch: false,
  });
 });

 const pkg=id=>({id,title:id,description:id,available:true,revision:'a'.repeat(40),dependencies:[]});
 const manager=new Manager({
  home:join(temp,'dsh'),
  catalog:{packages:['existing','fresh'].map(pkg)},
  download:async(p,d)=>{await mkdir(d,{recursive:true});await writeFile(join(d,'SKILL.md'),`---\nname: ${p.id}\ndescription: Installed skill\n---\nInstalled content`);},
  invalidateSkills: () => invalidateControl?.(),
 });


 await ctx.skills.list();
 await manager.start('install',['fresh']);await manager.running;assert.equal(manager.job.state,'done',manager.job.message);
 const loaded=await ctx.skills.get('fresh');assert.equal(loaded?.content.trim(),'Installed content');
 assert.equal((await manager.status()).packages.find(p=>p.id==='fresh').ownership,'managed');

 await manager.start('uninstall',['fresh']);await manager.running;
 const afterUninstall=await ctx.skills.get('fresh');assert.equal(afterUninstall, undefined);
 assert.equal((await manager.status()).packages.find(p=>p.id==='fresh').ownership,'absent');
});
