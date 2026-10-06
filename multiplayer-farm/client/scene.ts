import Phaser from "phaser";
import {
  ASSETS,
  CROPS,
  MAPS,
  mapFor,
  TILE,
  NPCS,
  ITEMS,
  type Asset,
} from "../shared/content.js";
import type { FarmState } from "../shared/schema.js";
import type { NetworkSnapshot, RenderPlayer } from "./network.js";
import { frontTile } from "../shared/applyMovement.js";
interface View {
  body: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
}
export class FarmScene extends Phaser.Scene {
  private area = "";
  private terrain?: Phaser.GameObjects.Container;
  private players = new Map<string, View>();
  private objects = new Map<string, View>();
  private npcs = new Map<string, View>();
  private target?: Phaser.GameObjects.Rectangle;
  private me?: RenderPlayer;
  constructor(
    private readonly onFrame: (
      now: number,
      delta: number,
    ) => { snapshot: NetworkSnapshot; state?: FarmState },
  ) {
    super("Farm");
  }
  preload(): void {
    for (const [id, asset] of Object.entries(ASSETS)) {
      if (!asset.source) continue;
      const s = asset.source;
      if (s.kind === "spritesheet" && s.frameWidth && s.frameHeight)
        this.load.spritesheet(id, s.path, {
          frameWidth: s.frameWidth,
          frameHeight: s.frameHeight,
        });
      else this.load.image(id, s.path);
    }
    for (const npc of NPCS)
      this.load.spritesheet(`npc-${npc.id}`, npc.asset.source.path, {
        frameWidth: 32,
        frameHeight: 36,
      });
  }
  create(): void {
    const directions = ["down", "up", "left", "right"];
    for (const [state, offset] of [
      ["idle", 0],
      ["walk", 16],
      ["tool", 32],
    ] as const)
      directions.forEach((direction, i) => {
        this.anims.create({
          key: `${state}_${direction}`,
          frames: this.anims.generateFrameNumbers("player", {
            start: offset + i * 4,
            end: offset + i * 4 + 3,
          }),
          frameRate: state === "idle" ? 2 : state === "walk" ? 10 : 12,
          repeat: -1,
        });
      });
    this.cameras.main.setZoom(1.15);
    this.target = this.add
      .rectangle(0, 0, TILE, TILE)
      .setStrokeStyle(2, 0xfff1a4)
      .setDepth(9999);
    this.events.once("shutdown", () => {
      this.players.clear();
      this.objects.clear();
      this.npcs.clear();
    });
  }
  private changeArea(id: string): void {
    this.area = id;
    this.terrain?.destroy(true);
    for (const v of this.objects.values()) {
      v.body.destroy();
      v.label.destroy();
    }
    this.objects.clear();
    for (const v of this.npcs.values()) {
      v.body.destroy();
      v.label.destroy();
    }
    this.npcs.clear();
    const map = mapFor(id);
    const children: Phaser.GameObjects.GameObject[] = [];
    const bg = this.add
      .tileSprite(
        0,
        0,
        map.width * TILE,
        map.height * TILE,
        this.textured(`tile_${map.baseTileType}`),
      )
      .setOrigin(0)
      .setDepth(-10);
    children.push(bg);
    const g = this.add.graphics().setDepth(-9);
    children.push(g);
    for (const r of [
      ...map.terrainRegions,
      ...map.farmAreas.map((r) => ({ ...r, tileType: "farm" })),
    ]) {
      g.fillStyle(
        r.tileType === "water"
          ? 0x73bace
          : r.tileType === "farm"
            ? 0xad8255
            : r.tileType === "stone_floor"
              ? 0xd2c2a4
              : 0xcbb687,
      );
      g.fillRect(
        r.startX * TILE,
        r.startY * TILE,
        (r.endX - r.startX + 1) * TILE,
        (r.endY - r.startY + 1) * TILE,
      );
    }
    this.terrain = this.add.container(0, 0, children).setDepth(-20);
    for (const o of map.objects) {
      if (o.assetId.startsWith("tree")) continue;
      this.staticObject(
        `static-${o.id}`,
        o.assetId,
        o.position.tileX * TILE,
        o.position.tileY * TILE,
        o.label ?? "",
      );
    }
    for (const warp of map.warps) {
      const x = ((warp.area.startX + warp.area.endX + 1) / 2) * TILE,
        y = ((warp.area.startY + warp.area.endY + 1) / 2) * TILE;
      this.staticObject(
        `warp-${warp.id}`,
        "mine_ladder",
        x,
        y,
        `↗ ${mapFor(warp.targetMapId).name}`,
      );
    }
    this.cameras.main.setBounds(0, 0, map.width * TILE, map.height * TILE);
  }
  private textured(id: string): string {
    return this.textures.exists(id) ? id : "__WHITE";
  }
  private staticObject(
    id: string,
    asset: string,
    x: number,
    y: number,
    label: string,
  ): View {
    const a = ASSETS[asset];
    const body = this.add.sprite(x, y, this.textured(asset));
    if (a?.origin) body.setOrigin(a.origin.x, a.origin.y);
    else body.setOrigin(0.5, 0.8);
    if (a?.displayScale) body.setScale(a.displayScale.x, a.displayScale.y);
    body.setDepth(y);
    const text = this.add
      .text(x, y + 10, label, {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#203b26",
        backgroundColor: "#fff6d9c0",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(y + 1);
    text.setVisible(Boolean(label));
    const v = { body, label: text, x, y };
    this.objects.set(id, v);
    return v;
  }
  update(now: number, delta: number): void {
    const { snapshot, state } = this.onFrame(now, delta);
    const me = snapshot.players.find((p) => p.local);
    this.me = me;
    if (!me || !state) return;
    if (this.area !== me.area) this.changeArea(me.area);
    const present = new Set<string>();
    for (const p of snapshot.players) {
      present.add(p.id);
      let v = this.players.get(p.id);
      if (!v) {
        const body = this.add
          .sprite(p.x, p.y, "player")
          .setOrigin(0.5, 70 / 72);
        const label = this.add
          .text(p.x, p.y - 65, p.nickname, {
            fontSize: "12px",
            color: p.color,
            backgroundColor: "#162e27d9",
            padding: { x: 4, y: 2 },
          })
          .setOrigin(0.5);
        v = { body, label, x: p.x, y: p.y };
        this.players.set(p.id, v);
      }
      const visible = p.area === me.area;
      v.body.setVisible(visible).setAlpha(p.connected ? 1 : 0.4);
      v.label.setVisible(visible);
      if (!visible) continue;
      const moved = Math.hypot(p.x - v.x, p.y - v.y) > 0.05;
      const dx = p.x - v.x,
        dy = p.y - v.y;
      const facing = moved
        ? Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "down"
            : "up"
        : p.facing;
      v.body
        .setPosition(p.x, p.y)
        .setDepth(p.y)
        .play(
          `${p.actionTicks > 0 ? "tool" : moved ? "walk" : "idle"}_${facing}`,
          true,
        );
      v.label.setPosition(p.x, p.y - 67).setDepth(p.y + 1);
      v.x = p.x;
      v.y = p.y;
      if (p.local) {
        this.cameras.main.startFollow(v.body, true, 0.2, 0.2);
        const t = frontTile({ ...p, facing });
        this.target?.setPosition(
          (t.tileX + 0.5) * TILE,
          (t.tileY + 0.5) * TILE,
        );
      }
    }
    for (const [id, v] of this.players)
      if (!present.has(id)) {
        v.body.destroy();
        v.label.destroy();
        this.players.delete(id);
      }
    const ids = new Set<string>();
    state.entities.forEach((e, id) => {
      if (e.area !== me.area) return;
      ids.add(id);
      let asset = e.asset,
        label = "";
      if (e.kind === "crop") {
        asset = `crop_${e.crop}_${e.stage === 0 ? "seed" : e.stage >= (CROPS[e.crop]?.growthDays ?? 3) ? "mature" : e.stage === 1 ? "sprout" : "growing"}`;
        label = e.watered ? "💧" : "";
      } else if (e.kind === "drop") {
        asset = ITEMS[e.item]?.assetId ?? "item_wood";
        label = `×${e.quantity}`;
      } else if (e.kind === "soil") asset = "tile_farm_empty";
      else if (e.kind === "tree" || e.kind === "rock" || e.kind === "stump")
        label = `${e.hp}`;
      else if (e.kind === "chest") label = "공유 보관함";
      else if (e.kind === "craft") label = "제작대";
      else if (e.kind === "machine") label = e.readyAt ? "가공 중" : "가공기";
      let v = this.objects.get(id);
      if (!v) v = this.staticObject(id, asset, e.x, e.y, label);
      v.body
        .setTexture(this.textured(asset))
        .setDepth(e.kind === "crop" || e.kind === "soil" ? e.y - 100 : e.y);
      if (e.kind === "crop" || e.kind === "soil") v.body.setOrigin(0.5);
      if (e.kind === "drop") v.body.setDisplaySize(22, 22).setOrigin(0.5);
      v.label.setText(label).setVisible(Boolean(label));
    });
    for (const [id, v] of this.objects)
      if (
        !id.startsWith("static-") &&
        !id.startsWith("warp-") &&
        !ids.has(id)
      ) {
        v.body.destroy();
        v.label.destroy();
        this.objects.delete(id);
      }
    for (const npc of NPCS) {
      const s =
        [...npc.schedule].reverse().find((s) => s.minute <= state.minute) ??
        npc.schedule[0]!;
      let v = this.npcs.get(npc.id);
      if (!v) {
        const body = this.add.sprite(0, 0, `npc-${npc.id}`).setOrigin(0.5, 0.9);
        const label = this.add
          .text(0, 0, npc.name, {
            fontSize: "12px",
            color: "#fff4c5",
            backgroundColor: "#4b6344",
          })
          .setOrigin(0.5);
        v = { body, label, x: 0, y: 0 };
        this.npcs.set(npc.id, v);
      }
      v.body
        .setVisible(s.mapId === me.area)
        .setPosition(s.from.x * TILE, s.from.y * TILE)
        .setDepth(s.from.y * TILE);
      v.label
        .setVisible(s.mapId === me.area)
        .setPosition(s.from.x * TILE, s.from.y * TILE - 34)
        .setDepth(s.from.y * TILE + 1);
    }
  }
  worldPoint(x: number, y: number): { x: number; y: number } {
    const bounds = this.game.canvas.getBoundingClientRect();
    const p = this.cameras.main.getWorldPoint(
      ((x - bounds.left) * this.scale.width) / bounds.width,
      ((y - bounds.top) * this.scale.height) / bounds.height,
    );
    return { x: p.x, y: p.y };
  }
  zoomBy(factor: number): void {
    this.cameras.main.setZoom(
      Phaser.Math.Clamp(this.cameras.main.zoom * factor, 0.65, 2.5),
    );
  }
}
export function createRenderer(
  onFrame: ConstructorParameters<typeof FarmScene>[0],
): { game: Phaser.Game; scene: FarmScene } {
  const scene = new FarmScene(onFrame);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "arena",
    width: window.innerWidth,
    height: window.innerHeight,
    banner: false,
    pixelArt: true,
    backgroundColor: "#7fa765",
    scale: { mode: Phaser.Scale.RESIZE },
    input: { keyboard: false, mouse: false, touch: false },
    fps: { target: 60, smoothStep: false },
    scene,
  });
  return { game, scene };
}
