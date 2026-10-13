import { appearanceTexture, characterScale } from "./character-art.js";
import { FurnitureAnimation } from "./furniture-animation.js";
import type { TransportFx } from "../shared/transport.js";
import type { PlacementHint } from "./placement-preview.js";
import { treeSprite, inferSpecies, treeSeasonScale, treeRootSprite, TREE_STAGES, stumpSprite } from "../shared/nature.js";
import { SceneTerrain } from "./world/scene-terrain.js";
import { TERRAIN_ART, visualSize, foliageColor } from "../shared/art-assets.js";
import { installMaterial } from "./world/painted-materials.js";
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
import { createContentTextures, createItemTextures, createGround } from "./art.js";
import { mapFor, layoutRevision } from "./layout.js";
import { FarmFeedback } from "./feedback.js";
import type { ActionFx } from "../shared/interaction.js";
import type { Sound } from "./audio.js";
import { createFarmerFrames, createCarryFrames } from "./tool-animation-art.js";
import { rockMaxHp } from "../shared/resources.js";
import { getSunState, seedGlowVisibility, type SunState } from "../shared/sunlight.js";
import { atmosphereLight, groundShadow, lightEnvironment, objectSunTint, receivesSunlight } from "./solar-lighting.js";
import { paintNightVeil, sceneryLight, type WorldLight } from "./night-lighting.js";
import { chestTextureKey } from "./chest-art.js";
import { TilledGroundIndex, paintTilledGround } from "./tilled-ground.js";
interface View {
  kind?: string;
  body: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  /** Tilled-soil underlay kept beneath crops so planting never replaces the soil. */
  ground?: Phaser.GameObjects.Sprite;
  seedGlow?: Phaser.GameObjects.Sprite;
  roots?: Phaser.GameObjects.Sprite;
  baseTint?: number;
  x: number;
  y: number;
}
export class FarmScene extends Phaser.Scene {
  private tilledGround = new TilledGroundIndex();
  private soilTexture(mask: number): string {
    const key = `connected-soil-${mask}`;
    if (!this.textures.exists(key)) {
      const texture = this.textures.createCanvas(key,32,32)!;
      paintTilledGround(texture.context,mask); texture.refresh();
    }
    return key;
  }
  private placementMarks?: Phaser.GameObjects.Graphics;
  private placementLabels: Phaser.GameObjects.Text[] = [];
  setPlacementHints(hints: PlacementHint[]): void {
    if (!this.add || !this.sys.isActive()) return;
    this.placementMarks ??= this.add.graphics().setDepth(8998);
    this.placementMarks.clear();
    this.placementLabels.forEach(label => label.setVisible(false));
    let index = 0;
    for (const hint of hints) for (const p of hint.cells) {
      const color = hint.error ? 0xc75950 : 0x79b468;
      this.placementMarks.fillStyle(color, .28).fillRect(p.x - 15, p.y - 15, 30, 30);
      this.placementMarks.lineStyle(2, color, .9).strokeRect(p.x - 15, p.y - 15, 30, 30);
      const label = this.placementLabels[index] ??= this.add.text(0, 0, "", { fontSize: "16px", color: "#ffffff", stroke: "#344c39", strokeThickness: 2 }).setOrigin(.5).setDepth(8999);
      label.setText(hint.error ? "×" : "✓").setPosition(p.x, p.y).setVisible(true); index++;
    }
    this.target?.setVisible(!hints.length);
  }
  placementFeedback(): void {
    if (!this.placementMarks) return;
    this.tweens.add({ targets: this.placementMarks, alpha: .35, duration: 140, yoyo: true, onComplete: () => { this.placementMarks?.setAlpha(1).clear(); } });
    this.placementLabels.forEach(label => label.setVisible(false));
  }
  private area = "";
  private chunkTerrain?: SceneTerrain;
  private staticRefresh = 0;
  private layoutVersion = -1;
  private season: Season = "spring";
  private atmosphere?: Phaser.GameObjects.Graphics;
  private daylightWash?: Phaser.GameObjects.Graphics;
  private nightVeil?: Phaser.GameObjects.Image;
  private nightTexture?: Phaser.Textures.CanvasTexture;
  private highlight?: Phaser.GameObjects.Ellipse;
  private lastAtmosphere = 0;
  private sunlight: SunState = getSunState({ day: 1, minute: 360 });
  private sunlightKey = "";
  private sunTints = new Map<string, [number, number, number, number]>();
  private sunShadows?: Phaser.GameObjects.Graphics;
  private lastSunShadows = -Infinity;
  private shadowSignature = "";
  private terrain?: Phaser.GameObjects.Container;
  private players = new Map<string, View>();
  private objects = new Map<string, View>();
  private npcs = new Map<string, View>();
  private target?: Phaser.GameObjects.Rectangle;
  private me?: RenderPlayer;
  private feedback?: FarmFeedback;
  private furniture?: FurnitureAnimation;
  transportFeedback(event: TransportFx): void { this.furniture?.event(event); }
  onSound?: (sound: Sound) => void;
  actionFeedback(event: ActionFx): void { this.feedback?.event(event,this.area,this.season); }
  actionBusy(id:string):boolean { return (this.feedback?.busy(id) ?? false) || (this.furniture?.busy(id) ?? false); }
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
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      const fallback = ASSETS[file.key]?.source?.fallbackPath;
      if (fallback) this.load.image(`art-fallback-${file.key}`, fallback);
    });
    for (const [id, path] of Object.entries(TERRAIN_ART))
      this.load.image(`terrain-art-${id}`, path);
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
    for (const id of Object.keys(ASSETS))
      if (!this.textures.exists(id) && this.textures.exists(`art-fallback-${id}`))
        this.textures.renameTexture(`art-fallback-${id}`, id);
    for (const id of Object.keys(TERRAIN_ART)) {
      const key = `terrain-art-${id}`;
      if (this.textures.exists(key)) installMaterial(id, this.textures.get(key).getSourceImage() as HTMLImageElement);
    }
    // Painted environments use linear sampling; keep legacy animated pixel actors crisp.
    for (const id of ["player", ...NPCS.map(n => `npc-${n.id}`)])
      if (this.textures.exists(id)) this.textures.get(id).setFilter(Phaser.Textures.FilterMode.NEAREST);
    createContentTextures(this);
    createItemTextures(this);
    createFarmerFrames(this);
    createCarryFrames(this);
    this.furniture = new FurnitureAnimation(this);
    this.feedback = new FarmFeedback(this, sound=>this.onSound?.(sound), id=>this.objects.get(id));
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
    this.daylightWash = this.add.graphics().setScrollFactor(0).setDepth(19990).setBlendMode(Phaser.BlendModes.SCREEN);
    this.nightTexture = this.textures.createCanvas("farm-night-veil",2,2)!;
    this.nightVeil = this.add.image(0,0,"farm-night-veil").setOrigin(0).setScrollFactor(0).setDepth(20000);
    this.atmosphere = this.add.graphics().setScrollFactor(0).setDepth(20001);
    // World-space ground layer: pinch/pan cannot reverse the east/west light.
    this.sunShadows = this.add.graphics().setDepth(-4);
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
      this.nightVeil?.destroy();this.nightVeil=undefined;
      this.textures.remove("farm-night-veil");this.nightTexture=undefined;
      this.feedback?.destroy();
      this.players.clear();
      this.objects.clear();
      this.npcs.clear();
    });
  }
  private changeArea(id: string): void {
    this.feedback?.clear();
    this.area = id;
    this.sunShadows?.clear();
    this.lastSunShadows = -Infinity;
    this.shadowSignature = "";
    this.terrain?.destroy(true);
    this.chunkTerrain?.destroy();
    this.chunkTerrain = undefined;
    for (const v of this.objects.values()) {
      v.ground?.destroy();
      v.seedGlow?.destroy();
      v.roots?.destroy();
      v.body.destroy();
      v.label.destroy();
    }
    this.objects.clear();
    for (const v of this.npcs.values()) {
      v.ground?.destroy();
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
      if (o.scale) this.sizeObject(v.body, o.assetId, o.scale);
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
      const marker = this.staticObject(
        `warp-${warp.id}`,
        "decor_board",
        x,
        y,
        `↗ ${mapFor(warp.targetMapId).name}`,
      );
      this.sizeObject(marker.body, "decor_board", .48);
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
      const art=o.tree?.stump ? stumpSprite(o.tree.species,o.tree.stage,o.assetId) : o.assetId.includes("_stump_") ? o.assetId : o.assetId.startsWith("tree") ? treeSprite(inferSpecies(o.tree?.species||o.assetId),o.tree?.stage??2,this.season) : o.assetId;
      if (!v) v = this.staticObject(id, art, x, y, o.label ?? "");
      else if(v.body.texture.key!==art) {v.body.setTexture(this.textured(art));this.sizeObject(v.body,art,o.scale);}
      if (o.width && o.height)
        v.body.setDisplaySize(o.width * TILE, o.height * TILE);
      else if (o.scale) this.sizeObject(v.body, art, o.scale);
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
    return this.textures.exists(id) ? id : "item-missing";
  }
  private sizeObject(body: Phaser.GameObjects.Sprite, id: string, scale?: number) {
    const a = ASSETS[id];
    if (a?.frameSize) {
      const size = visualSize(a, scale);
      body.setDisplaySize(size.width, size.height);
    } else body.setScale(scale ?? 1);
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
    this.sizeObject(body, asset);
    body.setDepth(
      ["house", "store", "chicken_coop", "work_shed"].includes(asset)
        ? y + body.displayHeight * 0.45
        : y,
    );
    body.setTint(foliageColor(asset, this.season));
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
    const sunKey = `${state.day}:${state.minute}`;
    if (sunKey !== this.sunlightKey) {
      this.sunlightKey = sunKey;
      this.sunlight = getSunState({ day: state.day, minute: state.minute });
      this.sunTints.clear();
    }
    const seedLight = seedGlowVisibility(this.sunlight.sunlightIntensity);
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
      if (!visible) { this.furniture?.update(p, v.body, v.label, now, me.area); continue; }
      const moved = Math.hypot(p.x - v.x, p.y - v.y) > 0.05;
      const action = this.feedback?.acting(p.id,now);
      const dx = p.x - v.x,
        dy = p.y - v.y;
      const facing = action?.facing ?? (moved
        ? Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "down"
            : "up"
        : p.facing);
      v.body
        .setPosition(p.x, p.y)
        .setDepth(p.y)
        .setAngle(0)
        .setAlpha((p.connected?1:.4)*(1-(action?.blend??0)));
      const texture=appearanceTexture(this,"player",p.appearance),scale=characterScale(p.appearance);
      const walking=!action&&p.actionTicks===0&&moved;
      const frame=(walking?16:0)+["down","up","left","right"].indexOf(facing)*4+
        (action?0:Math.floor(now/(walking?(p.running?70:100):500))%4);
      v.body.anims.stop();
      v.body.setTexture(texture,frame).setOrigin(.5,70/72).setScale(scale.x,scale.y);
      v.label.setPosition(p.x, p.y - 54*scale.y/1.05).setDepth(p.y + 1);
      this.furniture?.update(p, v.body, v.label, now, me.area);
      // Names are orientation aids; they remain readable above world darkness.
      v.label.setDepth(20003);
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
    this.furniture?.prune(present);
    this.tilledGround.sync(state.entities, state.revision);
    const ids = new Set<string>();
    state.entities.forEach((e, id) => {
      if (e.area !== me.area || this.furniture?.hiddenFloor(id, now)) return;
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
      if(e.kind === "tree") { asset=treeSprite(e.species || inferSpecies(e.asset,e.id),e.stage,this.season); label=Math.hypot(e.x-me.x,e.y-me.y)<80 ? `${TREE_STAGES[e.stage]} · ${e.hp}타` : ""; }
      else if(e.kind === "stump") { asset=stumpSprite(e.species,e.stage,e.asset); label=Math.hypot(e.x-me.x,e.y-me.y)<80 ? `${e.hp}타` : ""; }
      else if (e.kind === "crop") {
        asset = `crop_${e.crop}_${e.stage === 0 ? "seed" : e.stage >= (CROPS[e.crop]?.growthDays ?? 3) ? "mature" : e.stage === 1 ? "sprout" : "growing"}`;
      } else if (e.kind === "withered") {
        asset = "crop_morningcarrot_growing";
        label = "마른 작물 · 괭이";
      } else if (e.kind === "drop") {
        asset = `drop-icon-${e.item}`;
        label = `×${e.quantity}`;
      } else if (e.kind === "soil") asset = this.soilTexture(this.tilledGround.mask(e));
      else if (e.kind === "tree" || e.kind === "rock" || e.kind === "stump")
        label = Math.hypot(e.x - me.x, e.y - me.y) < 80 ? `${e.hp}타` : "";
      else if (e.kind === "chest") {
        asset = chestTextureKey(e.chestColor, e.chestSize, e.chestIndex);
        if (e.chestIndex === Math.floor((e.chestSize - 1) / 2)) label = e.chestName || "작은 보관함";
      }
      else if (e.kind === "craft") label = "제작대";
      else if (e.kind === "bed") label = Math.hypot(e.x - me.x, e.y - me.y) <= 80 ? "침대 · 행동으로 잠자기" : "침대";
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
      v.kind=e.kind;
      const changedTexture = v.body.texture.key !== asset;
      v.body
        .setPosition(e.x,e.y)
        .setAngle(authored?.rotation??0)
        .setVisible(!this.feedback?.hiddenObject(id,now))
        .setTexture(this.textured(asset))
        .setDepth(e.kind === "crop" || e.kind === "soil" ? e.y - 100 : e.y);
      if (changedTexture) { this.sizeObject(v.body, asset); const origin=ASSETS[asset]?.origin; if(origin)v.body.setOrigin(origin.x,origin.y); }
      if(e.kind === "tree") this.sizeObject(v.body,asset,(authored?.scale??1)*treeSeasonScale(e.species||inferSpecies(e.asset,e.id),e.stage,this.season));
      if(e.kind === "stump") this.sizeObject(v.body,asset,authored?.scale??1);
      const roots = e.kind === "tree" ? treeRootSprite(e.species||inferSpecies(e.asset,e.id),e.stage,this.season) : undefined;
      if (roots) {
        const key=`roots-${roots}`;
        if(!this.textures.exists(key)) {
          const source=this.textures.get(roots).getSourceImage() as HTMLImageElement;
          const texture=this.textures.createCanvas(key,source.width,source.height)!;
          const ctx=texture.context, fade=ctx.createLinearGradient(0,0,0,source.height);
          ctx.drawImage(source,0,0);
          fade.addColorStop(0,"transparent");fade.addColorStop(.78,"transparent");
          fade.addColorStop(.9,"black");fade.addColorStop(1,"black");
          ctx.globalCompositeOperation="destination-in";ctx.fillStyle=fade;
          ctx.fillRect(0,0,source.width,source.height);texture.refresh();
        }
        v.roots ??= this.add.sprite(e.x,e.y,key);
        v.roots.setTexture(key).setPosition(e.x,e.y)
          .setVisible(!this.feedback?.hiddenObject(id,now))
          .setOrigin(.5,.94).setAngle(authored?.rotation??0).setDepth(e.y+(authored?.depth??0)+.1);
        this.sizeObject(v.roots,roots,authored?.scale??1);
      } else if (v.roots) {v.roots.destroy();v.roots=undefined;}
      if (authored) {
        if (e.kind!=="tree" && e.kind!=="stump" && authored.width && authored.height)
          v.body.setDisplaySize(authored.width * TILE, authored.height * TILE);
        v.body
          .setAngle(authored.rotation ?? 0)
          .setDepth(e.y + (authored.depth ?? 0));
      }
      const needsTilledGround = e.kind === "crop" || e.kind === "withered";
      if (needsTilledGround) {
        if (!v.ground) {
          v.ground = this.add
            .sprite(e.x, e.y, this.soilTexture(this.tilledGround.mask(e)))
            .setOrigin(0.5)
            .setDepth(e.y - 110);
          v.ground.setDisplaySize(TILE,TILE);
        }
        v.ground
          .setPosition(e.x, e.y)
          .setTexture(this.soilTexture(this.tilledGround.mask(e)))
          .setDepth(e.y - 110)
          .setTint(this.feedback?.watered(id,e.watered,now) ? 0xa07a62 : 0xffffff);
      } else if (v.ground) {
        v.ground.destroy();
        v.ground = undefined;
      }
      v.body.clearTint();
      v.body.setTint(foliageColor(asset, this.season));
      if (e.kind === "chest") v.body.setDisplaySize(TILE, 40).setOrigin(.5, .65).setAngle(0).clearTint();
      if (e.kind === "withered") v.body.setTint(0x8d765d);
      const forage = FORAGE.find((f) => f.id === e.item);
      if (forage && (e.kind === "gather" || e.kind === "drop"))
        v.body.setTint(forage.color);
      if (e.kind === "soil")
        v.body.setDisplaySize(TILE,TILE).setOrigin(0.5).setTint(this.feedback?.watered(id,e.watered,now) ? 0xa07a62 : 0xffffff);
      if (e.kind === "crop")
        // Water is shown on the tilled soil beneath the plant, not by tinting the crop.
        v.body.setOrigin(0.5, 0.8).setTint(0xffffff);
      v.baseTint = v.body.tintTopLeft;
      this.lightObject(v);
      if (e.kind === "crop" && e.stage === 0) {
        v.seedGlow ??= this.add.sprite(e.x, e.y, `crop_${e.crop}_glow`);
        v.seedGlow.setTexture(`crop_${e.crop}_glow`).setPosition(e.x, e.y)
          .setOrigin(.5, .8).setDisplaySize(v.body.displayWidth, v.body.displayHeight)
          .setDepth(v.body.depth + .1)
          .setAlpha(seedLight * (.9 + .1 * Math.sin(now / 650 + e.x * .17 + e.y * .11)))
          .setVisible(seedLight > 0 && v.body.visible);
      } else if (v.seedGlow) { v.seedGlow.destroy(); v.seedGlow = undefined; }
      if (e.kind === "animal") {
        v.body.setPosition(
          e.x + Math.sin(now / 1200 + e.x) * 5,
          e.y + Math.sin(now / 1600 + e.y) * 2,
        );
        v.body.setFlipX(Math.cos(now / 3000 + e.x) < 0);
      }
      v.label.setPosition(e.x, e.y + 12).setDepth(e.y + 2);
      if (e.kind === "chest") v.label.setX(e.x + (e.chestSize === 2 ? TILE / 2 : 0));
      if (e.kind === "drop") {
        v.body.setDisplaySize(28, 28).setOrigin(0.5).setBlendMode(Phaser.BlendModes.NORMAL);
        // Quantity text is separate from the alpha icon; no opaque label panel.
        if(changedTexture || v.label.style.backgroundColor)
          v.label.setStyle({backgroundColor:"",color:"#fff7dc",stroke:"#425437",strokeThickness:3,fontSize:"11px",padding:{x:0,y:0}});
      }
      if (["tree","stump","rock"].includes(e.kind) && v.label.style.backgroundColor)
        v.label.setStyle({backgroundColor:"",color:"#fff7dc",stroke:"#425437",strokeThickness:3});
      v.label.setText(label).setVisible(Boolean(label) && !this.feedback?.hiddenObject(id,now));
      if(e.kind==="drop")this.feedback?.drop(id,v,e.x,e.y,now);
      if(e.kind==="rock")this.feedback?.rockDamage(id,v,e.hp,rockMaxHp(e));
    });
    for (const [id, v] of this.objects)
      if (
        !id.startsWith("static-") &&
        !id.startsWith("warp-") &&
        !ids.has(id)
      ) {
        v.ground?.destroy();
        v.seedGlow?.destroy();
        v.roots?.destroy();
        this.feedback?.forgetDrop(id);
        this.feedback?.forgetObject(id);
        v.body.destroy();
        v.label.destroy();
        this.objects.delete(id);
      }
    this.feedback?.update(now,snapshot.players,me.area);
    if (now - this.lastSunShadows >= 100) {
      this.lastSunShadows = now;
      this.drawSunShadows(state.revision);
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
  private lightObject(v: View): void {
    if (lightEnvironment(this.area) !== "outdoor" || !receivesSunlight(v.body.texture.key, v.kind)) return;
    const b = v.body, r = this.cameras.main.worldView;
    if (!b.visible || b.x < r.left - b.displayWidth || b.x > r.right + b.displayWidth ||
      b.y < r.top - 180 || b.y > r.bottom + b.displayHeight) return;
    const base = v.baseTint ?? foliageColor(v.body.texture.key, this.season);
    const key = `${base}:${v.body.rotation}`;
    let tint = this.sunTints.get(key);
    if (!tint) { tint = objectSunTint(base, this.sunlight, v.body.rotation); this.sunTints.set(key, tint); }
    v.body.setTint(...tint);
  }
  private drawSunShadows(revision: number): void {
    const g = this.sunShadows;
    if (!g) return;
    const r = this.cameras.main.worldView;
    const signature = `${this.sunlightKey}:${revision}:${this.objects.size}:${Math.round(r.x / 8)}:${Math.round(r.y / 8)}:${r.width}:${r.height}`;
    if (signature === this.shadowSignature) return;
    this.shadowSignature = signature;
    g.clear();
    if (lightEnvironment(this.area) !== "outdoor") return;
    let count = 0;
    for (const v of this.objects.values()) {
      const b = v.body;
      if (!b.visible || !receivesSunlight(b.texture.key, v.kind) ||
        b.x < r.left - 180 || b.x > r.right + 180 ||
        b.y < r.top - 180 || b.y > r.bottom + b.displayHeight) continue;
      // Authored/static scenery has no per-frame entity tint update.
      if (!v.kind) this.lightObject(v);
      if (this.sunlight.sunlightIntensity <= 0 || count++ >= 160) continue;
      const shadow = groundShadow(this.sunlight, b.displayWidth, b.displayHeight);
      // Original tree anchors are at their feet; painted buildings use a center
      // origin. Keep the projected shadow attached to the original art footprint.
      const footY = b.y + Math.max(0, .9 - b.originY) * b.displayHeight;
      g.fillStyle(0x24362f, shadow.alpha * .65);
      g.fillEllipse(b.x + shadow.x, footY + shadow.y, shadow.width, shadow.height, 16);
      g.fillStyle(0x24362f, shadow.alpha * .35);
      g.fillEllipse(b.x + shadow.x, footY + shadow.y, shadow.width * .82, shadow.height * .76, 16);
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
    const environment = lightEnvironment(this.area);
    const light = atmosphereLight(this.area, state.minute, this.sunlight);
    const wash=this.daylightWash!;
    wash.setPosition(g.x,g.y).setScale(1/zoom).clear();
    if(light.daylightLift>0){wash.fillStyle(light.daylightColor,light.daylightLift);wash.fillRect(0,0,w,h);}
    const veil=this.nightVeil!,texture=this.nightTexture!;
    veil.setVisible(environment==="outdoor" && light.darkness>.001);
    if(veil.visible){
      // Half resolution is sufficient for smooth gradients, including phones.
      const rw=Math.ceil(w/2),rh=Math.ceil(h/2);
      if(texture.width!==rw||texture.height!==rh){texture.setSize(rw,rh);veil.setTexture(texture.key);}
      const origin=this.cameras.main.getWorldPoint(0,0),lights:WorldLight[]=[];
      for(const v of this.objects.values()){
        if(!v.body.visible)continue;
        const source=sceneryLight(v.body.texture.key,v.body.x,v.body.y);
        if(!source)continue;
        const x=(source.x-origin.x)*zoom/2,y=(source.y-origin.y)*zoom/2,radius=source.radius*zoom/2;
        if(x+radius<0||y+radius<0||x-radius>rw||y-radius>rh)continue;
        lights.push({...source,x,y,radius});if(lights.length>=24)break;
      }
      paintNightVeil(texture.context,rw,rh,light.darkness,lights);texture.refresh();
      veil.setPosition(g.x,g.y).setDisplaySize(w/zoom,h/zoom);
    }else if(environment!=="outdoor"){
      g.fillStyle(light.darkColor,light.darkness);g.fillRect(0,0,w,h);
    }
    if (light.warmth > 0) {
      g.fillStyle(light.warmColor, light.warmth);
      g.fillRect(0, 0, w, h);
    }
    const weatherLight=environment==="outdoor"?Math.max(.08,this.sunlight.ambientLight):1;
    if (environment === "outdoor")
      for (let i = 0; i < 32; i++) {
        const x = (i * 137 + Math.sin(now / 2200 + i) * 24 + w) % w;
        const y =
          (i * 73 + now * (state.weather === "rain" ? 0.35 : 0.035)) % h;
        if (state.weather === "rain") {
          g.lineStyle(1, 0xd2e9ee, 0.4*weatherLight);
          g.lineBetween(x, y, x - 4, y + 13);
        } else if (state.weather === "snow" || this.season === "winter") {
          g.fillStyle(0xffffff, 0.55*weatherLight);
          g.fillCircle(x, y, (i % 2) + 1);
        } else if (this.season === "spring" && i < 12) {
          g.fillStyle(0xffd2df, 0.55*weatherLight);
          g.fillEllipse(x, y, 4, 2);
        } else if (this.season === "autumn" && i < 12) {
          g.fillStyle(0xe2a15b, 0.5*weatherLight);
          g.fillEllipse(x, y, 5, 2);
        }
      }
    if (festivalOn(state.day) && this.area === "town")
      for (let i = 0; i < 14; i++) {
        g.fillStyle(0xffdb8f, 0.18 + Math.sin(now / 900 + i) * 0.08);
        g.fillCircle((i * 79) % w, 70 + Math.sin(i) * 24, 8);
      }
    // Reuse the rendered view set instead of allocating/sorting the full world
    // twenty times per second just for a proximity highlight.
    let near: { x: number; y: number } | undefined, nearest = 66 * 66;
    if (this.me) for (const v of this.objects.values()) {
      if (!v.kind || !v.body.visible) continue;
      const distance = (v.body.x - this.me.x) ** 2 + (v.body.y - this.me.y) ** 2;
      if (distance < nearest) { nearest = distance; near = v.body; }
    }
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
    // A giant crown can overlap a smaller tree's trunk. A precise tap on the
    // occupied ground cell means that trunk/stump, even beneath another crown.
    // Only pointer events scan this visible view set; authority/collision stay
    // on the existing whole-tile rules.
    for(const [id,v] of this.objects)
      if(v.body.visible && ["tree","stump","rock","twig","gather"].includes(v.kind??"") &&
        Math.abs(v.x-p.x)<=12 && Math.abs(v.y-p.y)<=8)
        return {...p,entityId:id};
    const hit = [...this.objects.entries()]
      .sort((a, b) => b[1].y - a[1].y)
      .find(([, v]) => v.body.visible && v.body.getBounds().contains(p.x, p.y));
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
    pixelArt: false,
    antialias: true,
    backgroundColor: "#7fa765",
    scale: { mode: Phaser.Scale.RESIZE },
    input: { keyboard: false, mouse: false, touch: false },
    fps: { target: 60, smoothStep: false },
    scene,
  });
  return { game, scene };
}
