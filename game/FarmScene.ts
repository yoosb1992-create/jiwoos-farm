import * as Phaser from "phaser";
import { gameEvents, type HudState, type ToolKey } from "./events";
import { advanceFarmDay, Inventory, LocalStorageSaveRepository, purchaseInventoryItem, type FarmTileData, type SaveData } from "./domain";
import { AssetManager } from "./assets/AssetManager";
import { PLAYER_ASSET, displayedSize, physicsBoxForScale, type Facing } from "./assets/definitions";
import { WorldRenderer } from "./rendering/WorldRenderer";
import { GAME_CONFIG } from "./config";
import { DEFAULT_CROP_ID, getCropDefinition, isMatureCrop } from "./data/crops";
import { ITEM_DEFINITIONS } from "./data/items";
import { GENERAL_STORE_LISTINGS } from "./data/shop";
import { TILE_TYPE_DEFINITIONS, getTileTypeInMap, pointInTileRect, tilePoint } from "./maps/definitions";
import type { MapAction, MapId } from "./maps/types";
import { MapRegistry } from "./maps/MapRegistry";
import { PlayerAnimationController } from "./player/PlayerAnimationController";
import { ToolActionSystem } from "./actions/ToolActionSystem";
import { facingFromMovement, mergeMovementInput, type MovementVector } from "./input/MovementInput";

export const REAL_MS_PER_GAME_MINUTE = GAME_CONFIG.day.realMsPerGameMinute;
type Command = { type: string; value?: unknown };
export interface FarmSceneOptions { maps?: MapRegistry; initialMapId?: MapId; testMode?: boolean }

export class FarmScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private actionKey!: Phaser.Input.Keyboard.Key;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private obstacleCollider?: Phaser.Physics.Arcade.Collider;
  private farm = new Map<string, FarmTileData>();
  private assetManager!: AssetManager;
  private worldRenderer!: WorldRenderer;
  private playerAnimations!: PlayerAnimationController;
  private toolActions!: ToolActionSystem;
  private inventory = new Inventory();
  private repository = new LocalStorageSaveRepository();
  private selectedTool: ToolKey = "hoe";
  private money: number = GAME_CONFIG.startingMoney;
  private day = 1;
  private timeMinutes = GAME_CONFIG.day.startMinutes;
  private timeAccumulator = 0;
  private facing: Facing = "down";
  private virtualMovement: MovementVector = { x: 0, y: 0 };
  private currentMapId: MapId;
  private readonly mapRegistry: MapRegistry;
  private readonly testMode: boolean;
  private helpOpen = true;
  private sleepPrompt = false;
  private shopOpen = false;
  private transitioning = false;
  private lateNightWarned = false;
  private lockedWarpId: string | null = null;
  private message = "갈색 밭 가까이에서 괭이를 사용하세요.";
  private commandHandler = (event: Event) => this.handleCommand((event as CustomEvent<Command>).detail);

  constructor(options: FarmSceneOptions = {}) {
    super("FarmScene");
    this.mapRegistry = options.maps ?? new MapRegistry();
    this.currentMapId = this.mapRegistry.has(options.initialMapId ?? "farm") ? (options.initialMapId ?? "farm") : "farm";
    this.testMode = options.testMode === true;
  }
  preload() { this.assetManager = new AssetManager(this); this.assetManager.preload(); }

  create() {
    this.assetManager ??= new AssetManager(this);
    this.assetManager.createFallbackTextures(); this.assetManager.createPlayerAnimations();
    this.worldRenderer = new WorldRenderer(this, this.mapRegistry); this.buildFarm();
    const saved = this.testMode ? null : this.repository.load();
    if (saved) this.applySavedState(saved);
    const playerSize = displayedSize(PLAYER_ASSET);
    this.player = this.physics.add.sprite(0, 0, PLAYER_ASSET.textureKey).setDisplaySize(playerSize.width, playerSize.height)
      .setOrigin(PLAYER_ASSET.origin.x, PLAYER_ASSET.origin.y).setDepth(20).setCollideWorldBounds(true);
    const box = physicsBoxForScale(PLAYER_ASSET.collisionBox, { x: this.player.scaleX, y: this.player.scaleY });
    this.player.body!.setSize(box.width, box.height).setOffset(box.offsetX, box.offsetY);
    this.playerAnimations = new PlayerAnimationController(this.player, this.facing); this.toolActions = new ToolActionSystem(this.playerAnimations);
    this.loadMap(this.currentMapId, undefined, saved ? { x: saved.player.x, y: saved.player.y, facing: saved.player.facing } : undefined);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D,ONE,TWO,THREE,FOUR") as Record<string, Phaser.Input.Keyboard.Key>;
    this.actionKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.useAtWorld(pointer.worldX, pointer.worldY));
    gameEvents.addEventListener("command", this.commandHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => gameEvents.removeEventListener("command", this.commandHandler));
    this.time.addEvent({ delay: GAME_CONFIG.autoSaveIntervalMs, loop: true, callback: () => this.save(false) });
    this.emitHud();
  }

  update(_time: number, delta: number) {
    if (!this.isPaused()) this.advanceClock(delta);
    if (this.isPaused()) { this.player.setVelocity(0, 0); this.playerAnimations.playMovement(this.facing, false); return; }
    const keyboard = {
      x: (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0) - (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0),
      y: (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0) - (this.cursors.up.isDown || this.wasd.W.isDown ? 1 : 0),
    };
    const movement = mergeMovementInput(keyboard, this.virtualMovement);
    this.facing = facingFromMovement(movement, this.facing);
    this.player.setVelocity(movement.x * GAME_CONFIG.playerSpeed, movement.y * GAME_CONFIG.playerSpeed);
    this.playerAnimations.playMovement(this.facing, Boolean(movement.x || movement.y));
    if (Phaser.Input.Keyboard.JustDown(this.actionKey)) this.useFacingTile();
    if (Phaser.Input.Keyboard.JustDown(this.wasd.ONE)) this.selectTool("hoe");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.TWO)) this.selectTool("seed");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.THREE)) this.selectTool("water");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.FOUR)) this.selectTool("hand");
    this.checkWarp();
  }

  private isPaused() { return this.helpOpen || this.sleepPrompt || this.shopOpen || this.transitioning; }
  private advanceClock(delta: number) {
    this.timeAccumulator += delta;
    const elapsed = Math.floor(this.timeAccumulator / REAL_MS_PER_GAME_MINUTE);
    if (!elapsed) return;
    this.timeAccumulator -= elapsed * REAL_MS_PER_GAME_MINUTE;
    const previous = this.timeMinutes; this.timeMinutes = Math.min(GAME_CONFIG.day.endMinutes, this.timeMinutes + elapsed);
    if (!this.lateNightWarned && previous < GAME_CONFIG.day.lateNightMinutes && this.timeMinutes >= GAME_CONFIG.day.lateNightMinutes) {
      this.lateNightWarned = true; this.say("밤이 깊었습니다. 집으로 돌아가 쉬는 것이 좋겠습니다.");
    } else this.emitHud();
  }

  private buildFarm() {
    for (const area of this.mapRegistry.require("farm").farmAreas) for (let y = area.startY; y <= area.endY; y++) for (let x = area.startX; x <= area.endX; x++) {
      this.farm.set(`${x},${y}`, { x, y, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null });
    }
  }

  private loadMap(mapId: MapId, spawnId?: string, position?: { x: number; y: number; facing: Facing }) {
    this.currentMapId = mapId;
    const map = this.mapRegistry.require(mapId), width = map.width * GAME_CONFIG.tileSize, height = map.height * GAME_CONFIG.tileSize;
    this.obstacleCollider?.destroy(); this.obstacles = this.worldRenderer.renderMap(mapId, this.farm.values());
    this.physics.world.setBounds(0, 0, width, height); this.cameras.main.setBounds(0, 0, width, height);
    this.obstacleCollider = this.physics.add.collider(this.player, this.obstacles);
    const spawn = map.spawns.find((entry) => entry.id === spawnId) ?? map.spawns[0];
    if (position) {
      this.player.setPosition(Phaser.Math.Clamp(position.x, GAME_CONFIG.tileSize, width - GAME_CONFIG.tileSize), Phaser.Math.Clamp(position.y, GAME_CONFIG.tileSize, height - GAME_CONFIG.tileSize));
      this.facing = position.facing;
    }
    else { const point = tilePoint(spawn.tileX, spawn.tileY); this.player.setPosition(point.x, point.y); this.facing = spawn.facing; }
    this.cameras.main.startFollow(this.player, true, GAME_CONFIG.cameraFollowLerp, GAME_CONFIG.cameraFollowLerp).setZoom(GAME_CONFIG.cameraZoom);
    this.lockedWarpId = map.warps.find((warp) => pointInTileRect(this.player.x, this.player.y, warp.area))?.id ?? null;
    this.message = `${map.name}에 도착했어요.`; this.save(false); this.emitHud();
  }

  private checkWarp() {
    const active = this.mapRegistry.require(this.currentMapId).warps.find((warp) => pointInTileRect(this.player.x, this.player.y, warp.area));
    if (!active) { this.lockedWarpId = null; return; }
    if (this.lockedWarpId === active.id) return;
    this.loadMap(active.targetMapId, active.targetSpawnId);
  }

  private useFacingTile() {
    const point = this.playerAnimations.interactionPoint(this.facing);
    const object = this.mapRegistry.require(this.currentMapId).objects.find((entry) => entry.interaction && pointInTileRect(point.x, point.y, entry.interaction.area));
    if (object?.interaction) { this.performWorldAction(object.interaction.action); return; }
    this.useAtWorld(point.x, point.y);
  }

  private performWorldAction(action: MapAction) {
    if (action === "sleep") this.askToSleep();
    else if (action === "open_shop") { this.shopOpen = true; this.say("새봄 상점입니다. 필요한 씨앗을 골라 보세요."); }
    else if (action === "sell") this.sellHarvest();
  }

  private useAtWorld(worldX: number, worldY: number) {
    if (this.currentMapId !== "farm") { this.say("이곳에서는 농사 도구를 사용할 수 없어요."); return; }
    const x = Math.floor(worldX / GAME_CONFIG.tileSize), y = Math.floor(worldY / GAME_CONFIG.tileSize);
    if (!TILE_TYPE_DEFINITIONS[getTileTypeInMap(this.mapRegistry.require("farm"), x, y)].farmable) { this.say("이곳에서는 농사 도구를 사용할 수 없어요."); return; }
    const tile = this.farm.get(`${x},${y}`);
    if (!tile) { this.say("이곳에서는 농사 도구를 사용할 수 없어요."); return; }
    const center = tilePoint(x + 0.5, y + 0.5);
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, center.x, center.y) > GAME_CONFIG.farmInteractionDistance) { this.say("조금 더 가까이 가 주세요."); return; }
    const executed = this.toolActions.execute(this.selectedTool, this.facing, (tool) => this.applyTool(tool, tile));
    if (!executed) return;
    this.worldRenderer.renderFarmTile(tile); this.save(false); this.emitHud();
  }

  private applyTool(tool: ToolKey, tile: FarmTileData) {
    const crop = getCropDefinition(DEFAULT_CROP_ID);
    if (tool === "hoe") {
      if (tile.tilled) this.say("이미 잘 갈아 둔 밭이에요."); else { tile.tilled = true; this.say("포슬포슬하게 땅을 갈았어요."); }
    } else if (tool === "seed") {
      if (!tile.tilled) this.say("먼저 괭이로 땅을 갈아야 해요.");
      else if (tile.cropStage !== null) this.say("이미 작물이 자라고 있어요.");
      else if (!this.inventory.consume(crop.seedItemId)) this.say("씨앗이 없어요. 마을 상점에서 살 수 있어요.");
      else { tile.cropType = DEFAULT_CROP_ID; tile.cropStage = 0; tile.wateredToday = false; tile.plantedDay = this.day; this.say(`${crop.name} 씨앗을 심었어요.`); }
    } else if (tool === "water") {
      if (tile.cropStage === null) this.say("먼저 씨앗을 심어 주세요.");
      else if (tile.wateredToday) this.say("오늘은 이미 촉촉하게 물을 주었어요.");
      else { tile.wateredToday = true; this.say("물을 주었어요. 오늘 하루를 마치면 한 단계 자라요!"); }
    } else if (!tile.cropType || tile.cropStage === null || !isMatureCrop(tile.cropType, tile.cropStage)) this.say("아직 수확할 때가 아니에요.");
    else { const harvested = getCropDefinition(tile.cropType); this.inventory.add(harvested.harvestItemId); Object.assign(tile, { cropType: null, cropStage: null, wateredToday: false, plantedDay: null, tilled: true }); this.say(`통통한 ${harvested.name}를 수확했어요!`); }
  }

  private handleCommand(command: Command) {
    if (this.testMode && (command.type === "save" || command.type === "load")) { this.say("테스트 플레이에서는 실제 게임 저장을 변경하지 않아요."); return; }
    if (command.type === "move") {
      const value = command.value as Partial<MovementVector> | undefined;
      this.virtualMovement = { x: Number(value?.x) || 0, y: Number(value?.y) || 0 };
    }
    if (command.type === "tool" && typeof command.value === "string") this.selectTool(command.value as ToolKey);
    if (command.type === "action") this.useFacingTile();
    if (command.type === "save") this.save(true);
    if (command.type === "load") { const data = this.repository.load(); if (data) this.restore(data, true); else this.say("아직 저장된 농장이 없어요."); }
    if (command.type === "help") { this.helpOpen = command.value === "open"; this.virtualMovement = { x: 0, y: 0 }; this.emitHud(); }
    if (command.type === "sleep-confirm") this.sleep();
    if (command.type === "sleep-cancel") { this.sleepPrompt = false; this.say("조금 더 둘러보기로 했어요."); }
    if (command.type === "shop-close") { this.shopOpen = false; this.say("다음에 또 들러 주세요."); }
    if (command.type === "shop-buy" && typeof command.value === "string") this.buy(command.value);
    if (command.type === "sell") this.sellHarvest();
  }

  private buy(listingId: string) {
    const listing = GENERAL_STORE_LISTINGS.find((entry) => entry.id === listingId);
    if (!listing) return;
    const result = purchaseInventoryItem(this.inventory, this.money, listing.itemId, listing.price, listing.quantity);
    if (!result.purchased) this.say("돈이 부족해요.");
    else { this.money = result.money; this.say(`${listing.name} ${listing.quantity}개를 샀어요.`); this.save(false); }
    this.emitHud();
  }
  private sellHarvest() {
    const crop = getCropDefinition(DEFAULT_CROP_ID);
    if (!this.inventory.count(crop.harvestItemId)) this.say("판매할 수확물이 없어요.");
    else { const { amount, earned } = this.inventory.sellAll(crop.harvestItemId, crop.sellPrice); this.money += earned; this.say(`${amount}개를 팔아 ${earned}G를 얻었어요!`); this.save(false); }
    this.emitHud();
  }
  private askToSleep() { if (!this.helpOpen && !this.transitioning) { this.sleepPrompt = true; this.say("오늘 하루를 마치고 잠드시겠습니까?"); } }
  private sleep() {
    if (!this.sleepPrompt || this.transitioning) return;
    this.sleepPrompt = false; this.transitioning = true; this.player.setVelocity(0, 0); this.emitHud();
    window.setTimeout(() => {
      const grown = advanceFarmDay([...this.farm.values()]);
      this.day = this.day >= GAME_CONFIG.day.daysPerSeason ? 1 : this.day + 1; this.timeMinutes = GAME_CONFIG.day.startMinutes;
      this.timeAccumulator = 0; this.lateNightWarned = false; this.transitioning = false;
      this.loadMap("farmhouse", "bed_wake");
      this.message = grown ? `잘 잤어요. 물을 준 작물 ${grown}개가 자랐습니다.` : "잘 잤어요. 새로운 아침이 밝았습니다.";
      this.save(false); this.emitHud();
    }, GAME_CONFIG.day.sleepTransitionMs);
  }

  private selectTool(tool: ToolKey) { this.selectedTool = tool; this.say(`${ITEM_DEFINITIONS[tool].name}을(를) 선택했어요.`); }
  private getObjective() {
    const tiles = [...this.farm.values()]; const crop = getCropDefinition(DEFAULT_CROP_ID);
    if (this.inventory.count(crop.harvestItemId) > 0) return { objective: "수확물을 판매해 보세요", progress: 95 };
    if (!tiles.some((tile) => tile.tilled)) return { objective: "첫 밭을 갈아 보세요", progress: 5 };
    if (!tiles.some((tile) => tile.cropStage !== null)) return { objective: "새싹열매 씨앗을 심으세요", progress: 25 };
    if (tiles.some((tile) => tile.cropType && tile.cropStage !== null && isMatureCrop(tile.cropType, tile.cropStage))) return { objective: "다 자란 작물을 수확하세요", progress: 80 };
    if (!tiles.some((tile) => tile.wateredToday)) return { objective: "작물에 오늘의 물을 주세요", progress: 45 };
    return { objective: "농장집 침대에서 잠드세요", progress: 65 };
  }
  private formatTime() { const h = Math.floor(this.timeMinutes / 60), m = this.timeMinutes % 60; return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${m.toString().padStart(2, "0")}`; }
  private emitHud() {
    const step = this.getObjective();
    const hud: HudState = { money: this.money, seeds: this.inventory.count("sproutberry_seed"), harvest: this.inventory.count("sproutberry"), selectedTool: this.selectedTool,
      objective: step.objective, message: this.message, progress: step.progress, day: this.day, timeText: this.formatTime(), sleepPrompt: this.sleepPrompt,
      transitioning: this.transitioning, shopOpen: this.shopOpen, mapName: this.mapRegistry.require(this.currentMapId).name };
    gameEvents.dispatchEvent(new CustomEvent("hud", { detail: hud }));
  }
  private say(message: string) { this.message = message; this.emitHud(); }
  private snapshot(): SaveData { return { version: 4, day: this.day, timeMinutes: this.timeMinutes, money: this.money, selectedTool: this.selectedTool,
    player: { x: this.player.x, y: this.player.y, facing: this.facing, mapId: this.currentMapId }, inventory: this.inventory.serialize(), farm: [...this.farm.values()].map((tile) => ({ ...tile })), savedAt: Date.now() }; }
  private save(notify: boolean) { if (!this.player || this.testMode) return; this.repository.save(this.snapshot()); if (notify) this.say("이 브라우저에 현재 장소와 농장 상태를 저장했어요."); }
  private applySavedState(data: SaveData) {
    this.day = data.day; this.timeMinutes = data.timeMinutes; this.money = data.money; this.selectedTool = data.selectedTool;
    this.inventory = new Inventory(data.inventory); this.facing = data.player.facing; this.currentMapId = data.player.mapId;
    for (const saved of data.farm) { const tile = this.farm.get(`${saved.x},${saved.y}`); if (tile) Object.assign(tile, saved); }
    this.lateNightWarned = this.timeMinutes >= GAME_CONFIG.day.lateNightMinutes;
  }
  private restore(data: SaveData, notify: boolean) { this.applySavedState(data); this.loadMap(data.player.mapId, undefined, data.player); if (notify) this.say("저장된 장소와 농장을 불러왔어요."); }
}
