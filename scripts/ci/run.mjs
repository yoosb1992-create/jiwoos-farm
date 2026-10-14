import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const kind=process.argv[2];
const plan=JSON.parse(fs.readFileSync('ci-plan.json','utf8'));
if(!['units','integration','browser'].includes(kind)) throw Error('Unknown CI suite');
const files=plan[kind].map(f=>f.replace(/^multiplayer-farm\//,''));
if(!files.length) { console.log(`No ${kind} selected (see ci-plan.json)`); process.exit(0); }
const command=kind==='browser'?'npx':process.execPath;
const args=kind==='browser'?['--no-install','playwright','test',...files,'--output=test-results/selected']:['--import','tsx','--test','--test-concurrency=1',...files];
if(kind==='browser' && process.env.CI_SHARD) args.push('--fully-parallel','--workers=1',`--shard=${process.env.CI_SHARD}`);
const result=spawnSync(command,args,{cwd:'multiplayer-farm',stdio:'inherit'});
if(result.error) throw result.error;
process.exit(result.status??1);
