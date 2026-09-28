import type { MapRegistry } from "../maps/MapRegistry";
import { FAIRY_FOREST_ID, generateFairyForest } from "./generation";

/** Keeps procedural content in the runtime registry, outside authored maps and editor documents. */
export function installFairyForest(registry: MapRegistry, scope: string, daySerial: number) {
  if (!registry.has("road")) return false;
  const maps = registry.snapshot();
  maps[FAIRY_FOREST_ID] = generateFairyForest(scope, daySerial);
  registry.replace(maps);
  return true;
}
