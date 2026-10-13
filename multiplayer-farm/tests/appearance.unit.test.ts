import test from "node:test";
import assert from "node:assert/strict";
import { APPEARANCE_OPTIONS, DEFAULT_APPEARANCE, appearanceOf, appearanceKey, appearanceColor, parseAppearance } from "../shared/appearance.js";
const legacy={version:1,gender:"female",height:"tall",hair:"long",hairColor:"silver",top:"plum",bottom:"denim",shoes:"cream"};
test("v1 migrates all chosen cosmetics and supplies independently editable v2 face parts",()=>{
  const migrated=parseAppearance(legacy);
  assert.deepEqual(migrated,{...DEFAULT_APPEARANCE,gender:"female",height:110,hair:"long",hairColor:"silver",top:"plum",bottom:"denim",shoeColor:"cream"});
  assert.deepEqual(appearanceOf(JSON.stringify(legacy)),migrated);
  assert.deepEqual(appearanceOf(),DEFAULT_APPEARANCE);
  assert.deepEqual(appearanceOf({version:99}),DEFAULT_APPEARANCE);
  for(const [key,options] of Object.entries(APPEARANCE_OPTIONS))for(const option of Object.keys(options)){
    const changed=parseAppearance({...migrated,[key]:option});
    assert.deepEqual({...changed,[key]:(migrated as any)[key]},migrated);
  }
});
test("height and independent sRGB channels validate at the server boundary",()=>{
  for(let height=70;height<=145;height+=5)assert.equal(parseAppearance({...DEFAULT_APPEARANCE,height}).height,height);
  for(const height of [NaN,Infinity,69,146,71,"100",null,{}])assert.throws(()=>parseAppearance({...DEFAULT_APPEARANCE,height}));
  for(const invalid of [{version:3},{eyeShape:"constructor"},{earStyle:"__proto__"},{shoeStyle:"flippers"},{isOwner:true},{customColors:{top:"url(https://bad.invalid)"}},{customColors:{skinColor:"#FFF"}},{customColors:{speed:"#ffffff"}},{customColors:[]}])
    assert.throws(()=>parseAppearance({...DEFAULT_APPEARANCE,...invalid}));
  const custom=parseAppearance({...DEFAULT_APPEARANCE,customColors:{eyeColor:"#ABC123",eyebrowColor:"#112233"}});
  assert.equal(appearanceColor(custom,"eyeColor"),"#abc123");assert.equal(appearanceColor(custom,"eyebrowColor"),"#112233");
  assert.equal(appearanceColor(custom,"skinColor"),appearanceColor(DEFAULT_APPEARANCE,"skinColor"));
  assert.equal(appearanceColor(DEFAULT_APPEARANCE,"eyebrowColor"),appearanceColor(DEFAULT_APPEARANCE,"hairColor"));
});
test("texture identity shares height transforms, separates every rendered part and canonicalizes color ordering",()=>{
  assert.equal(appearanceKey(DEFAULT_APPEARANCE),appearanceKey({...DEFAULT_APPEARANCE,height:145}));
  for(const [key,options] of Object.entries(APPEARANCE_OPTIONS)){
    const option=Object.keys(options).find(o=>o!==(DEFAULT_APPEARANCE as any)[key])!;
    assert.notEqual(appearanceKey(DEFAULT_APPEARANCE),appearanceKey(parseAppearance({...DEFAULT_APPEARANCE,[key]:option})),key);
  }
  assert.equal(appearanceKey(parseAppearance({...DEFAULT_APPEARANCE,customColors:{eyeColor:"#123456",top:"#ABCDEF"}})),appearanceKey(parseAppearance({...DEFAULT_APPEARANCE,customColors:{top:"#abcdef",eyeColor:"#123456"}})));
});
