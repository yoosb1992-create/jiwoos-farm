import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const farm = 'multiplayer-farm/';
const require = createRequire(path.join(root, farm, 'package.json'));
const ts = require('typescript');
function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e =>
    ['node_modules','dist','.git','test-results','test-results-production'].includes(e.name) ? [] :
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
}
const sources = walk('multiplayer-farm').filter(f => /\.(ts|mjs|json|css|html)$/.test(f));
const sourceSet = new Set(sources);
const graph = new Map();
for (const file of sources.filter(f => /\.(ts|mjs)$/.test(f))) {
  const imports = ts.preProcessFile(fs.readFileSync(path.join(root,file),'utf8'), true, true).importedFiles;
  graph.set(file, imports.flatMap(({fileName}) => {
    if (!fileName.startsWith('.')) return [];
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), fileName));
    const match = [base,base.replace(/\.js$/,'.ts'),`${base}.ts`,`${base}/index.ts`].find(p => sourceSet.has(p));
    return match ? [match] : [];
  }));
}
function closure(file, seen = new Set()) {
  if(seen.has(file)) return seen;
  seen.add(file); for(const dep of graph.get(file) ?? []) closure(dep,seen);
  return seen;
}
const tests = suffix => sources.filter(f => f.endsWith(suffix)).sort();
const allBrowsers = tests('.spec.ts').filter(f => f.includes('/tests/browser/'));
// Browser tests operate through HTTP/DOM rather than importing the app. These
// explicit runtime entry points supplement (never replace) the import graph.
const domains = [
  { roots:['client/network.ts','client/input.ts','client/config.ts'], suites:['reconnect-stability','lobby','netcode','session-entry','farm'] },
  { roots:['client/start-world.ts','client/editor/','shared/world','shared/layout','shared/blueprint','shared/default-farm','shared/regions','client/layout.ts'], suites:['world-templates','editor2','default-farm','touch-editor','farm'] },
  { roots:['client/character','shared/appearance'], suites:['customization','tool-animation'] },
  { roots:['client/household','client/life-panels','client/chest','client/craft','client/furniture','shared/chest','shared/household','shared/home-furniture','shared/placement','shared/transport','shared/pickup','shared/tool-levels'], suites:['household','sunlight-tools','quickbar'] },
  { roots:['client/quickbar','shared/quickbar','client/tool-icon','client/item-icons'], suites:['quickbar'] },
  { roots:['client/navigation','client/control-layout','shared/pathfinding','shared/interaction','shared/applyMovement','client/tool-','shared/tool-','client/tilled','client/crop','shared/cultivation','shared/crop','client/placement'], suites:['farm','interaction','touch-editor','tool-animation','quickbar'] },
  { roots:['client/solar','client/night','shared/sunlight'], suites:['sunlight-tools'] },
  { roots:['shared/nature','client/world/','client/dressing','shared/dressing'], suites:['nature','stumps','default-farm','touch-editor'] },
];
const domainDeps = domains.map(d => ({...d, dependencies:new Set(sources.filter(f => d.roots.some(p => f.startsWith(farm+p))).flatMap(f => [...closure(f)]))}));
const core = ['actions','layout-safety','household','quickbar'].map(n => `${farm}tests/${n}.unit.test.ts`);
export function select(files, {full=false, unknownBase=false}={}) {
  const changed = new Set(files);
  const reasons=[];
  const infrastructure=files.some(f => f.startsWith('scripts/ci/') || f.startsWith('.github/workflows/'));
  full ||= unknownBase || infrastructure;
  if(full) reasons.push(unknownBase ? 'Missing comparison base: full safety fallback' : 'Explicit FULL or CI infrastructure change');
  const affected = file => [...closure(file)].some(f => changed.has(f));
  const config=files.some(f => /^multiplayer-farm\/(package(-lock)?\.json|tsconfig.*\.json|vite\.config\.ts|playwright.*\.ts|build\/)/.test(f));
  const deleted=files.some(f => f.startsWith(farm) && !sourceSet.has(f) && !/\.md$/.test(f));
  const server=files.some(f => /^multiplayer-farm\/(server|persistence)\//.test(f));
  const shared=files.some(f => /^multiplayer-farm\/shared\//.test(f));
  const browser = new Set();
  let broad=full || config || deleted || server;
  for(const file of files) {
    if(allBrowsers.includes(file)) browser.add(file);
    if(file.startsWith('public/assets/')) broad=true;
    if(file.startsWith(`${farm}client/`) || file.startsWith(`${farm}shared/`)) {
      if(/\.css$/.test(file)) { reasons.push(`Style-only: FAST covers ${file}`); continue; }
      const matched=domainDeps.filter(d => d.dependencies.has(file));
      for(const d of matched) for(const name of d.suites) browser.add(`${farm}tests/browser/${name}.spec.ts`);
      // Entrypoints/unknown future features are conservative until mapped.
      if(!matched.length || file===`${farm}client/main.ts` || file===`${farm}client/scene.ts`) broad=true;
    }
    if(file===`${farm}index.html` || file===`${farm}editor.html` || /^multiplayer-farm\/tests\/browser\/.*(?<!\.spec)\.ts$/.test(file)) broad=true;
  }
  if(broad) allBrowsers.forEach(f => browser.add(f));
  // Imported browser helpers/shared fixtures are also actual dependencies.
  allBrowsers.filter(affected).forEach(f => browser.add(f));
  const integration=tests('.integration.test.ts').filter(f => full || config || deleted || affected(f) || server);
  const units=tests('.unit.test.ts').filter(f => full || config || deleted || core.includes(f) || affected(f));
  const db=full || config || deleted || server || shared || tests('.db.test.ts').some(affected) || files.some(f => /client\/(main|network|start-world|editor\/)/.test(f));
  const docker=full || config || files.some(f => /^multiplayer-farm\/(Dockerfile|deployment\/|persistence\/migrat)/.test(f));
  const production=full || broad || docker || files.includes(`${farm}tests/production-browser.spec.ts`);
  const legacy=full || files.some(f => !f.startsWith(farm) && !f.startsWith('multiplayer-lab/') && !f.startsWith('.github/') && !f.startsWith('scripts/ci/') && !/\.md$/.test(f));
  const lab=full || files.some(f => f.startsWith('multiplayer-lab/'));
  const result={full,units,integration,browser:[...browser].sort(),db,docker,production,legacy,lab,reasons};
  if(!fs.existsSync(path.join(root,`${farm}tests/browser/session-entry.spec.ts`))) result.browser=result.browser.filter(f => !f.endsWith('/session-entry.spec.ts'));
  return result;
}
function changedFiles(base,head) {
  // No shallow/missing-base success: unknown bases widen to FULL.
  if(!base || /^0+$/.test(base)) return null;
  try { return execFileSync('git',['diff','--name-only','--no-renames',base,head],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean); }
  catch { return null; }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const files=changedFiles(process.env.CI_BASE,process.env.CI_HEAD || 'HEAD');
  const result=select(files??[],{full:process.env.CI_FULL==='true',unknownBase:files===null});
  fs.writeFileSync(path.join(root,'ci-plan.json'),JSON.stringify({...result,files,sha:process.env.CI_HEAD},null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
  if(process.env.GITHUB_OUTPUT) for(const key of ['full','db','docker','production','legacy','lab']) fs.appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${result[key]}\n`);
  if(process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,`targeted=${!!(result.integration.length||result.db)}\n` +
    `browsers=${!!(result.browser.length||result.production)}\n` +
    `shards=${JSON.stringify(result.full ? [1,2,3] : [1])}\n` +
    `shard_count=${result.full ? 3 : 1}\n`);
  if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## CI selection\nCommit: ${process.env.CI_HEAD}\n\n\`\`\`json\n${JSON.stringify(result,null,2)}\n\`\`\`\n`);
}
