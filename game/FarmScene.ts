import * as Phaser from "phaser";
import { gameEvents, type HudState, type ToolKey } from "./events";
import { advanceFarmDay, Inventory, LocalStorageSaveRepository, type FarmTileData, type SaveData } from "./domain";
import { AssetManager } from "./assets/AssetManager";
import { PLAYER_ASSET, displayedSize, physicsBoxForScale, type Facing } from "./assets/definitions";
import { WorldRenderer } from "./rendering/WorldRenderer";
import { TILE_TYPE_DEFINITIONS, WORLD_MAP, getTileTypeAt, getWorldObject, worldPoint } from "./worldData";
import { GAME_CONFIG } from "./config";
import { DEFAULT_CROP_ID, getCropDefinition, isMatureCrop } from "./data/crops";
import { ITEM_DEFINITIONS } from "./data/items";
import { PlayerAnimationController } from "./player/PlayerAnimationController";
import { ToolActionSystem } from "./actions/ToolActionSystem";

export const REAL_MS_PER_GAME_MINUTE = GAME_CONFIG.day.realMsPerGameMinute;
const HOUSE = getWorldObject("house")!;
const HOUSE_INTERACTION = HOUSE.interaction!;
const HOUSE_DOOR = worldPoint(HOUSE_INTERACTION.tileX, HOUSE_INTERACTION.tileY);
const HOUSE_START = worldPoint(WORLD_MAP.playerSpawn.tileX, WORLD_MAP.playerSpawn.tileY);

type Command = { type: string; value?: string };

export class FarmScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private actionKey!: Phaser.Input.Keyboard.Key;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
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
  private helpOpen = true;
  private sleepPrompt = false;
  private transitioning = false;
  private lateNightWarned = false;
  private message = "갈색 밭 가까이에서 괭이를 사용하세요.";
  private commandHandler = (event: Event) => this.handleCommand((event as CustomEvent<Command>).detail);

  constructor() { super("FarmScene"); }

  preload() {
    this.assetManager = new AssetManager(this);
    this.assetManager.preload();
  }

  create() {
    this.assetManager ??= new AssetManager(this);
    this.assetManager.createFallbackTextures();
    this.assetManager.createPlayerAnimations();
    const worldWidth = WORLD_MAP.width * WORLD_MAP.tileSize;
    const worldHeight = WORLD_MAP.height * WORLD_MAP.tileSize;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    this.worldRenderer = new WorldRenderer(this);
    this.obstacles = this.worldRenderer.createWorld();
    this.buildFarm();
    const player = PLAYER_ASSET;
    const playerSize = displayedSize(player);
    this.player = this.physics.add.sprite(HOUSE_START.x, HOUSE_START.y, player.textureKey)
      .setDisplaySize(playerSize.width, playerSize.height)
      .setOrigin(player.origin.x, player.origin.y).setDepth(20).setCollideWorldBounds(true);
    const physicsBox = physicsBoxForScale(player.collisionBox, { x: this.player.scaleX, y: this.player.scaleY });
    this.player.body!.setSize(physicsBox.width, physicsBox.height).setOffset(physicsBox.offsetX, physicsBox.offsetY);
    this.playerAnimations = new PlayerAnimationController(this.player);
    this.toolActions = new ToolActionSystem(this.playerAnimations);
    this.physics.add.collider(this.player, this.obstacles);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight).startFollow(this.player, true, GAME_CONFIG.cameraFollowLerp, GAME_CONFIG.cameraFollowLerp);
    this.cameras.main.setZoom(GAME_CONFIG.cameraZoom);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D,ONE,TWO,THREE,FOUR") as Record<string, Phaser.Input.Keyboard.Key>;
    this.actionKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.useAtWorld(pointer.worldX, pointer.worldY));
    gameEvents.addEventListener("command", this.commandHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => gameEvents.removeEventListener("command", this.commandHandler));
    const saved = this.repository.load();
    if (saved) this.restore(saved, false);
    this.time.addEvent({ delay: GAME_CONFIG.autoSaveIntervalMs, loop: true, callback: () => this.save(false) });
    this.emitHud();
  }

  update(_time: number, delta: number) {
    if (!this.isPaused()) this.advanceClock(delta);
    const speed = GAME_CONFIG.playerSpeed;
    if (this.isPaused()) { this.player.setVelocity(0, 0); this.playerAnimations.playMovement(this.facing, false); return; }
    let vx = 0, vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) { vx = -speed; this.facing = "left"; }
    else if (this.cursors.right.isDown || this.wasd.D.isDown) { vx = speed; this.facing = "right"; }
    if (this.cursors.up.isDown || this.wasd.W.isDown) { vy = -speed; this.facing = "up"; }
    else if (this.cursors.down.isDown || this.wasd.S.isDown) { vy = speed; this.facing = "down"; }
    if (vx && vy) { vx *= 0.707; vy *= 0.707; }
    this.player.setVelocity(vx, vy);
    this.playerAnimations.playMovement(this.facing, Boolean(vx || vy));
    if (Phaser.Input.Keyboard.JustDown(this.actionKey)) this.useFacingTile();
    if (Phaser.Input.Keyboard.JustDown(this.wasd.ONE)) this.selectTool("hoe");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.TWO)) this.selectTool("seed");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.THREE)) this.selectTool("water");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.FOUR)) this.selectTool("hand");
  }

  private isPaused() { return this.helpOpen || this.sleepPrompt || this.transitioning; }

  private advanceClock(delta: number) {
    this.timeAccumulator += delta;
    const elapsedMinutes = Math.floor(this.timeAccumulator / REAL_MS_PER_GAME_MINUTE);
    if (!elapsedMinutes) return;
    this.timeAccumulator -= elapsedMinutes * REAL_MS_PER_GAME_MINUTE;
    const previous = this.timeMinutes;
    this.timeMinutes = Math.min(GAME_CONFIG.day.endMinutes, this.timeMinutes + elapsedMinutes);
    if (!this.lateNightWarned && previous < GAME_CONFIG.day.lateNightMinutes && this.timeMinutes >= GAME_CONFIG.day.lateNightMinutes) {
      this.lateNightWarned = true;
      this.say("밤이 깊었습니다. 집으로 돌아가 쉬는 것이 좋겠습니다.");
    } else this.emitHud();
  }

  private buildFarm() {
    const area = WORLD_MAP.farmArea;
    for (let y = area.startY; y <= area.endY; y++) for (let x = area.startX; x <= area.endX; x++) {
      const data: FarmTileData = { x, y, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null };
      this.farm.set(`${x},${y}`, data);
    }
    this.worldRenderer.createFarmViews(this.farm.values());
  }

  private renderTile(tile: FarmTileData) {
    this.worldRenderer.renderFarmTile(tile);
  }

  private useFacingTile() {
    if (this.isNearHouse()) { this.askToSleep(); return; }
    const point = this.playerAnimations.interactionPoint(this.facing);
    this.useAtWorld(point.x, point.y);
  }

  private useAtWorld(worldX: number, worldY: number) {
    if (Phaser.Math.Distance.Between(worldX, worldY, HOUSE_DOOR.x, HOUSE_DOOR.y) <= HOUSE_INTERACTION.radius && this.isNearHouse()) { this.askToSleep(); return; }
    const x = Math.floor(worldX / WORLD_MAP.tileSize), y = Math.floor(worldY / WORLD_MAP.tileSize);
    if (!TILE_TYPE_DEFINITIONS[getTileTypeAt(x, y)].farmable) { this.say("이곳에서는 농사 도구를 사용할 수 없어요."); return; }
    const tile = this.farm.get(`${x},${y}`);
    if (!tile) { this.say("이곳에서는 농사 도구를 사용할 수 없어요."); return; }
    const tileCenter = worldPoint(x + 0.5, y + 0.5);
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, tileCenter.x, tileCenter.y);
    if (distance > GAME_CONFIG.farmInteractionDistance) { this.say("조금 더 가까이 가 주세요."); return; }
    this.toolActions.execute(this.selectedTool, this.facing, (tool) => this.applyTool(tool, tile));
    this.renderTile(tile); this.save(false); this.emitHud();
  }

  private applyTool(tool: ToolKey, tile: FarmTileData) {
    const crop = getCropDefinition(DEFAULT_CROP_ID);
    if (tool === "hoe") {
      if (tile.tilled) this.say("이미 잘 갈아 둔 밭이에요.");
      else { tile.tilled = true; this.say("포슬포슬하게 땅을 갈았어요."); }
    } else if (tool === "seed") {
      if (!tile.tilled) this.say("먼저 괭이로 땅을 갈아야 해요.");
      else if (tile.cropStage !== null) this.say("이미 작물이 자라고 있어요.");
      else if (!this.inventory.consume(crop.seedItemId)) this.say("씨앗이 없어요. 수확물을 팔면 씨앗을 보충해요.");
      else { tile.cropType = DEFAULT_CROP_ID; tile.cropStage = 0; tile.wateredToday = false; tile.plantedDay = this.day; this.say(`${crop.name} 씨앗을 심었어요.`); }
    } else if (tool === "water") {
      if (tile.cropStage === null) this.say("먼저 씨앗을 심어 주세요.");
      else if (tile.wateredToday) this.say("오늘은 이미 촉촉하게 물을 주었어요.");
      else { tile.wateredToday = true; this.say("물을 주었어요. 오늘 하루를 마치면 한 단계 자라요!"); }
    } else {
      if (!tile.cropType || tile.cropStage === null || !isMatureCrop(tile.cropType, tile.cropStage)) this.say("아직 수확할 때가 아니에요.");
      else {
        const harvestedCrop = getCropDefinition(tile.cropType);
        this.inventory.add(harvestedCrop.harvestItemId); tile.cropType = null; tile.cropStage = null; tile.wateredToday = false; tile.plantedDay = null; tile.tilled = true;
        this.say(`통통한 ${harvestedCrop.name}를 수확했어요!`);
      }
    }
  }

  private handleCommand(command: Command) {
    if (command.type === "tool" && command.value) this.selectTool(command.value as ToolKey);
    if (command.type === "action") this.useFacingTile();
    if (command.type === "save") this.save(true);
    if (command.type === "load") {
      const data = this.repository.load();
      if (data) this.restore(data, true); else this.say("아직 저장된 농장이 없어요.");
    }
    if (command.type === "help") { this.helpOpen = command.value === "open"; this.emitHud(); }
    if (command.type === "sleep-confirm") this.sleep();
    if (command.type === "sleep-cancel") { this.sleepPrompt = false; this.say("조금 더 농장을 돌보기로 했어요."); }
    if (command.type === "sell") {
      const crop = getCropDefinition(DEFAULT_CROP_ID);
      if (!this.inventory.count(crop.harvestItemId)) this.say("판매할 수확물이 없어요.");
      else {
        const { amount, earned } = this.inventory.sellAll(crop.harvestItemId, crop.sellPrice);
        this.money += earned; this.inventory.add(crop.seedItemId, amount);
        this.say(`${amount}개를 팔아 ${earned}G를 얻고 씨앗도 보충했어요!`); this.save(false);
      }
      this.emitHud();
    }
  }

  private isNearHouse() {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, HOUSE_DOOR.x, HOUSE_DOOR.y) <= HOUSE_INTERACTION.radius;
  }

  private askToSleep() {
    if (this.helpOpen || this.transitioning) return;
    this.sleepPrompt = true;
    this.say("오늘 하루를 마치고 잠드시겠습니까?");
  }

  private sleep() {
    if (!this.sleepPrompt || this.transitioning) return;
    this.sleepPrompt = false;
    this.transitioning = true;
    this.player.setVelocity(0, 0);
    this.emitHud();
    window.setTimeout(() => {
      const grown = advanceFarmDay([...this.farm.values()]);
      for (const tile of this.farm.values()) this.renderTile(tile);
      this.day = this.day >= GAME_CONFIG.day.daysPerSeason ? 1 : this.day + 1;
      this.timeMinutes = GAME_CONFIG.day.startMinutes;
      this.timeAccumulator = 0;
      this.lateNightWarned = false;
      this.player.setPosition(HOUSE_START.x, HOUSE_START.y);
      this.facing = "down";
      this.transitioning = false;
      this.message = grown > 0 ? `잘 잤어요. 물을 준 작물 ${grown}개가 자랐습니다.` : "잘 잤어요. 새로운 아침이 밝았습니다.";
      this.save(false);
      this.emitHud();
    }, GAME_CONFIG.day.sleepTransitionMs);
  }

  private selectTool(tool: ToolKey) {
    this.selectedTool = tool;
    this.say(`${ITEM_DEFINITIONS[tool].name}을(를) 선택했어요.`); this.emitHud();
  }

  private getObjective() {
    const tiles = [...this.farm.values()];
    const crop = getCropDefinition(DEFAULT_CROP_ID);
    if (this.inventory.count(crop.harvestItemId) > 0) return { objective: "수확물을 판매해 보세요", progress: 95 };
    if (!tiles.some((tile) => tile.tilled)) return { objective: "첫 밭을 갈아 보세요", progress: 5 };
    if (!tiles.some((tile) => tile.cropStage !== null)) return { objective: "새싹열매 씨앗을 심으세요", progress: 25 };
    if (tiles.some((tile) => tile.cropType && tile.cropStage !== null && isMatureCrop(tile.cropType, tile.cropStage))) return { objective: "다 자란 작물을 수확하세요", progress: 80 };
    if (!tiles.some((tile) => tile.wateredToday)) return { objective: "작물에 오늘의 물을 주세요", progress: 45 };
    return { objective: "집에서 잠들어 다음 날로 가세요", progress: 65 };
  }

  private formatTime() {
    const hour24 = Math.floor(this.timeMinutes / 60);
    const minutes = this.timeMinutes % 60;
    const period = hour24 < 12 ? "오전" : "오후";
    const hour12 = hour24 % 12 || 12;
    return `${period} ${hour12}:${minutes.toString().padStart(2, "0")}`;
  }

  private emitHud() {
    const step = this.getObjective();
    const hud: HudState = {
      money: this.money, seeds: this.inventory.count("sproutberry_seed"), harvest: this.inventory.count("sproutberry"),
      selectedTool: this.selectedTool, objective: step.objective, message: this.message, progress: step.progress,
      day: this.day, timeText: this.formatTime(), sleepPrompt: this.sleepPrompt, transitioning: this.transitioning,
    };
    gameEvents.dispatchEvent(new CustomEvent("hud", { detail: hud }));
  }

  private say(message: string) { this.message = message; this.emitHud(); }
  private snapshot(): SaveData {
    return {
      version: 3, day: this.day, timeMinutes: this.timeMinutes, money: this.money, selectedTool: this.selectedTool,
      player: { x: this.player.x, y: this.player.y, facing: this.facing },
      inventory: this.inventory.serialize(), farm: [...this.farm.values()].map((tile) => ({ ...tile })), savedAt: Date.now(),
    };
  }
  private save(notify: boolean) { this.repository.save(this.snapshot()); if (notify) this.say("이 브라우저에 농장 상태를 저장했어요."); }
  private restore(data: SaveData, notify: boolean) {
    this.day = data.day; this.timeMinutes = data.timeMinutes; this.money = data.money; this.selectedTool = data.selectedTool;
    this.inventory = new Inventory(data.inventory); this.facing = data.player.facing; this.player.setPosition(data.player.x, data.player.y);
    for (const saved of data.farm) {
      const tile = this.farm.get(`${saved.x},${saved.y}`);
      if (tile) { Object.assign(tile, saved); this.renderTile(tile); }
    }
    this.lateNightWarned = this.timeMinutes >= GAME_CONFIG.day.lateNightMinutes;
    if (notify) this.message = "저장된 농장을 불러왔어요.";
    this.emitHud();
  }
}
