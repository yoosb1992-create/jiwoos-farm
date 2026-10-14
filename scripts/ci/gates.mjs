import {fileURLToPath} from 'node:url';
import path from 'node:path';
export function requireSuccess(needs) {
  if(needs.fast?.result!=='success') throw Error('FAST did not succeed');
  const gates={targeted:'targeted',browsers:'browsers',containers:'docker','golden-lab-regression':'lab',legacy:'legacy'};
  for(const [job,flag] of Object.entries(gates))
    if(needs.fast.outputs[flag]==='true' && needs[job]?.result!=='success') throw Error(`${job} was required`);
  for(const [name,job] of Object.entries(needs))
    if(!['success','skipped'].includes(job.result)) throw Error(`${name}: ${job.result}`);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) requireSuccess(JSON.parse(process.env.RESULTS));
