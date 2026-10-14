import test from 'node:test';
import assert from 'node:assert/strict';
import {select} from './select.mjs';
test('cosmetic CSS uses FAST only',()=>{const p=select(['multiplayer-farm/client/style.css']);assert.equal(p.db,false);assert.deepEqual(p.browser,[]);assert.deepEqual(p.integration,[]);assert.equal(p.docker,false);});
test('appearance runtime imports select character persistence/browser checks',()=>{const p=select(['multiplayer-farm/shared/appearance.ts']);assert.ok(p.units.some(f=>f.includes('appearance.unit')));assert.ok(p.integration.some(f=>f.includes('appearance.integration')));assert.ok(p.browser.some(f=>f.includes('customization')));assert.equal(p.db,true);});
test('server, storage, shared inventory never omit transactional safety',()=>{for(const f of ['server/FarmRoom.ts','persistence/store.ts','shared/chest-storage.ts','shared/layout-application.ts']){const p=select(['multiplayer-farm/'+f]);assert.equal(p.db,true);assert.ok(p.integration.length);assert.ok(p.browser.length);}});
test('new/deleted and unmapped runtime paths widen safely',()=>{const p=select(['multiplayer-farm/shared/future-npc.ts']);assert.equal(p.db,true);assert.ok(p.browser.length>10);assert.ok(p.integration.length>10);});
test('FULL includes old tests, DB, containers, legacy and golden lab',()=>{const p=select([],{full:true});for(const k of ['db','docker','production','legacy','lab'])assert.equal(p[k],true);assert.ok(p.browser.some(f=>f.includes('reconnect-stability')));assert.ok(p.browser.some(f=>f.includes('lobby')));});
test('unknown git base and CI changes fail safe to FULL',()=>{assert.equal(select([],{unknownBase:true}).full,true);assert.equal(select(['.github/workflows/multiplayer-farm.yml']).full,true);});
test('farm changes do not repeat unchanged lab or legacy builds',()=>{const p=select(['multiplayer-farm/client/quickbar-ui.ts']);assert.equal(p.lab,false);assert.equal(p.legacy,false);assert.ok(p.browser.some(f=>f.includes('quickbar')));});
import {requireSuccess} from './gates.mjs';
test('required gate rejects failures, cancellation and missing selected jobs',()=>{
  const fast={result:'success',outputs:{targeted:'true',docker:'false',lab:'false',legacy:'false'}};
  for(const result of ['failure','cancelled','skipped']) assert.throws(()=>requireSuccess({fast,targeted:{result}}));
  assert.throws(()=>requireSuccess({fast}));
  assert.doesNotThrow(()=>requireSuccess({fast,targeted:{result:'success'},containers:{result:'skipped'}}));
});
