import { defaultLayout, type WorldLayout } from "../shared/layout.js";
import { mapFor as resolveMap, type MapData } from "../shared/content.js";
export const CLIENT_MAPS: Record<string, MapData> = defaultLayout().maps;
let serialized = "";
export let layoutRevision = 0;
export function receiveLayout(raw: string): void {
  if (!raw || raw === serialized) return;
  const layout = JSON.parse(raw) as WorldLayout;
  for (const key of Object.keys(CLIENT_MAPS)) delete CLIENT_MAPS[key];
  Object.assign(CLIENT_MAPS, layout.maps);
  serialized = raw;
  layoutRevision++;
}
export const mapFor = (id: string) => resolveMap(id, CLIENT_MAPS);
