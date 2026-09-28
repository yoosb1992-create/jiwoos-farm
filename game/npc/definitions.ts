import type { NpcDefinition } from "./types";
import type { MapRegistry } from "../maps/MapRegistry";
import { npcCellSafe } from "./navigation";
export const NPC_DEFINITIONS: readonly NpcDefinition[] = [];
export function validateNpcs(npcs:readonly NpcDefinition[], maps:MapRegistry): string[] {
  const errors:string[]=[], ids=new Set<string>();
  for(const n of npcs) {
    if(!n.id || ids.has(n.id)) errors.push(`duplicate/empty NPC: ${n.id}`); ids.add(n.id);
    if(!Number.isFinite(n.speed)||n.speed<=0||!n.schedule.length) errors.push(`invalid speed/schedule: ${n.id}`);
    if(!n.displayName||!n.dialogue.first.length||!n.dialogue.general.length) errors.push(`missing dialogue/name: ${n.id}`);
    for(let i=0;i<n.schedule.length;i++) {
      const s=n.schedule[i],map=maps.get(s.mapId);
      if(!Number.isFinite(s.minute)||s.minute<0||s.minute>1440||(i>0&&s.minute<n.schedule[i-1].minute)) errors.push(`schedule order: ${n.id}`);
      if(!map||!npcCellSafe(map,s.from)||!npcCellSafe(map,s.to)) errors.push(`unsafe schedule: ${n.id}/${s.minute}`);
    }
  }
  return errors;
}
