import { CROPS } from "../shared/content.js";
import { cuttableGrass, type Tool } from "../shared/interaction.js";
import type { Entity } from "../shared/world.js";

export interface TouchIntent {
  mode: "move" | "interact" | "action";
  tool?: Tool | "hand" | "fishing_rod";
  action?: "useTool" | "harvestCrop" | "pickupDrop" | "gather" | "tillTile" | "castFishing";
  message?: string;
}
type Target = Pick<Entity,"kind"|"asset"|"crop"|"stage"|"watered"|"chopEnabled">;
const facilities = new Set(["chest","craft","bed","board","machine","well","animal","barn","trough","decoration","ladder"]);
/** Matches the server's useTool/gather rules, not asset-name guesses. Recovery
 * and transport commands are deliberately absent from this touch-only policy. */
export function entityTouchIntent(e:Target, selected:string):TouchIntent {
  if(facilities.has(e.kind))return {mode:"interact"};
  if(e.kind==="tree" || e.kind==="stump")return e.chopEnabled===false?
    {mode:"move",message:"이 나무는 벌목할 수 없어요"}:{mode:"action",tool:"axe",action:"useTool"};
  if(e.kind==="twig")return {mode:"action",tool:"axe",action:"useTool"};
  if(e.kind==="rock")return {mode:"action",tool:"pickaxe",action:"useTool"};
  if(e.kind==="gather")return cuttableGrass(e)?{mode:"action",tool:"scythe",action:"useTool"}:{mode:"action",tool:"hand",action:"gather"};
  if(e.kind==="drop")return {mode:"action",tool:"hand",action:"pickupDrop"};
  if(e.kind==="crop" && CROPS[e.crop] && e.stage>=CROPS[e.crop]!.growthDays)
    return {mode:"action",tool:"hand",action:"harvestCrop"};
  if((e.kind==="crop" || e.kind==="soil") && selected==="water" && !e.watered)
    return {mode:"action",tool:"water",action:"useTool"};
  if(e.kind==="withered")return {mode:"action",tool:"hoe",action:"tillTile"};
  return {mode:"move"};
}
