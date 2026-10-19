import { mkdir, readFile, writeFile, rename, rm, lstat, readlink, symlink, open, realpath, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as tar from 'tar';
const exec = promisify(execFile);
const sha = /^[a-f0-9]{40}$/;
const exists = async p => { try { await lstat(p); return true; } catch (e) { if(e.code==='ENOENT') return false; throw e; } };
const json = async (p, fallback) => { try { return JSON.parse(await readFile(p,'utf8')); } catch(e) { if(e.code==='ENOENT') return fallback; throw e; } };
const atomic = async (p,v) => { const tmp=p+'.'+randomUUID(); await writeFile(tmp,JSON.stringify(v,null,2)+'\n',{mode:0o600}); await rename(tmp,p); };

export function closure(catalog, ids) {
 const byId=new Map(catalog.packages.map(p=>[p.id,p])), seen=new Set(), active=new Set(), result=[];
 function visit(id) { const p=byId.get(id); if(!p || !p.available) throw new Error(`暂不可安装：${id}`); if(active.has(id)) throw new Error('依赖清单存在循环'); if(seen.has(id))return; active.add(id); for(const dep of p.dependencies)visit(dep); active.delete(id); seen.add(id); result.push(p); }
 for(const id of ids)visit(id); return result;
}

// Any public GitHub repository may host a skill: `repository` is `owner/name` and the
// optional `path` names the skill directory inside it. The frontmatter name must equal
// the catalog id, so discovery and ownership checks agree on one identity.
export async function downloadPackage(pkg, dest, fetcher=fetch) {
 if(!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(pkg.repository)||!sha.test(pkg.revision))throw new Error('无效的发布来源或版本');
 const sub=typeof pkg.path==='string'?pkg.path.trim():'';
 if(sub&&(!/^[A-Za-z0-9._/-]+$/.test(sub)||sub.split('/').some(s=>s===''||s==='.')||sub.split('/').includes('..')||sub.startsWith('/')))throw new Error('无效的技能路径');
 const response=await fetcher(`https://codeload.github.com/${pkg.repository}/tar.gz/${pkg.revision}`,{signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error(`下载 ${pkg.title} 失败（${response.status}）`);
 const archive=dest+'.tgz'; let size=0; const handle=await open(archive,'wx',0o600);
 try { for await(const chunk of response.body) { size+=chunk.length; if(size>100*1024*1024)throw new Error('安装包超过 100 MB'); await handle.write(chunk); } } catch(e) { await handle.close();await rm(archive,{force:true});throw e; } finally { await handle.close().catch(()=>{}); }
 await mkdir(dest,{recursive:true});
 const staging=join(dest,'.extract');
 try {
  let unpacked=0, invalid=null;
  await tar.t({file:archive, onReadEntry:e=>{
   unpacked+=e.size;
   if(unpacked>400*1024*1024 || !['File','Directory','ExtendedHeader','GlobalExtendedHeader'].includes(e.type) || e.path.split('/').includes('..') || e.path.startsWith('/')) invalid='安装包包含不支持的文件或路径';
  }});
  if(invalid)throw new Error(invalid);
  await mkdir(staging,{recursive:true});
  await tar.x({file:archive,cwd:staging,strip:1,strict:true,preservePaths:false,noChmod:true,filter:p=>!p.split('/').some(s=>s==='.git'||s==='.env'||s==='.venv'||s==='node_modules'||/\.(pem|key)$/.test(s))});
 } finally { await rm(archive,{force:true}); }
 const root=sub?join(staging,...sub.split('/')):staging;
 let skill;
 try { skill=await readFile(join(root,'SKILL.md'),'utf8'); }
 catch { await rm(staging,{recursive:true,force:true}); throw new Error(`该路径下没有技能入口：${sub||'仓库根目录'}`); }
 const expected=new RegExp(`^name:\\s*["']?${pkg.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["']?\\s*$`,'m');
 if(!skill.startsWith('---') || !expected.test(skill)){
  await rm(staging,{recursive:true,force:true});
  const found=(skill.match(/^name:\s*(.+)$/m)||[])[1]||'（未声明）';
  throw new Error(`Skill 标识不匹配：目录为 ${pkg.id}，frontmatter 为 ${found.trim()}`);
 }
 for(const entry of await readdir(root)) await rename(join(root,entry),join(dest,entry));
 await rm(staging,{recursive:true,force:true});
}

export class Manager {
 constructor({catalog,home=process.env.DSH_HOME?.trim()||join(homedir(),'.dsh'),download=downloadPackage,run=exec,fetcher=fetch,onEnvironment=()=>{},discover=null,invalidateSkills=()=>{}}) {
  this.discover=discover; this.invalidateSkills=invalidateSkills; this.catalog=catalog; this.home=resolve(home); this.root=join(this.home,'dsh-ppt-studio'); this.skills=join(this.root,'skills'); this.mounts=join(this.home,'skills'); this.stateFile=join(this.root,'state.json'); this.download=download; this.run=run; this.fetcher=fetcher; this.onEnvironment=onEnvironment; this.job=null; this.updates={}; this.checkedAt=null; this.checkError=null; this.checkFlight=null;
 }
 async state() { return json(this.stateFile,{schema:1,installed:{}}); }
 async detectedSkills() { return this.discover ? await this.discover() : []; }
 async location(id, discovered=[]) {
  const skill=discovered.find(s=>s.name===id);
  if(skill?.resourceBase?.kind==='directory')return skill.resourceBase.path;
  if(skill?.path)return dirname(skill.path);
  return join(this.mounts,id);
 }
 async ownership(id,state,discovered) {
  discovered ??= await this.detectedSkills();
  const mount=await this.location(id,discovered), target=join(this.skills,id);
  if(!await exists(mount))return state.installed[id]?'missing':'absent';
  const valid=existsSync(join(mount,'SKILL.md'))&&(!this.discover||discovered.some(s=>s.name===id));
  if(state.installed[id]) {
   try { if(await realpath(mount)===await realpath(target))return valid?'managed':'missing'; } catch(e) { if(e.code!=='ENOENT')throw e; }
  }
  // A conflicting directory is not an installed skill and must not be overwritten.
  return valid?'external':(state.installed[id]?'missing':'absent');
 }
 async status() {
  const state=await this.state(),discovered=await this.detectedSkills();
  const packages=await Promise.all(this.catalog.packages.map(async p=>{ const ownership=await this.ownership(p.id,state,discovered); const installed=state.installed[p.id]; return {...p,ownership,installedPath:['managed','external'].includes(ownership)?await this.location(p.id,discovered):null,installedRevision:installed?.revision||null,update:ownership==='managed'&&this.updates[p.id]&&this.updates[p.id]!==installed?.revision?this.updates[p.id]:null,checkError:this.updates[p.id]?.error||null}; }));
  return {packages,job:this.job,checkedAt:this.checkedAt,checkError:this.checkError,environment:await this.environment(),root:this.root};
 }
 async environment() {
  const python=join(this.root,'python',process.platform==='win32'?'Scripts/python.exe':'bin/python3');
  let pythonReady=false;
  if(existsSync(python))try{await this.run(python,['-c','import pptx,lxml,PIL,os; from playwright.sync_api import sync_playwright; p=sync_playwright().start(); assert os.path.isfile(p.chromium.executable_path); p.stop()'],{timeout:10000});pythonReady=true;}catch{}
  return {node:process.versions.node,nodeReady:Number(process.versions.node.split('.')[0])>=20,pythonReady,python:pythonReady?python:null};
 }
 async checkUpdates(force=true) {
  if(this.checkFlight)return this.checkFlight;
  this.checkFlight=this.performCheck(force);
  try{return await this.checkFlight;}finally{this.checkFlight=null;}
 }
 async performCheck(force) {
  if(!force && this.checkedAt && Date.now()-Date.parse(this.checkedAt)<3600000)return this.status();
  const outcomes=await Promise.allSettled(this.catalog.packages.filter(p=>p.available).map(async p=>{
   const response=await this.fetcher(`https://api.github.com/repos/${p.repository}/commits/${p.channel}`,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error(`${p.title}：检查失败（${response.status}）`);
   const data=await response.json(); if(!sha.test(data.sha))throw new Error(`${p.title}：版本格式无效`); return [p.id,data.sha];
  }));
  this.updates={}; const errors=[];
  for(const r of outcomes)if(r.status==='fulfilled')this.updates[r.value[0]]=r.value[1];else errors.push(r.reason.message);
  this.checkedAt=new Date().toISOString();this.checkError=errors.length?[...new Set(errors)].join('；'):null;
  return this.status();
 }
 start(action, ids=[]) {
  if(this.job?.state==='running')throw new Error('已有操作正在进行');
  if(!['install','update','repair','update-all'].includes(action))throw new Error('未知操作');
  if(!Array.isArray(ids)||ids.some(x=>typeof x!=='string')||ids.length>30)throw new Error('无效的 Skill 列表');
  if(action==='install'||action==='update') {if(!ids.length)throw new Error('请选择 Skill');closure(this.catalog,ids);}
  this.job={id:randomUUID(),state:'running',message:'准备安装',startedAt:new Date().toISOString(),log:[]};
  this.running=this.transaction(action,ids).then(()=>{this.job.state='done';this.job.message='本次操作已完成';},error=>{this.job.state='error';this.job.message=error.message;}).finally(()=>{this.job.finishedAt=new Date().toISOString();});
  return this.job;
 }
 log(message){this.job.message=message;this.job.log.push(message);if(this.job.log.length>60)this.job.log.shift();}
 async lock(){
  await mkdir(this.root,{recursive:true});const path=join(this.root,'install.lock');
  try{const f=await open(path,'wx',0o600);await f.writeFile(JSON.stringify({pid:process.pid}));await f.close();return ()=>rm(path,{force:true});}
  catch(e){if(e.code!=='EEXIST')throw e;const prior=await json(path,{});if(Number.isInteger(prior.pid))try{process.kill(prior.pid,0);}catch(err){if(err.code==='ESRCH'){await rm(path);return this.lock();}}throw new Error('另一个安装进程正在工作；请稍后重试');}
 }
 async rollback(journal) {
  for(const item of [...journal.items].reverse()) {
   const mount=join(this.mounts,item.id),target=join(this.skills,item.id),backup=join(journal.dir,'backup',item.id);
   if(await exists(backup)){await rm(target,{recursive:true,force:true});await rename(backup,target);}
   else if(!item.hadTarget)await rm(target,{recursive:true,force:true});
   if(!item.hadMount&&await exists(mount)) {const stat=await lstat(mount);if(stat.isSymbolicLink()&&resolve(dirname(mount),await readlink(mount))===target)await rm(mount);}
  }
  await atomic(this.stateFile,journal.state);await rm(join(this.root,'journal.json'),{force:true});await rm(journal.dir,{recursive:true,force:true});
 }
 async transaction(action,ids){
  const unlock=await this.lock();let journal=null;
  try{
   const interrupted=await json(join(this.root,'journal.json'),null);if(interrupted)await this.rollback(interrupted);
   const state=await this.state();
   if(action==='repair')ids=Object.keys(state.installed);
   if(action==='update-all')ids=Object.keys(state.installed);
   if(action==='update'||action==='update-all') {await this.checkUpdates();if(this.checkError)throw new Error(this.checkError);for(const id of ids)if(!state.installed[id])throw new Error('只能更新由 Planners Form 安装的 Skill');}
   if(!ids.length)throw new Error('没有需要处理的 Skill');
   const plan=closure(this.catalog,ids);
   await mkdir(this.skills,{recursive:true});await mkdir(this.mounts,{recursive:true});
   const dir=join(this.root,'staging',randomUUID());await mkdir(join(dir,'backup'),{recursive:true});
   journal={dir,state,items:[]}; const next=structuredClone(state);
   for(const base of plan){
    if(base.restricted)throw new Error(`该来源未提供可用许可证，已阻止安装：${base.title || base.id}`);
    const owner=await this.ownership(base.id,state);
    if(owner==='external'){const external=await this.location(base.id,await this.detectedSkills());if(!await exists(join(external,'SKILL.md')))throw new Error(`已有安装损坏，请自行修复：${base.title}`);
     const alias=join(this.skills,base.id);if(!await exists(alias))await symlink(external,alias,process.platform==='win32'?'junction':'dir');
     this.log(`沿用已有安装：${base.title}`);continue;}
    const revision=(action.startsWith('update')?this.updates[base.id]:null)||state.installed[base.id]?.revision||base.revision;
    if(owner==='managed'&&revision===state.installed[base.id]?.revision&&action!=='repair')continue;
    const target=join(this.skills,base.id);const mount=join(this.mounts,base.id);if(await exists(mount)&&!(state.installed[base.id]&&(await lstat(mount)).isSymbolicLink()&&resolve(dirname(mount),await readlink(mount))===target))throw new Error(`安装位置已被占用，请先检查：${mount}`);if(await exists(target)&&!state.installed[base.id])throw new Error(`检测到未登记目录，不覆盖：${base.title}`);
    this.log(`下载 ${base.title} · ${revision.slice(0,8)}`);
    await this.download({...base,revision},join(dir,base.id));
    journal.items.push({id:base.id,hadTarget:await exists(target),hadMount:await exists(join(this.mounts,base.id))});
    next.installed[base.id]={revision,installedAt:new Date().toISOString()};
   }
   if(plan.some(p=>p.runtime==='ppt'))await this.preparePython();
   // Write intent before the first activation. Recovery restores every old directory and state.
   await atomic(join(this.root,'journal.json'),journal);
   for(const item of journal.items){
    const target=join(this.skills,item.id),mount=join(this.mounts,item.id);
    const current=await this.ownership(item.id,state);if(current==='external')throw new Error('安装期间目录被其他程序修改，已停止');
    if(item.hadTarget)await rename(target,join(dir,'backup',item.id));
    await rename(join(dir,item.id),target);
    if(!item.hadMount)await symlink(target,mount,process.platform==='win32'?'junction':'dir');
   }
   await atomic(this.stateFile,next);await rm(join(this.root,'journal.json'),{force:true});
   await rm(dir,{recursive:true,force:true});journal=null;this.invalidateSkills();await this.onEnvironment(await this.environment());
  }catch(e){if(journal){if(await exists(join(this.root,'journal.json')))await this.rollback(journal);else await rm(journal.dir,{recursive:true,force:true});}throw e;}
  finally{await unlock();}
 }
 async preparePython(){
  if((await this.environment()).pythonReady)return;
  this.log('准备 PPT 的 Python 环境');
  const root=join(this.root,'python'),binary=join(root,process.platform==='win32'?'Scripts/python.exe':'bin/python3');
  if(!existsSync(binary)){
   const bundled=join(this.home,'dsh-runtimes','dsh-primary-runtime','dependencies','python',process.platform==='win32'?'python.exe':'bin/python3');
   const systemPython=existsSync(bundled)?bundled:'python3';
   try{await this.run(systemPython,['-c','import sys; assert sys.version_info >= (3,10)'],{timeout:10000});await this.run(systemPython,['-m','venv',root],{timeout:120000});}
   catch{try{await this.run('uv',['venv','--python','3.12',root],{timeout:180000});}catch{throw new Error('需要 Python 3.10+ 或 uv。安装其中之一后点击“检查 / 修复”；未更改已安装 Skill。');}}
  }
  const options={timeout:300000,maxBuffer:1024*1024};
  try{await this.run(binary,['-m','pip','--version'],{timeout:10000});}
  catch{await this.run(binary,['-m','ensurepip'],options);}
  await this.run(binary,['-m','pip','install','python-pptx>=0.6.21','lxml>=4.9','Pillow>=10','playwright>=1.40'],options);
  await this.run(binary,['-m','playwright','install','chromium'],options);
  if(!(await this.environment()).pythonReady)throw new Error('Python 环境验证失败');
 }
}
