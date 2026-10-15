import { GAME_CONFIG } from "../config";
import type { MapRegistry } from "../maps/MapRegistry";
import { npcRoute } from "./navigation";
import type { NpcDefinition, NpcPose, NpcScheduleStep } from "./types";
export function scheduleAt(npc: NpcDefinition, day: number, minute: number): NpcScheduleStep | undefined {
  return npc.schedule.filter(s => (!s.days || s.days.includes(day)) && s.minute <= minute).at(-1);
}
/** Stateless sampling: no persisted NPC position and no per-frame server request. */
export class NpcController {
  private routes = new Map<NpcScheduleStep, ReturnType<typeof npcRoute>>();
  constructor(readonly definitions: readonly NpcDefinition[], private maps: MapRegistry) {}
  sample(day:number, minute:number): NpcPose[] {
    return this.definitions.flatMap<NpcPose>(npc => {
      const step=scheduleAt(npc,day,minute), map=step&&this.maps.get(step.mapId);
      if(!step||!map) return [];
      let path=this.routes.get(step);
      if(!path) { path=npcRoute(map,step.from,step.to); this.routes.set(step,path); }
      if(!path.length) return [];
      let distance=Math.max(0,minute-step.minute)*GAME_CONFIG.day.realMsPerGameMinute/1000*npc.speed;
      for(let i=1;i<path.length;i++) {
        const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.y-a.y);
        if(distance<length) return [{npcId:npc.id,mapId:step.mapId,x:a.x+(b.x-a.x)*distance/length,y:a.y+(b.y-a.y)*distance/length,
          facing:b.x>a.x?"right":b.x<a.x?"left":b.y>a.y?"down":"up",moving:true,activity:step.activity}];
        distance-=length;
      }
      return [{npcId:npc.id,mapId:step.mapId,...path.at(-1)!,facing:step.facing,moving:false,activity:step.activity}];
    });
  }
}
