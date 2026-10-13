import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const entries = [
 ['planners-review-core','审阅核心','公共审阅通信与页面宿主',[],true],
 ['planners-source-index','来源索引','保存资料来源与定位',[],true],
 ['planners-report-kit','报告装配','统一生成离线报告',[],true],
 ['planners-fact-check','事实核查','检查事实与来源的一致性',['planners-source-index'],true],
 ['planners-method-wiki','方法库','共享策略与研究方法',[],true],
 ['planners-ppt-hell','PPT 制作','从材料生成可编辑 PPT',['planners-review-core','planners-source-index','planners-fact-check','planners-report-kit'],false,'ppt'],
 ['planners-proposal-system','策略提案','共创策略判断与方案结构',['planners-review-core','planners-source-index','planners-method-wiki','sparkling','storytelling','slide-copy'],false,null,'Planners-Proposal-System'],
 ['planners-bypage','逐页内容','展开逐页文案、素材与来源',['planners-review-core','planners-source-index','planners-fact-check','planners-method-wiki','storytelling','slide-copy'],false],
 ['planners-quali-box','定性分析','分析访谈与开放文本',['planners-source-index','planners-report-kit'],false],
 ['planners-quanti-box','定量分析','分析结构化数据并生成报告',['planners-source-index','planners-report-kit'],false],
 ['slide-copy','幻灯片文案','页面角色、标题链与文案规范',[],true],
 ['storytelling','叙事方法','组织叙事推进与认知节奏',[],true],
 ['sparkling','策略研讨','围绕材料共创业务判断',[],true],
 ['video-idea-system','视频创意','从核心洞察到可录口播与念稿审阅',['planners-review-core','planners-source-index'],false],
 ['video-craft','视频制作','剪辑、字幕与成片审阅；渲染工具按安装文档配置',['planners-review-core'],false],
];
export const entriesForRelease = entries;
const results = await Promise.allSettled(entries.map(async ([id,title,description,dependencies,internal,runtime,repo=id]) => {
 const { stdout } = await exec('git',['ls-remote',`https://github.com/thePlannerIvan/${repo}.git`,'refs/heads/main'],{timeout:45000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
 const revision=stdout.split(/\s/)[0];
 if(!/^[a-f0-9]{40}$/.test(revision)) throw new Error(`No main revision: ${id}`);
 return {id,title,description,dependencies,internal,hidden:['slide-copy','storytelling','sparkling'].includes(id),runtime:runtime||null,repository:`thePlannerIvan/${repo}`,revision,channel:'main',available:true};
}));
const failures=results.filter(r=>r.status==='rejected');
if(failures.length) { console.error(failures.map(r=>r.reason.message));process.exit(1); }
const packages=results.map(r=>r.value);
await writeFile(new URL('../catalog.json',import.meta.url),JSON.stringify({schema:1,generatedAt:new Date().toISOString(),packages},null,2)+'\n');
console.log(`Pinned ${results.length} public packages; 3 hidden companion Skills.`);
