import type { FarmTileData } from "../domain";

/** Reconciles authoritative Family farm tiles into the live scene cache.
 * The callback is the real renderer bridge used by FarmScene and tests. */
export function applyFamilyFarmSnapshot(
  farm: Map<string, FarmTileData>,
  remoteFarm: readonly FarmTileData[],
  isAvailable: (x: number, y: number) => boolean,
  render: (tile: FarmTileData) => void,
) {
  for (const remote of remoteFarm) {
    const key = `${remote.x},${remote.y}`;
    let tile = farm.get(key);
    if (!tile && isAvailable(remote.x, remote.y)) {
      tile = { ...remote };
      farm.set(key, tile);
      render(tile);
      continue;
    }
    if (tile && JSON.stringify(tile) !== JSON.stringify(remote)) {
      Object.assign(tile, remote);
      render(tile);
    }
  }
}
