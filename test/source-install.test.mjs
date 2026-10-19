import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));

// `files` decides what a published or Git-installed archive contains. Every runtime
// module and resource the host or client half loads must be covered by it.
const covered=rel=>manifest.files.some(entry=>rel===entry||rel.startsWith(`${entry}/`));

test('the published file list covers every runtime entry and resource',async()=>{
 for(const rel of ['lib/index.js','lib/client.js','lib/project.js','lib/export.js','lib/manager.js','lib/skill-discovery.js','catalog.json','cordis.patch.yml','assets/icon.svg','locale/en.json','locale/zh.json']){
  assert.ok(covered(rel),`package.json files is missing ${rel}`);
  await stat(join(root,rel));
 }
 assert.equal(manifest.name,'dsh-ppt-studio');
 assert.equal(manifest.dsh.bundle.patch,'./cordis.patch.yml');
 assert.equal(manifest.dsh.client.platform,'web');
 assert.equal(manifest.exports['./client'],'./lib/client.js');
});

test('every relative import of the host entry resolves inside the package',async()=>{
 const source=await readFile(join(root,'lib','index.js'),'utf8');
 const specifiers=[...source.matchAll(/^import\s[^;]*?from\s+'(\.{1,2}\/[^']+)';/gm)].map(match=>match[1]);
 assert.ok(specifiers.length>=3);
 for(const specifier of specifiers){
  const target=join(dirname(join(root,'lib','index.js')),specifier);
  await stat(target);
 }
});
