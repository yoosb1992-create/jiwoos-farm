import type * as Phaser from "phaser";
import { PLAYER_ASSET, displayedSize, playerAnimationName } from "../assets/definitions";
import { interpolateFamilyPosition, visibleFamilyPlayers } from "./presence";
import type { FamilyPresence, FamilyPresenceSnapshot } from "./types";

/** Decorative sprites only: remote family members never join Arcade physics/colliders. */
export class RemotePlayers {
  private views = new Map<string, { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; target: FamilyPresence }>();
  private snapshot: FamilyPresenceSnapshot = { players: [], serverNow: 0 };
  private receivedAt = 0;
  constructor(private scene: Phaser.Scene, private ownId: string) {}
  receive(snapshot: FamilyPresenceSnapshot) {
    if (snapshot.serverNow < this.snapshot.serverNow) return;
    this.snapshot = snapshot; this.receivedAt = Date.now();
  }
  update(mapId: string, delta: number) {
    const estimated = { ...this.snapshot, serverNow: this.snapshot.serverNow + Date.now() - this.receivedAt };
    const players = visibleFamilyPlayers(estimated, this.ownId, mapId), ids = new Set(players.map((p) => p.playerId));
    for (const [id, view] of this.views) if (!ids.has(id)) { view.sprite.destroy(); view.label.destroy(); this.views.delete(id); }
    for (const player of players) {
      let view = this.views.get(player.playerId);
      if (!view) {
        const size = displayedSize(PLAYER_ASSET);
        const sprite = this.scene.add.sprite(player.x, player.y, PLAYER_ASSET.textureKey).setOrigin(PLAYER_ASSET.origin.x, PLAYER_ASSET.origin.y)
          .setDisplaySize(size.width, size.height).setDepth(19).setTint(0xb9e6ff).setAlpha(.85);
        const label = this.scene.add.text(player.x, player.y - 26, "", { fontFamily: "sans-serif", fontSize: "12px", color: "#e3f6ff", backgroundColor: "#254d67dd", padding: { x: 4, y: 2 } }).setOrigin(.5, 1).setDepth(25);
        view = { sprite, label, target: player }; this.views.set(player.playerId, view);
      }
      view.target = player;
      const point = interpolateFamilyPosition(view.sprite, player, delta);
      view.sprite.setPosition(point.x, point.y).play(playerAnimationName(player.moving ? "walk" : "idle", player.facing), true);
      view.label.setText(`${player.nickname} ${{ up: "↑", down: "↓", left: "←", right: "→" }[player.facing]}`).setPosition(point.x, point.y - 22);
    }
  }
  destroy() { for (const v of this.views.values()) { v.sprite.destroy(); v.label.destroy(); } this.views.clear(); }
}
