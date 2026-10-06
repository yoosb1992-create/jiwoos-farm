import { SceneTerrain } from "./world/scene-terrain.js";
import { objectVisible, nearbyObjects, objectById } from "../shared/world2.js";
import { worldNpcSchedule } from "../shared/world2-runtime.js";
import { CLIENT_MAPS } from "./layout.js";
import Phaser from "phaser";
import {
  ASSETS,
  CROPS,
  TILE,
  NPCS,
  npcSchedule,
  ITEMS,
  type Asset,
} from "../shared/content.js";
import type { FarmState } from "../shared/schema.js";
import type { NetworkSnapshot, RenderPlayer } from "./network.js";
import { frontTile } from "../shared/applyMovement.js";
import {
  calendar,
  SEASON_INFO,
  ANIMALS,
  FORAGE,
  FISHING_SPOTS,
  festivalOn,
  type Season,
} from "../shared/expansion.js";
import { createContentTextures, createGround } from "./art.js";
import { mapFor, layoutRevision } from "./layout.js";
interface View {
  body: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
}
export class FarmScene extends Phaser.Scene {
  private area = "";
  private chunkTerrain?: SceneTerrain;
  private staticRefresh = 0;
  private layoutVersion = -1;
  private season: Season = "spring";
  private atmosphere?: Phaser.GameObjects.Graphics;
  private highlight?: Phaser.GameObjects.Ellipse;
  private lastAtmosphere = 0;
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
  private resolveReady?: () => void;
  readonly ready = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });
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
    createContentTextures(this);
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
    const savedZoom = Number(
      localStorage.getItem("farm-zoom") ??
        (window.innerWidth < 600 ? 0.95 : 1.15),
    );
    this.setZoom(Number.isFinite(savedZoom) ? savedZoom : 1);
    this.atmosphere = this.add.graphics().setScrollFactor(0).setDepth(20000);
    this.highlight = this.add
      .ellipse(0, 0, 45, 20, 0xffedbb, 0.2)
      .setStrokeStyle(2, 0xfff2b8)
      .setDepth(9000);
    this.target = this.add
      .rectangle(0, 0, TILE, TILE)
      .setStrokeStyle(2, 0xfff1a4)
      .setDepth(9999);
    this.resolveReady?.();
    this.resolveReady = undefined;
    this.events.once("shutdown", () => {
      this.players.clear();
      this.objects.clear();
      this.npcs.clear();
    });
  }
  private changeArea(id: string): void {
    this.area = id;
    this.terrain?.destroy(true);
    this.chunkTerrain?.destroy();
    this.chunkTerrain = undefined;
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
    if (map.world2)
      this.chunkTerrain = new SceneTerrain(this, map, this.season);
    else
      children.push(
        this.add.image(0, 0, createGround(this, map, this.season)).setOrigin(0),
      );
    this.terrain = this.add.container(0, 0, children).setDepth(-20);
    for (const o of map.world2 ? [] : map.objects) {
      if (o.kind) continue;
      const v = this.staticObject(
        `static-${o.id}`,
        o.assetId,
        o.position.tileX * TILE,
        o.position.tileY * TILE,
        o.label ?? "",
      );
      if (o.scale) v.body.setScale(o.scale);
      if (o.assetId === "bridge") v.body.setOrigin(0.5).setDepth(-5);
    }
    for (const spot of FISHING_SPOTS.filter(
      (s) => !map.world2 && s.area === id,
    )) {
      this.staticObject(
        `static-fish-${spot.water}`,
        "item_fishing_rod",
        (spot.x + spot.w / 2) * TILE,
        (spot.y + 0.5) * TILE,
        "≈ 낚시 물가",
      ).body.setDisplaySize(22, 22);
    }
    for (const warp of map.warps) {
      const x = ((warp.area.startX + warp.area.endX + 1) / 2) * TILE,
        y = ((warp.area.startY + warp.area.endY + 1) / 2) * TILE;
      this.staticObject(
        `warp-${warp.id}`,
        "decor_board",
        x,
        y,
        `↗ ${mapFor(warp.targetMapId).name}`,
      ).body.setScale(0.48);
    }
    this.cameras.main.setBounds(0, 0, map.width * TILE, map.height * TILE);
  }
  private updateAuthoredObjects(): void {
    const map = mapFor(this.area),
      r = this.cameras.main.worldView,
      candidates = new Map<string, (typeof map.objects)[number]>();
    for (
      let y = Math.floor((r.y - 256) / 512);
      y <= Math.floor((r.bottom + 256) / 512);
      y++
    )
      for (
        let x = Math.floor((r.x - 256) / 512);
        x <= Math.floor((r.right + 256) / 512);
        x++
      )
        for (const o of nearbyObjects(map, x * 16, y * 16))
          if (!o.kind && objectVisible(o, this.season)) candidates.set(o.id, o);
    const ids = new Set<string>();
    for (const o of candidates.values()) {
      const x = o.position.tileX * TILE,
        y = o.position.tileY * TILE;
      if (
        x < r.x - 768 ||
        y < r.y - 768 ||
        x > r.right + 768 ||
        y > r.bottom + 768
      )
        continue;
      const id = `static-${o.id}`;
      ids.add(id);
      let v = this.objects.get(id);
      if (!v) v = this.staticObject(id, o.assetId, x, y, o.label ?? "");
      if (o.width && o.height)
        v.body.setDisplaySize(o.width * TILE, o.height * TILE);
      else if (o.scale) v.body.setScale(o.scale);
      v.body
        .setAngle(o.rotation ?? 0)
        .setDepth(
          o.bridge || o.layer === "Ground Decoration"
            ? -5
            : o.layer === "Upper Decoration"
              ? 20000
              : y + (o.depth ?? 0),
        );
      if (o.bridge) v.body.setOrigin(0.5);
    }
    for (const [id, v] of this.objects)
      if (id.startsWith("static-") && !ids.has(id)) {
        v.body.destroy();
        v.label.destroy();
        this.objects.delete(id);
      }
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
    body.setDepth(
      ["house", "store", "chicken_coop", "work_shed"].includes(asset)
        ? y + body.displayHeight * 0.45
        : y,
    );
    if (/tree|bush|shrub|flower_bed/.test(asset))
      body.setTint(SEASON_INFO[this.season].foliage);
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
    const season = calendar(state.day).season;
    if (
      this.area !== me.area ||
      this.season !== season ||
      this.layoutVersion !== layoutRevision
    ) {
      this.layoutVersion = layoutRevision;
      this.season = season;
      this.changeArea(me.area);
    }
    this.chunkTerrain?.update();
    if (mapFor(this.area).world2 && now - this.staticRefresh > 100) {
      this.staticRefresh = now;
      this.updateAuthoredObjects();
    }
    if (now - this.lastAtmosphere > 50) {
      this.lastAtmosphere = now;
      this.drawAtmosphere(now, state);
    }
    const present = new Set<string>();
    for (const p of snapshot.players) {
      present.add(p.id);
      let v = this.players.get(p.id);
      if (!v) {
        const body = this.add
          .sprite(p.x, p.y, "player")
          .setOrigin(0.5, 70 / 72)
          .setScale(1.05);
        const label = this.add
          .text(p.x, p.y - 54, p.nickname, {
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
      v.label.setPosition(p.x, p.y - 54).setDepth(p.y + 1);
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
      const authored = objectById(mapFor(me.area), id);
      if (authored && !objectVisible(authored, this.season)) return;
      const viewport = this.cameras.main.worldView;
      if (
        mapFor(me.area).world2 &&
        (e.x < viewport.x - 768 ||
          e.y < viewport.y - 768 ||
          e.x > viewport.right + 768 ||
          e.y > viewport.bottom + 768)
      )
        return;
      ids.add(id);
      let asset = e.asset,
        label = "";
      if (e.kind === "crop") {
        asset = `crop_${e.crop}_${e.stage === 0 ? "seed" : e.stage >= (CROPS[e.crop]?.growthDays ?? 3) ? "mature" : e.stage === 1 ? "sprout" : "growing"}`;
        label = e.watered ? "💧" : "";
      } else if (e.kind === "withered") {
        asset = "crop_morningcarrot_growing";
        label = "마른 작물 · 괭이";
      } else if (e.kind === "drop") {
        asset = ITEMS[e.item]?.assetId ?? "item_wood";
        label = `×${e.quantity}`;
      } else if (e.kind === "soil") asset = "tile_farm_empty";
      else if (e.kind === "tree" || e.kind === "rock" || e.kind === "stump")
        label = Math.hypot(e.x - me.x, e.y - me.y) < 80 ? `${e.hp}타` : "";
      else if (e.kind === "chest") label = "공유 보관함";
      else if (e.kind === "craft") label = "제작대";
      else if (e.kind === "machine") label = e.readyAt ? "가공 중" : "가공기";
      else if (e.kind === "animal") {
        const d = ANIMALS[e.crop as keyof typeof ANIMALS];
        label = `${d?.icon ?? ""} ${e.quantity > 0 ? "선물 있어요" : e.stage === state.day ? "배불러요" : "먹이 주세요"}`;
      } else if (e.kind === "barn") label = "우리 · 동물 구입";
      else if (e.kind === "trough") label = "동물 가까이에서 돌봐요";
      else if (e.kind === "board")
        label = festivalOn(state.day)?.name ?? "마을 게시판";
      else if (e.kind === "decoration")
        label = Math.hypot(e.x - me.x, e.y - me.y) < 60 ? "정원 장식" : "";
      let v = this.objects.get(id);
      if (!v) v = this.staticObject(id, asset, e.x, e.y, label);
      v.body
        .setTexture(this.textured(asset))
        .setDepth(e.kind === "crop" || e.kind === "soil" ? e.y - 100 : e.y);
      if (authored) {
        if (authored.width && authored.height)
          v.body.setDisplaySize(authored.width * TILE, authored.height * TILE);
        else if (authored.tree)
          v.body.setScale(
            (ASSETS[asset]?.displayScale?.x ?? 1) *
              ([0.3, 0.55, 1, 1.3, 1.6][authored.tree.stage] ?? 1),
          );
        v.body
          .setAngle(authored.rotation ?? 0)
          .setDepth(e.y + (authored.depth ?? 0));
      }
      v.body.clearTint();
      if (/tree|bush|shrub/.test(asset))
        v.body.setTint(SEASON_INFO[this.season].foliage);
      if (e.kind === "withered") v.body.setTint(0x8d765d);
      const forage = FORAGE.find((f) => f.id === e.item);
      if (forage && (e.kind === "gather" || e.kind === "drop"))
        v.body.setTint(forage.color);
      if (e.kind === "soil") v.body.setOrigin(0.5);
      if (e.kind === "crop")
        v.body.setOrigin(0.5, 0.8).setTint(e.watered ? 0xffffff : 0xefefce);
      if (e.kind === "animal") {
        v.body.setPosition(
          e.x + Math.sin(now / 1200 + e.x) * 5,
          e.y + Math.sin(now / 1600 + e.y) * 2,
        );
        v.body.setFlipX(Math.cos(now / 3000 + e.x) < 0);
      }
      v.label.setPosition(e.x, e.y + 12).setDepth(e.y + 2);
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
      const s = worldNpcSchedule(npc, state.day, state.minute, CLIENT_MAPS);
      let v = this.npcs.get(npc.id);
      if (!v) {
        const body = this.add
          .sprite(0, 0, `npc-${npc.id}`)
          .setOrigin(0.5, 0.9)
          .setScale(1.25)
          .setTint(
            [0xffffff, 0xffe4c5, 0xdcebea, 0xd8dbf3][NPCS.indexOf(npc) % 4]!,
          );
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
      v.x = s.from.x * TILE;
      v.y = s.from.y * TILE;
      v.body
        .setVisible(s.mapId === me.area)
        .setPosition(s.from.x * TILE, s.from.y * TILE)
        .setDepth(s.from.y * TILE);
      v.label
        .setVisible(s.mapId === me.area)
        .setPosition(s.from.x * TILE, s.from.y * TILE - 44)
        .setDepth(s.from.y * TILE + 1);
    }
  }
  private drawAtmosphere(now: number, state: FarmState): void {
    const g = this.atmosphere;
    if (!g) return;
    const { width: w, height: h } = this.scale;
    // Screen-space weather must still cover the viewport after camera pinch zoom.
    const zoom = this.cameras.main.zoom;
    g.setPosition((w - w / zoom) / 2, (h - h / zoom) / 2).setScale(1 / zoom);
    g.clear();
    const indoors = ["farmhouse", "general_store", "cafe", "workshop"].includes(
        this.area,
      ),
      mine = this.area.startsWith("mine");
    const night =
      state.minute >= 1140
        ? Math.min(0.32, (state.minute - 1140) / 800)
        : state.minute < 420
          ? 0.08
          : 0;
    g.fillStyle(mine ? 0x283043 : 0x263653, mine ? 0.18 : night);
    g.fillRect(0, 0, w, h);
    if (!indoors && !mine)
      for (let i = 0; i < 32; i++) {
        const x = (i * 137 + Math.sin(now / 2200 + i) * 24 + w) % w;
        const y =
          (i * 73 + now * (state.weather === "rain" ? 0.35 : 0.035)) % h;
        if (state.weather === "rain") {
          g.lineStyle(1, 0xd2e9ee, 0.4);
          g.lineBetween(x, y, x - 4, y + 13);
        } else if (state.weather === "snow" || this.season === "winter") {
          g.fillStyle(0xffffff, 0.55);
          g.fillCircle(x, y, (i % 2) + 1);
        } else if (this.season === "spring" && i < 12) {
          g.fillStyle(0xffd2df, 0.55);
          g.fillEllipse(x, y, 4, 2);
        } else if (this.season === "autumn" && i < 12) {
          g.fillStyle(0xe2a15b, 0.5);
          g.fillEllipse(x, y, 5, 2);
        }
      }
    if (festivalOn(state.day) && this.area === "town")
      for (let i = 0; i < 14; i++) {
        g.fillStyle(0xffdb8f, 0.18 + Math.sin(now / 900 + i) * 0.08);
        g.fillCircle((i * 79) % w, 70 + Math.sin(i) * 24, 8);
      }
    const near =
      this.me &&
      [...state.entities.values()]
        .filter(
          (e) =>
            e.area === this.area &&
            Math.hypot(e.x - this.me!.x, e.y - this.me!.y) < 66,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - this.me!.x, a.y - this.me!.y) -
            Math.hypot(b.x - this.me!.x, b.y - this.me!.y),
        )[0];
    this.highlight?.setVisible(Boolean(near));
    if (near) this.highlight?.setPosition(near.x, near.y);
  }
  transition(effect = "fade"): void {
    if (effect !== "instant") this.cameras.main.fadeIn(240, 30, 48, 39);
  }
  setZoom(value: number): void {
    this.cameras.main?.setZoom(Phaser.Math.Clamp(value, 0.65, 2));
  }
  screenPoint(x: number, y: number): { x: number; y: number } {
    const c = this.cameras.main,
      a = c.getWorldPoint(0, 0),
      b = c.getWorldPoint(1, 1),
      r = this.game.canvas.getBoundingClientRect();
    return {
      x: (x - a.x) / (b.x - a.x) + r.left,
      y: (y - a.y) / (b.y - a.y) + r.top,
    };
  }
  pickWorld(
    x: number,
    y: number,
  ): {
    x: number;
    y: number;
    entityId?: string;
    npcId?: string;
    warpId?: string;
    shop?: boolean;
  } {
    const p = this.worldPoint(x, y);
    const npc = [...this.npcs.entries()]
      .sort((a, b) => b[1].y - a[1].y)
      .find(([, v]) => v.body.getBounds().contains(p.x, p.y));
    if (npc) return { ...p, npcId: npc[0] };
    const hit = [...this.objects.entries()]
      .sort((a, b) => b[1].y - a[1].y)
      .find(([, v]) => v.body.getBounds().contains(p.x, p.y));
    if (hit) {
      const [id, v] = hit;
      if (id.startsWith("warp-")) return { ...p, warpId: id.slice(5) };
      if (!id.startsWith("static-")) return { ...p, entityId: id };
      const object = mapFor(this.area).objects.find(
        (o) => `static-${o.id}` === id,
      );
      if (object?.assetId === "shop_counter")
        return { x: v.x, y: v.y, shop: true };
      if (
        !object ||
        !/house|store|shed|cafe|workshop|door/.test(object.assetId)
      )
        return p;
      const warp = mapFor(this.area)
        .warps.slice()
        .sort(
          (a, b) =>
            Math.hypot(
              (a.area.startX + a.area.endX + 1) * 16 - v.x,
              (a.area.startY + a.area.endY + 1) * 16 - v.y,
            ) -
            Math.hypot(
              (b.area.startX + b.area.endX + 1) * 16 - v.x,
              (b.area.startY + b.area.endY + 1) * 16 - v.y,
            ),
        )[0];
      if (
        warp &&
        Math.hypot(
          (warp.area.startX + warp.area.endX + 1) * 16 - v.x,
          (warp.area.startY + warp.area.endY + 1) * 16 - v.y,
        ) < 170
      )
        return { ...p, warpId: warp.id };
    }
    return p;
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
