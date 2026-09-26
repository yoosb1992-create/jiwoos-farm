import type { FamilySession } from "./family/types";
import * as Phaser from "phaser";
import { FarmScene } from "./FarmScene";
import { GAME_RENDER_SETTINGS } from "./assets/definitions";
import { MapRegistry } from "./maps/MapRegistry";
import type { MapDefinition, MapId } from "./maps/types";

export interface CreateGameOptions { maps?: Record<string, MapDefinition>; initialMapId?: MapId; testMode?: boolean; family?: FamilySession }
export function createGame(parent: string, options: CreateGameOptions = {}) {
  const maps = new MapRegistry();
  if (options.maps) maps.replace(options.maps);
  return new Phaser.Game({ type: Phaser.AUTO, parent, ...GAME_RENDER_SETTINGS,
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" }, physics: { default: "arcade", arcade: { debug: false } }, scene: [new FarmScene({ maps, initialMapId: options.initialMapId, testMode: options.testMode, family: options.family })],
    input: { mouse: { preventDefaultWheel: true }, touch: { capture: true } } });
}

