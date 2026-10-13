import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as tar from 'tar';
const root=fileURLToPath(new URL('..',import.meta.url));
test('a Git source archive imports without dependencies inherited from the developer machine',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'pf-source-import-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const tree=execFileSync('git',['write-tree'],{cwd:root,encoding:'utf8'}).trim();
 const archive=join(temp,'source.tar');await writeFile(archive,execFileSync('git',['archive',tree],{cwd:root,maxBuffer:20*1024*1024}));
 await tar.x({file:archive,cwd:temp});
 const result=execFileSync(process.execPath,['--input-type=module','-e',`const p=await import(${JSON.stringify(new URL('file://'+join(temp,'lib/index.js')).href)});if(p.name!=='planners-form'||typeof p.apply!=='function')process.exit(2);console.log('host entry ready')`],{cwd:temp,encoding:'utf8',env:{PATH:process.env.PATH,HOME:temp}});
 assert.match(result,/host entry ready/);
});
