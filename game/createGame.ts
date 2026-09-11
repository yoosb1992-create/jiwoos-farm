import * as Phaser from "phaser";
import { FarmScene } from "./FarmScene";
import { GAME_RENDER_SETTINGS } from "./assets/definitions";
export function createGame(parent: string) {
  return new Phaser.Game({ type: Phaser.AUTO, parent, ...GAME_RENDER_SETTINGS,
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" }, physics: { default: "arcade", arcade: { debug: false } }, scene: [FarmScene],
    input: { mouse: { preventDefaultWheel: true }, touch: { capture: true } } });
}
