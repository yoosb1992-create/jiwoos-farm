import type { Asset } from "./content.js";
import { TREE_SPECIES, TREE_STAGE_IDS, DEBRIS, GARDEN_FLOWERS } from "./nature.js";
const root="/assets/nature";
export const NEW_CROP_ART=["pinktulip","sweetpea","springonion","coolcucumber","watermelon","lavender","rubybeet","chrysanthemum","scarletbean","icelettuce","snowpea","frostflower"];
export function withNatureArt(assets: Record<string,Asset>): Record<string,Asset> {
  const add=(id:string,path:string,w:number,h:number,originY=.94)=>assets[id]={assetId:id,textureKey:id,source:{kind:"image",path:`${root}/${path}.webp`},frameSize:{width:w,height:h},origin:{x:.5,y:originY},displayScale:{x:1,y:1}};
  for(const t of TREE_SPECIES){
    const sizes=[[28,36],[64,86],[128,160],[172,212],[216,270]];
    for(const [i,stage] of TREE_STAGE_IDS.entries())add(`${t.id}_${stage}`,`trees/${t.id}_${stage}`,sizes[i]![0]!,sizes[i]![1]!);
    for(const season of ["summer","autumn","winter"])add(`${t.id}_${season}`,`trees/${t.id}_${season}`,128,160);
    assets[t.id]={...assets[`${t.id}_mature`]!,assetId:t.id,textureKey:t.id};
  }
  for(const [old,id] of [["tree","tree_oak"],["tree_variant_b","tree_pine"]])assets[old!]={...assets[id!]!,assetId:old!,textureKey:old!};
  for(const d of DEBRIS)add(d.id,`debris/${d.id}`,d.kind==="twig"?40:34,d.kind==="twig"?26:34);
  assets.farm_wildflower={...assets.farm_white_wildflower!,assetId:"farm_wildflower",textureKey:"farm_wildflower"};
  for(const f of GARDEN_FLOWERS)add(f.id,`flowers/${f.id}`,56,52);
  for(const id of NEW_CROP_ART)add(`crop_${id}_mature`,`crops/${id}`,40,52,.8);
  return assets;
}
