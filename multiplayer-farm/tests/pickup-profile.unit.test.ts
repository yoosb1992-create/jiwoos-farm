import test from "node:test";
import assert from "node:assert/strict";
import { ITEMS } from "../shared/content.js";
import { itemPickupProfile, DEFAULT_PICKUP_PROFILE, pickupFlightMs, PICKUP_SCAN_MS } from "../shared/pickup.js";
import { DropIndex } from "../shared/interaction.js";
import { entity } from "../shared/world.js";
import { EYE_PARTS, eyeIrisRect } from "../client/character-parts.js";
import { defaultAppearance, selectGender } from "../shared/appearance.js";
import { getSunState } from "../shared/sunlight.js";
import { atmosphereLight } from "../client/solar-lighting.js";

test("pickup profiles drive indexed range, timings and future server-owned bonuses",()=>{
  const base=itemPickupProfile("wood");assert.deepEqual(base,DEFAULT_PICKUP_PROFILE);
  assert(base.magnetRadius>32 && base.spawnProtectionMs<800 && PICKUP_SCAN_MS<120);
  assert(pickupFlightMs(56,base)<150);
  const original=ITEMS.stone!.itemPickupProfile;
  try {
    ITEMS.stone!.itemPickupProfile={magnetRadius:96,pickupRadius:24,pickupDelayMs:125,pickupSpeed:280,spawnProtectionMs:450,autoCollectPriority:4,reaction:"rare"};
    const profile=itemPickupProfile("stone");assert.equal(profile.pickupDelayMs,125);assert.equal(profile.reaction,"rare");
    const drop=entity("d","farm","drop",80,0,"");drop.item="stone";
    const index=new DropIndex();index.rebuild([drop]);assert.equal(index.maxMagnetRadius,96);
    assert.equal(index.nearby("farm",0,0,index.maxMagnetRadius)[0]?.id,"d");
    assert.equal(itemPickupProfile("stone",{radiusBonus:16,speedMultiplier:2}).magnetRadius,112);
    assert.equal(itemPickupProfile("stone",{speedMultiplier:2}).pickupSpeed,560);
    ITEMS.stone!.itemPickupProfile={magnetRadius:Infinity,pickupSpeed:NaN,pickupDelayMs:-1};
    assert.equal(itemPickupProfile("stone").magnetRadius,56);assert.equal(itemPickupProfile("stone").pickupDelayMs,0);
  } finally {ITEMS.stone!.itemPickupProfile=original;}
});
test("ten eye apertures have balanced front gaze with separately tunable side irises",()=>{
  assert.equal(Object.keys(EYE_PARTS).length,10);
  for(const eye of Object.values(EYE_PARTS)){
    const left=eyeIrisRect(eye,"left"),right=eyeIrisRect(eye,"right");
    assert.deepEqual(left,right,"front eyes must not diverge");
    assert(left[0]+left[2]/2<=3,"the iris must not drift toward the outer lid");
    const side=eyeIrisRect(eye,"side");assert(side[0]>=0&&side[0]+side[2]<=5);
  }
  const female=defaultAppearance("female");assert.equal(female.hair,"bun");assert.equal(female.top,"terracotta");
  const chosen={...female,hairColor:"rose",eyeShape:"calm"} as const;
  const male=selectGender(chosen,"male");assert.equal(male.hairColor,"rose");assert.equal(male.eyeShape,"calm");
});
test("seasonal sunlight has distinct color and summer lift; full moon stays dark",()=>{
  const lights=[14,42,70,98].map(day=>{const sun=getSunState({day,minute:750});return atmosphereLight("farm",750,sun);});
  assert(lights[1]!.daylightLift>lights[0]!.daylightLift*1.6);
  assert(new Set(lights.map(l=>l.daylightColor)).size===4);
  const dark=getSunState({day:1,minute:0}),full=getSunState({day:15,minute:0});
  assert(dark.ambientLight<.02);assert(full.ambientLight>dark.ambientLight&&full.ambientLight<.08);
  assert.equal(getSunState({day:29,minute:0}).ambientLight,dark.ambientLight);
});
