import { MAP_DEFINITIONS } from "./definitions";
import type { MapDefinition, MapId } from "./types";

export const cloneMapDefinitions = (maps: Record<string, MapDefinition>) =>
  structuredClone(maps) as Record<string, MapDefinition>;

export class MapRegistry {
  private maps: Record<string, MapDefinition>;

  constructor(private readonly builtIns: Record<string, MapDefinition> = MAP_DEFINITIONS) {
    this.maps = cloneMapDefinitions(builtIns);
  }

  has(id: MapId) { return Object.hasOwn(this.maps, id); }
  get(id: MapId) { return this.maps[id]; }
  require(id: MapId) {
    const map = this.get(id);
    if (!map) throw new Error(`Unknown map: ${id}`);
    return map;
  }
  entries() { return Object.values(this.maps); }
  snapshot() { return cloneMapDefinitions(this.maps); }
  replace(maps: Record<string, MapDefinition>) { this.maps = cloneMapDefinitions(maps); }
  reset() { this.maps = cloneMapDefinitions(this.builtIns); }
}

export const runtimeMapRegistry = new MapRegistry();
