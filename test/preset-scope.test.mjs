import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));

test('PPT Agent tools and skills are declared only inside the PPT preset',async()=>{
 const patch=await readFile(join(root,'cordis.patch.yml'),'utf8');
 assert.match(patch,/id:\s*preset-ppt-studio/);
 assert.match(patch,/id:\s*ppt-studio-local-skills[\s\S]*?includeDefaultRoots:\s*false/);
 assert.match(patch,/customSkillDirs:[\s\S]*?dshHomePath\('dsh-ppt-studio\/skills'\)/);
 assert.match(patch,/id:\s*ppt-studio-agent[\s\S]*?name:\s*['"]dsh-ppt-studio\/agent['"]/);
 assert.doesNotMatch(patch,/id:\s*dsh-ppt-studio-local-skills\s*\n\s*name:/,'no global filesystem provider row');

 const agent=await import('../lib/agent.js');
 assert.equal(agent.name,'dsh-ppt-studio/agent');
 assert.ok(agent.inject.includes('tools'));
 assert.ok(agent.inject.includes('skills'));

 const host=await readFile(join(root,'lib/index.js'),'utf8');
 assert.doesNotMatch(host,/ctx\.tools\.register\(/,'global host bridge must not register agent tools');
 assert.match(host,/agentPreset === 'ppt-studio'/,'global transport must enforce the selected preset');
});
