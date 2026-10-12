import Phaser from "phaser";
import type { CarryAppearance, TransportFx } from "../shared/transport.js";
import { TRANSPORT_DURATION_MS } from "../shared/transport-config.js";
import type { Facing } from "../shared/world.js";
import type { RenderPlayer } from "./network.js";
import { chestTextureKey } from "./chest-art.js";
import { farmerGround, farmerTop, farmerKey, type FarmerPose } from "./tool-animation-art.js";

interface Motion { event: TransportFx; started: number }
interface FurnitureView { parts: Phaser.GameObjects.Image[]; caption: Phaser.GameObjects.Text }
const ease = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };
export class FurnitureAnimation {
  private motions = new Map<string, Motion>();
  private views = new Map<string, FurnitureView>();
  private seen = new Set<string>();
  constructor(private scene: Phaser.Scene) {}
  event(event: TransportFx): void {
    if (this.seen.has(event.id)) return;
    this.seen.add(event.id); if (this.seen.size > 100) this.seen.delete(this.seen.values().next().value!);
    this.motions.set(event.actorId, { event, started: performance.now() });
  }
  busy(id: string, now = performance.now()): boolean {
    const m = this.motions.get(id); return !!m && now - m.started < TRANSPORT_DURATION_MS;
  }
  hiddenFloor(id: string, now: number): boolean {
    for (const m of this.motions.values()) if (now - m.started < TRANSPORT_DURATION_MS && m.event.ids.includes(id)) return true;
    return false;
  }
  update(p: RenderPlayer, body: Phaser.GameObjects.Sprite, label: Phaser.GameObjects.Text, now: number, area: string): boolean {
    let motion = this.motions.get(p.id);
    if (motion && now - motion.started >= TRANSPORT_DURATION_MS) { this.motions.delete(p.id); motion = undefined; }
    const appearance: CarryAppearance | undefined = motion?.event ?? (p.carry ? JSON.parse(p.carry) as CarryAppearance : undefined);
    const visible = p.area === area && !!appearance;
    let view = this.views.get(p.id);
    if (!visible) { view?.parts.forEach(part => part.setVisible(false)); view?.caption.setVisible(false); return false; }
    if (!view) {
      view = { parts: [], caption: this.scene.add.text(0, 0, "", { fontSize: "11px", color: "#fffce7", backgroundColor: "#38503bc9", padding: { x: 5, y: 2 } }).setOrigin(.5) };
      this.views.set(p.id, view);
    }
    const progress = motion ? (now - motion.started) / TRANSPORT_DURATION_MS : 1;
    const lifting = motion?.event.kind === "lift";
    const blend = motion ? ease((progress - .15) / .65) : 1;
    const raised = motion ? (lifting ? blend : 1 - blend) : 1;
    const facing = (motion?.event.facing ?? p.facing) as Facing;
    const pose: FarmerPose = raised > .65 ? "raised" : progress < .2 && lifting ? "bow" : "strike";
    const moving = !motion && p.moving;
    const frame = Math.floor(now / 150) % 4;
    const texture = moving ? `farmer-carry-${facing}-${frame}` : farmerKey(facing, motion ? pose : "raised");
    body.anims.stop();
    body.setTexture(texture).setOrigin(.5, moving ? 70 / 72 : farmerGround(facing, motion ? pose : "raised") / 72)
      .setPosition(p.x, p.y + (motion ? Math.sin(Math.PI * progress) * 2 : 0)).setAngle(0).setAlpha(p.connected ? 1 : .4);
    const bob = moving ? Math.sin(now / 150 * Math.PI) * .7 : 0;
    for (let i = 0; i < appearance!.size; i++) {
      const part = view.parts[i] ??= this.scene.add.image(0, 0, chestTextureKey(appearance!.color, appearance!.size, i));
      const head = { x: p.x + (i - (appearance!.size - 1) / 2) * 32, y: p.y + (farmerTop(facing, "raised") - farmerGround(facing, "raised")) * 1.05 - 8 + bob };
      const floor = motion?.event.cells[i] ?? head;
      const amount = motion ? lifting ? blend : 1 - blend : 1;
      const landing = motion && !lifting && progress > .82 ? -2 * Math.sin((progress - .82) / .18 * Math.PI) : 0;
      part.setTexture(chestTextureKey(appearance!.color, appearance!.size, i)).setDisplaySize(32, 40).setOrigin(.5, .65)
        .setPosition(floor.x + (head.x - floor.x) * amount, floor.y + (head.y - floor.y) * amount + landing)
        .setDepth(Math.max(p.y, floor.y) + 3).setVisible(true).setAlpha(p.connected ? 1 : .4);
    }
    for (let i = appearance!.size; i < view.parts.length; i++) view.parts[i]!.setVisible(false);
    view.caption.setText(motion ? lifting ? "들어올리는 중…" : "내려놓는 중…" : "")
      .setPosition(p.x, p.y - 94).setDepth(p.y + 5).setVisible(!!motion);
    label.setPosition(p.x, p.y - (motion ? 112 : 94));
    return true;
  }
  prune(ids: Set<string>): void {
    for (const [id, v] of this.views) if (!ids.has(id)) { v.parts.forEach(p => p.destroy()); v.caption.destroy(); this.views.delete(id); this.motions.delete(id); }
  }
}
