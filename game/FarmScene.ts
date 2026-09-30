import { applyQuestAction, questViews, recordNpcGreeting, type QuestAction } from "./quests/engine";
import { normalizeProgress, talkToNpc, relationshipLevel } from "./npc/progress";
import { nearestNpc, type DialogueView } from "./npc/dialogue";
import { NpcController } from "./npc/NpcController";
import { NPC_DEFINITIONS } from "./npc/definitions";
import { giftToNpc } from "./npc/gifts";
import { NpcRenderer, preloadNpcs, createNpcAssets } from "./npc/NpcRenderer";
import { RemotePlayers } from "./family/RemotePlayers";
import { FamilyClient } from "./family/client";
import { applyFamilyFarmSnapshot } from "./family/applySnapshot";
import type { FamilyPose, FamilySession, FamilySnapshot } from "./family/types";
import * as Phaser from "phaser";
import { gameEvents, type HudState, type ToolKey } from "./events";
import { advanceFarmDay, Inventory, LocalStorageSaveRepository, purchaseInventoryItem, type FarmTileData, type SaveData } from "./domain";
import { sellMarketGoods } from "./economy/sales";
import { FISH_DEFINITIONS } from "./fishing/definitions";
import { beginFishing, fishingSpotError, fishingStage, initialFishingProgress, normalizeFishingProgress, reelFishing } from "./fishing/system";
import type { FishingCast, FishingProgress } from "./fishing/types";
import { AssetManager } from "./assets/AssetManager";
import { DEFAULT_CHARACTER_VISUAL_PROFILE, displayedSize, physicsBoxForScale, type CharacterVisualProfile, type Facing } from "./assets/definitions";
import { WorldRenderer } from "./rendering/WorldRenderer";
import { ForestGatheringEffects } from "./rendering/ForestGatheringEffects";
import { forestFeedback } from "./forest/feedback";
import { GAME_CONFIG, START_WITH_HELP_OPEN } from "./config";
import { calendarDate, worldMinute } from "./world/calendar";
import { waterFarmForRain, weatherFor } from "./weather/system";
import { CROP_DEFINITIONS, DEFAULT_CROP_ID, isCropId, type CropId, getCropDefinition, isMatureCrop } from "./data/crops";
import { ITEM_DEFINITIONS } from "./data/items";
import { consumeFood, isFoodItemId } from "./data/food";
import { getRecipe } from "./crafting/definitions";
import { craft } from "./crafting/engine";
import { getToolUpgrade } from "./tools/definitions";
import { normalizeToolProgression, upgradeTool } from "./tools/progression";
import type { ToolProgression } from "./tools/types";
import { canPerformAction, initialPlayerStats, normalizePlayerStats, recordSuccessfulAction, restoreStamina } from "./player/stats";
import type { PlayerStats } from "./player/stats";
import { initialStorage, normalizeStorage, starterStorage, transferItem, transferItemsAtomically } from "./storage/container";
import { isContainerId } from "./storage/definitions";
import type { ContainerId, StorageData, StorageDirection, StorageTransfer } from "./storage/types";
import type { ItemId } from "./data/items";
import { initialPlaceables, normalizePlaceables, placeObject, placementError, removeObject } from "./placeables/system";
import type { PlaceablesData } from "./placeables/types";
import { startMachine, collectMachine } from "./machines/system";
import { buildingPlacementError, constructBuilding, initialBuildings, normalizeBuildings } from "./buildings/system";
import { BUILDING_DEFINITIONS } from "./buildings/definitions";
import type { BuildingsData } from "./buildings/types";
import type { BuildingId } from "./buildings/types";
import { advanceRanchDay, buyAnimal, collectAnimalProduce, feedCoop, initialRanchState, normalizeRanchState, petAnimal } from "./animals/system";
import type { RanchState } from "./animals/types";
import { FARM_EXPANSIONS, expansionTiles, initialFarmProgress, isFarmTile, normalizeFarmProgress, unlockExpansion } from "./farm/expansions";
import type { FarmProgress } from "./farm/expansions";
import { GENERAL_STORE_LISTINGS } from "./data/shop";
import { TILE_TYPE_DEFINITIONS, getTileTypeInMap, pointInTileRect, tilePoint } from "./maps/definitions";
import type { MapAction, MapId } from "./maps/types";
import { MapRegistry } from "./maps/MapRegistry";
import { FAIRY_FOREST_ID, recoverForestPosition } from "./forest/generation";
import { installFairyForest } from "./forest/registry";
import { emptyForestState, FOREST_RESOURCES, normalizeForestState, resourceKind, strikeForestNode, type ForestState } from "./forest/resources";
import { mineFloorFromMapId, mineMapId, MINE_PLAYABLE_FLOORS, recoverMinePosition } from "./mine/generation";
import { installMine } from "./mine/registry";
import { emptyMineDaily, initialMineProgress, MINE_RESOURCES, mineResourceKind, normalizeMineDaily, normalizeMineProgress, strikeMineNode } from "./mine/resources";
import type { MineDailyState, MineProgress } from "./mine/types";
import { PlayerAnimationController } from "./player/PlayerAnimationController";
import { PlayerActionVisuals } from "./player/PlayerActionVisuals";
import { facingActionPriority } from "./player/interaction";
import { ToolActionSystem } from "./actions/ToolActionSystem";
import { resolveToolTarget, type ToolInputSource, type ToolUseContext } from "./actions/ToolTargetResolver";
import { EMPTY_WATER_ACTION_DEFINITION, TOOL_ACTION_DEFINITIONS, WATER_REFILL_ACTION_DEFINITION } from "./actions/toolActionDefinitions";
import { facingFromMovement, mergeMovementInput, type MovementVector } from "./input/MovementInput";
import { isGameCanvasPointerEvent } from "./input/worldPointer";
import { clampCameraZoom, pinchCameraZoom, pointerDistance, wheelCameraZoom } from "./input/cameraZoom";
import { advanceRelationshipEvent, availableRelationshipEvents, completeRelationshipEvent, startRelationshipEvent } from "./relationship-events/system";
import type { RelationshipEventRunView } from "./relationship-events/types";
import { initialWateringCan, normalizeWateringCan, refillWateringCan, type WateringCanState } from "./tools/wateringCan";
import { emptyFarmTreeState, farmTreeIds, normalizeFarmTreeState, strikeFarmTree, type FarmTreeState } from "./farm/trees";
import { applyFarmToolEffect } from "./farm/toolBehavior";

export const REAL_MS_PER_GAME_MINUTE = GAME_CONFIG.day.realMsPerGameMinute;
type Command = { type: string; value?: unknown };
export interface FarmSceneOptions { maps?: MapRegistry; initialMapId?: MapId; testMode?: boolean; family?: FamilySession; playerVisualProfile?: CharacterVisualProfile }

export class FarmScene extends Phaser.Scene {
  private journalOpen = false;
  private dialogue?: DialogueView;
  private relationshipEvent?: RelationshipEventRunView;
  private playerProgress = normalizeProgress(null);
  private daySerial = 1;
  private npcRequest = false;
  private npcs!: NpcController;
  private npcRenderer!: NpcRenderer;
  private npcClockReceived = 0;
  private npcMinute = 360;
  private selectedCrop: CropId = DEFAULT_CROP_ID;
  private family?: FamilyClient;
  private sceneLive = false;
  private sleepTimer?: number;
  private remotePlayers?: RemotePlayers;
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private actionKey!: Phaser.Input.Keyboard.Key;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private obstacleCollider?: Phaser.Physics.Arcade.Collider;
  private farm = new Map<string, FarmTileData>();
  private farmTreeState: FarmTreeState = emptyFarmTreeState();
  private assetManager!: AssetManager;
  private worldRenderer!: WorldRenderer;
  private forestEffects!: ForestGatheringEffects;
  private playerAnimations!: PlayerAnimationController;
  private playerActionVisuals!: PlayerActionVisuals;
  private toolActions!: ToolActionSystem;
  private inventory = new Inventory();
  private toolProgression: ToolProgression = normalizeToolProgression(undefined);
  private stats: PlayerStats = initialPlayerStats();
  private wateringCan: WateringCanState = initialWateringCan();
  private fishingProgress: FishingProgress = initialFishingProgress();
  private fishingCast: FishingCast | null = null;
  private storage: StorageData = initialStorage();
  private storageOpen?: ContainerId;
  private storageBusy = false;
  private placeables: PlaceablesData = initialPlaceables();
  private buildings: BuildingsData = initialBuildings();
  private ranchState: RanchState = initialRanchState();
  private ranchOpen?: string;
  private ranchBusy = false;
  private farmProgress: FarmProgress = initialFarmProgress();
  private buildingOpen = false;
  private buildingMode = false;
  private buildingBusy = false;
  private buildingDefinitionId: BuildingId = "work_shed";
  private buildPreview?: Phaser.GameObjects.Rectangle;
  private placing = false;
  private machineOpen?: string;
  private machineBusy = false;
  private repository = new LocalStorageSaveRepository();
  private selectedTool: ToolKey = "hoe";
  private money: number = GAME_CONFIG.startingMoney;
  private day = 1;
  private timeMinutes = GAME_CONFIG.day.startMinutes;
  private timeAccumulator = 0;
  private facing: Facing = "down";
  private virtualMovement: MovementVector = { x: 0, y: 0 };
  private running = false;
  private leftShiftRunning = false;
  private readonly runKeyDownHandler = (event: KeyboardEvent) => {
    if (event.code === "ShiftLeft") this.leftShiftRunning = true;
  };
  private readonly runKeyUpHandler = (event: KeyboardEvent) => {
    if (event.code === "ShiftLeft") this.leftShiftRunning = false;
  };
  private readonly runBlurHandler = () => { this.leftShiftRunning = false; };
  private controlsEditing = false;
  private menuInputBlocked = false;
  private currentMapId: MapId;
  private readonly mapRegistry: MapRegistry;
  private forestDayInstalled = 0;
  private forestState: ForestState = emptyForestState(1);
  private sharedForestState: ForestState | null = null;
  private mineProgress: MineProgress = initialMineProgress();
  private mineDaily: MineDailyState = emptyMineDaily(1);
  private mineDayInstalled = 0;
  private readonly forestScope: string;
  private readonly testMode: boolean;
  private readonly playerVisualProfile: CharacterVisualProfile;
  private helpOpen = START_WITH_HELP_OPEN;
  private sleepPrompt = false;
  private shopOpen = false;
  private craftingOpen = false;
  private inventoryOpen = false;
  private toolNotice = "";
  private toolNoticeUntil = 0;
  private oreHintShown = false;
  private craftingBusy = false;
  private transitioning = false;
  private lateNightWarned = false;
  private lockedWarpId: string | null = null;
  private cameraZoom = GAME_CONFIG.cameraZoom;
  private touchPoints = new Map<number, { x:number; y:number; startX:number; startY:number; worldX:number; worldY:number; pinched:boolean }>();
  private pinchGesture?: { distance:number; zoom:number };
  private touchNavigation?: { worldX:number; worldY:number; action:boolean; startedAt:number };
  private message = "갈색 밭 가까이에서 괭이를 사용하세요.";
  private commandHandler = (event: Event) => this.handleCommand((event as CustomEvent<Command>).detail);

  constructor(options: FarmSceneOptions = {}) {
    super("FarmScene");
    this.mapRegistry = options.maps ?? new MapRegistry();
    this.testMode = options.testMode === true;
    this.playerVisualProfile = options.playerVisualProfile ?? DEFAULT_CHARACTER_VISUAL_PROFILE;
    this.forestScope = options.family?.room.id ?? "single";
    if (!this.testMode) { this.syncForest(); this.syncMine(); }
    this.currentMapId = this.mapRegistry.has(options.initialMapId ?? "farm") ? (options.initialMapId ?? "farm") : "farm";
    if (options.family && !this.testMode) this.family = new FamilyClient(options.family, (snapshot) => this.applyFamilySnapshot(snapshot), (message) => this.say(message));
  }
  preload() { this.assetManager = new AssetManager(this, this.playerVisualProfile); this.assetManager.preload(); preloadNpcs(this); }

  create() {
    this.sceneLive = true;
    this.npcs = new NpcController(NPC_DEFINITIONS, this.mapRegistry);
    createNpcAssets(this); this.npcRenderer = new NpcRenderer(this);
    this.assetManager ??= new AssetManager(this, this.playerVisualProfile);
    this.assetManager.createFallbackTextures(); this.assetManager.createPlayerAnimations();
    this.worldRenderer = new WorldRenderer(this, this.mapRegistry); this.buildFarm();
    this.forestEffects = new ForestGatheringEffects(this);
    const saved = this.testMode || this.family ? null : this.repository.load();
    const personal = this.family?.loadPersonal();
    if (personal) { this.currentMapId = personal.mapId; this.facing = personal.facing; this.selectedTool = personal.selectedTool; }
    if (saved) this.applySavedState(saved);
    else if (!this.family) {
      if (!this.testMode) this.storage = starterStorage();
      waterFarmForRain(this.farm.values(), weatherFor(this.forestScope, this.daySerial));
    }
    if (personal?.forestDaySerial && personal.mapId === FAIRY_FOREST_ID) this.daySerial = personal.forestDaySerial;
    this.syncForest();
    this.syncMine();
    const playerAsset = this.playerVisualProfile.asset;
    const playerSize = displayedSize(playerAsset);
    this.player = this.physics.add.sprite(0, 0, playerAsset.textureKey).setDisplaySize(playerSize.width, playerSize.height)
      .setOrigin(playerAsset.origin.x, playerAsset.origin.y).setDepth(20).setCollideWorldBounds(true);
    const box = physicsBoxForScale(playerAsset.collisionBox, { x: this.player.scaleX, y: this.player.scaleY });
    this.player.body!.setSize(box.width, box.height).setOffset(box.offsetX, box.offsetY);
    this.playerAnimations = new PlayerAnimationController(this.player, this.facing, this.playerVisualProfile);
    this.playerActionVisuals = new PlayerActionVisuals(this, this.player, this.playerAnimations);
    this.toolActions = new ToolActionSystem(this.playerActionVisuals, undefined, undefined, (active) => {
      if (active) {
        this.player.setVelocity(0, 0);
        this.running = false;
      }
    });
    this.loadMap(this.currentMapId, undefined, personal?.mapId === this.currentMapId ? personal : saved?.player.mapId === this.currentMapId ? saved.player : undefined);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN") as Record<string, Phaser.Input.Keyboard.Key>;
    this.actionKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    window.addEventListener("keydown", this.runKeyDownHandler);
    window.addEventListener("keyup", this.runKeyUpHandler);
    window.addEventListener("blur", this.runBlurHandler);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, _currentlyOver: Phaser.GameObjects.GameObject[], event: Event) => {
      if (!isGameCanvasPointerEvent(event?.target, this.game.canvas)) return;
      if (pointer.wasTouch) { this.touchPointerDown(pointer); return; }
      this.touchNavigation = undefined;
      this.useAtWorld(pointer.worldX, pointer.worldY, "pointer");
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) { this.touchPointerMove(pointer); return; }
      this.previewBuilding(pointer.worldX, pointer.worldY);
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => { if (pointer.wasTouch) this.touchPointerUp(pointer); });
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => { if (pointer.wasTouch) this.touchPointerUp(pointer, true); });
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], _dx: number, dy: number, _dz: number, event: WheelEvent) => {
      event?.preventDefault?.();
      this.setCameraZoom(wheelCameraZoom(this.cameraZoom, dy));
    });
    gameEvents.addEventListener("command", this.commandHandler);
    const cleanup = () => {
      if (!this.sceneLive) return;
      try { this.save(false); } catch { /* Continue cleanup if local storage is full. */ }
      if (this.sleepTimer !== undefined) window.clearTimeout(this.sleepTimer);
      this.sceneLive = false;
      this.touchPoints.clear(); this.touchNavigation = undefined; this.pinchGesture = undefined;
      this.playerActionVisuals.destroy();
      gameEvents.removeEventListener("command", this.commandHandler);
      window.removeEventListener("keydown", this.runKeyDownHandler);
      window.removeEventListener("keyup", this.runKeyUpHandler);
      window.removeEventListener("blur", this.runBlurHandler);
      if (this.family && this.storageOpen) void this.family.act({ kind:"storage-lock", containerId:this.storageOpen, acquire:false, pose:this.familyPose() });
      this.family?.stop(); this.remotePlayers?.destroy(); this.npcRenderer.destroy();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.time.addEvent({ delay: GAME_CONFIG.autoSaveIntervalMs, loop: true, callback: () => this.save(false) });
    if (this.family) {
      this.remotePlayers = new RemotePlayers(this, this.family.session.room.playerId);
      this.family.setPresence(() => this.familyPose(), (snapshot) => {
        this.remotePlayers?.receive(snapshot);
        gameEvents.dispatchEvent(new CustomEvent("family-presence", { detail: snapshot }));
      });
      this.family.start();
      void this.family.loadProgress().then(()=>{if(this.sceneLive)this.emitHud();}).catch(()=>{if(this.sceneLive)this.say("주민 기록을 불러올 수 없어요. 주민·의뢰 메뉴에서 다시 확인해 주세요.");});
    }
    this.emitHud();
  }

  update(_time: number, delta: number) {
    this.remotePlayers?.update(this.currentMapId, delta);
    if (this.toolNotice && performance.now() >= this.toolNoticeUntil) { this.toolNotice = ""; this.emitHud(); }
    if (!this.family && !this.isPaused()) this.advanceClock(delta);
    this.npcRenderer.update(this.npcs.sampleWorld(this.daySerial, this.npcTime()), this.currentMapId, this.familyPose(), this.family&&!this.family.progress?[]:questViews(this.family?.progress?.data??this.playerProgress,this.inventory), this.mapRegistry.require(this.currentMapId));
    if (this.isPaused()) { this.running = false; this.player.setVelocity(0, 0); this.playerAnimations.playMovement(this.facing, false); return; }
    if (this.toolActions.isActive()) {
      this.player.setVelocity(0, 0);
      this.playerAnimations.playMovement(this.facing, false);
      return;
    }
    if (!this.oreHintShown && !this.toolProgression.pickaxe && this.currentMapId === FAIRY_FOREST_ID) {
      const nearOre = this.mapRegistry.require(FAIRY_FOREST_ID).objects.some(o =>
        resourceKind(o) === "ore" && Math.hypot(o.position.tileX * GAME_CONFIG.tileSize - this.player.x, o.position.tileY * GAME_CONFIG.tileSize - this.player.y) <= 60);
      if (nearOre) { this.oreHintShown = true; this.announceTool("채광 바위에는 곡괭이가 필요해요. 집의 제작대에서 해금하세요."); }
    }
    const keyboard = {
      x: (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0) - (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0),
      y: (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0) - (this.cursors.up.isDown || this.wasd.W.isDown ? 1 : 0),
    };
    const manualMovement = mergeMovementInput(keyboard, this.virtualMovement);
    if (manualMovement.x || manualMovement.y) this.touchNavigation = undefined;
    const movement = manualMovement.x || manualMovement.y ? manualMovement : this.touchNavigationMovement();
    this.facing = facingFromMovement(movement, this.facing);
    const movementSpeed = GAME_CONFIG.playerSpeed * (this.running || this.leftShiftRunning ? 1.65 : 1);
    this.player.setVelocity(movement.x * movementSpeed, movement.y * movementSpeed);
    this.playerAnimations.playMovement(this.facing, Boolean(movement.x || movement.y));
    if (Phaser.Input.Keyboard.JustDown(this.actionKey)) this.useFacingTile();
    if (Phaser.Input.Keyboard.JustDown(this.wasd.ONE)) this.selectTool("hoe");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.TWO)) this.selectTool("seed");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.THREE)) this.selectTool("water");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.FOUR)) this.selectTool("hand");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.FIVE)) this.selectTool("axe");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.SIX)) this.selectTool("pickaxe");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.SEVEN)) this.selectTool("fishing_rod");
    this.checkWarp();
  }

  private npcTime() { return this.family ? Math.min(GAME_CONFIG.day.endMinutes, this.npcMinute + Math.min(2000, Math.max(0, performance.now()-this.npcClockReceived))/REAL_MS_PER_GAME_MINUTE) : this.timeMinutes + this.timeAccumulator/REAL_MS_PER_GAME_MINUTE; }
  private isPaused() { return this.controlsEditing || this.menuInputBlocked || this.inventoryOpen || !!this.storageOpen || !!this.machineOpen || !!this.ranchOpen || this.buildingOpen || this.journalOpen || !!this.dialogue || this.helpOpen || this.sleepPrompt || this.shopOpen || this.craftingOpen || this.transitioning; }
  private advanceClock(delta: number) {
    this.timeAccumulator += delta;
    const elapsed = Math.floor(this.timeAccumulator / REAL_MS_PER_GAME_MINUTE);
    if (!elapsed) return;
    this.timeAccumulator -= elapsed * REAL_MS_PER_GAME_MINUTE;
    const previous = this.timeMinutes; this.timeMinutes = Math.min(GAME_CONFIG.day.endMinutes, this.timeMinutes + elapsed);
    this.placeables = normalizePlaceables(this.placeables, worldMinute(this.daySerial, this.timeMinutes));
    if (!this.lateNightWarned && previous < GAME_CONFIG.day.lateNightMinutes && this.timeMinutes >= GAME_CONFIG.day.lateNightMinutes) {
      this.lateNightWarned = true; this.say("밤이 깊었습니다. 집으로 돌아가 쉬는 것이 좋겠습니다.");
    } else this.emitHud();
  }

  private buildFarm() {
    for (const area of this.mapRegistry.require("farm").farmAreas) for (let y = area.startY; y <= area.endY; y++) for (let x = area.startX; x <= area.endX; x++) {
      this.farm.set(`${x},${y}`, { x, y, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null });
    }
  }

  private setCameraZoom(value: number) {
    this.cameraZoom = clampCameraZoom(value);
    this.cameras.main.setZoom(this.cameraZoom);
  }

  private touchPointerDown(pointer: Phaser.Input.Pointer) {
    this.touchPoints.set(pointer.id, {
      x:pointer.x, y:pointer.y, startX:pointer.x, startY:pointer.y,
      worldX:pointer.worldX, worldY:pointer.worldY, pinched:false,
    });
    if (this.touchPoints.size >= 2) {
      const [a,b] = [...this.touchPoints.values()].slice(0,2);
      a.pinched = true; b.pinched = true;
      this.pinchGesture = { distance: Math.max(1, pointerDistance(a,b)), zoom: this.cameraZoom };
      this.touchNavigation = undefined;
    }
  }

  private touchPointerMove(pointer: Phaser.Input.Pointer) {
    const touch = this.touchPoints.get(pointer.id);
    if (!touch) return;
    touch.x=pointer.x; touch.y=pointer.y; touch.worldX=pointer.worldX; touch.worldY=pointer.worldY;
    if (Math.hypot(touch.x-touch.startX,touch.y-touch.startY)>10) {
      // A moving finger is either a pinch participant or a cancelled tap.
    }
    if (this.touchPoints.size >= 2) {
      const [a,b] = [...this.touchPoints.values()].slice(0,2);
      a.pinched = true; b.pinched = true;
      this.pinchGesture ??= { distance: Math.max(1,pointerDistance(a,b)), zoom:this.cameraZoom };
      this.setCameraZoom(pinchCameraZoom(this.pinchGesture.zoom,this.pinchGesture.distance,pointerDistance(a,b)));
    }
  }

  private touchPointerUp(pointer: Phaser.Input.Pointer, cancelled=false) {
    const touch = this.touchPoints.get(pointer.id);
    if (!touch) return;
    this.touchPoints.delete(pointer.id);
    if (this.touchPoints.size < 2) this.pinchGesture = undefined;
    const moved = Math.hypot(touch.x-touch.startX,touch.y-touch.startY)>12;
    if (!cancelled && !touch.pinched && !moved) this.queueTouchNavigation(touch.worldX,touch.worldY);
  }

  private faceToward(worldX:number, worldY:number) {
    const dx=worldX-this.player.x, dy=worldY-this.player.y;
    if (Math.abs(dx)>Math.abs(dy)) this.facing=dx<0?"left":"right";
    else if (Math.abs(dy)>1) this.facing=dy<0?"up":"down";
  }

  private tappedNpc(worldX:number, worldY:number) {
    return this.npcs.sampleWorld(this.daySerial,this.npcTime())
      .filter(n=>n.mapId===this.currentMapId && Math.hypot(n.x-worldX,n.y-worldY)<=34)
      .sort((a,b)=>Math.hypot(a.x-worldX,a.y-worldY)-Math.hypot(b.x-worldX,b.y-worldY))[0];
  }

  private contextualTouchTool(worldX:number, worldY:number): ToolKey | null {
    const map=this.mapRegistry.require(this.currentMapId);
    const tx=Math.floor(worldX/GAME_CONFIG.tileSize), ty=Math.floor(worldY/GAME_CONFIG.tileSize);
    if (this.currentMapId==="farm") {
      const treeContext=resolveToolTarget({tool:"axe",facing:this.facing,mapId:"farm",inputSource:"mobile",
        player:{x:this.player.x,y:this.player.y},playerAnchor:this.playerAnimations.playerInteractionAnchor(),
        targetWorld:{x:worldX,y:worldY},map,farmTreeState:this.farmTreeState});
      if (treeContext.targetKind==="farm_tree") return "axe";
      const tile=this.farm.get(`${tx},${ty}`);
      if (tile) {
        if (tile.cropType && tile.cropStage!==null && isMatureCrop(tile.cropType,tile.cropStage)) return "hand";
        if (tile.cropStage!==null && !tile.wateredToday) return "water";
        if (!tile.tilled) return "hoe";
        if (tile.cropStage===null && this.inventory.count(getCropDefinition(this.selectedCrop).seedItemId)>0) return "seed";
        if (!tile.wateredToday) return "water";
        return this.selectedTool;
      }
    }
    if (this.currentMapId===FAIRY_FOREST_ID) {
      for (const tool of ["axe","pickaxe","hand"] as const) {
        const context=resolveToolTarget({tool,facing:this.facing,mapId:this.currentMapId,inputSource:"mobile",
          player:{x:this.player.x,y:this.player.y},playerAnchor:this.playerAnimations.playerInteractionAnchor(),
          targetWorld:{x:worldX,y:worldY},map});
        if (context.targetKind==="forest_resource") {
          const object=map.objects.find(o=>o.id===context.targetObjectId), kind=object&&resourceKind(object);
          if (kind && FOREST_RESOURCES[kind].tool===tool) return tool;
        }
      }
    }
    if (mineFloorFromMapId(this.currentMapId)!==null) {
      const context=resolveToolTarget({tool:"pickaxe",facing:this.facing,mapId:this.currentMapId,inputSource:"mobile",
        player:{x:this.player.x,y:this.player.y},playerAnchor:this.playerAnimations.playerInteractionAnchor(),
        targetWorld:{x:worldX,y:worldY},map});
      if (context.targetKind==="mine_resource") return "pickaxe";
    }
    if (tx>=0&&ty>=0&&tx<map.width&&ty<map.height&&getTileTypeInMap(map,tx,ty)==="water") {
      return this.selectedTool==="fishing_rod" ? "fishing_rod" : "water";
    }
    return null;
  }

  private touchActionAvailable(worldX:number, worldY:number) {
    const map=this.mapRegistry.require(this.currentMapId);
    if (map.objects.some(o=>o.interaction&&pointInTileRect(worldX,worldY,o.interaction.area))) return true;
    if (this.placeables.instances.some(p=>p.mapId===this.currentMapId&&Math.hypot(worldX-(p.tileX+.5)*GAME_CONFIG.tileSize,worldY-(p.tileY+.5)*GAME_CONFIG.tileSize)<=34)) return true;
    if (this.tappedNpc(worldX,worldY)) return true;
    return this.contextualTouchTool(worldX,worldY)!==null;
  }

  private queueTouchNavigation(worldX:number, worldY:number) {
    if (this.isPaused()||this.toolActions.isActive()) return;
    const map=this.mapRegistry.require(this.currentMapId);
    const margin=8;
    const x=Phaser.Math.Clamp(worldX,margin,map.width*GAME_CONFIG.tileSize-margin);
    const y=Phaser.Math.Clamp(worldY,margin,map.height*GAME_CONFIG.tileSize-margin);
    this.touchNavigation={worldX:x,worldY:y,action:this.touchActionAvailable(x,y),startedAt:performance.now()};
  }

  private performContextualTouchAction(worldX:number, worldY:number) {
    this.faceToward(worldX,worldY);
    if (this.buildingMode || this.placing) { this.useAtWorld(worldX,worldY,"mobile"); return; }
    if (this.openMachineAt(worldX,worldY) || this.openRanchAt(worldX,worldY)) return;
    const map=this.mapRegistry.require(this.currentMapId);
    const object=map.objects.find(o=>o.interaction&&pointInTileRect(worldX,worldY,o.interaction.area));
    if (object?.interaction) { this.performWorldAction(object.interaction.action,object.interaction.containerId); return; }
    const tapped=this.tappedNpc(worldX,worldY);
    if (tapped) {
      const near=nearestNpc(this.npcs.sampleWorld(this.daySerial,this.npcTime()),this.familyPose(),map);
      if (near?.npcId===tapped.npcId) { this.openNpcDialogue(tapped.npcId); return; }
    }
    const tool=this.contextualTouchTool(worldX,worldY);
    if (tool) {
      if (this.selectedTool!==tool) { this.selectedTool=tool; this.emitHud(); }
      this.useAtWorld(worldX,worldY,"mobile");
    }
  }

  private touchNavigationMovement(): MovementVector {
    const nav=this.touchNavigation;
    if (!nav) return {x:0,y:0};
    if (performance.now()-nav.startedAt>8000) { this.touchNavigation=undefined; return {x:0,y:0}; }
    const dx=nav.worldX-this.player.x, dy=nav.worldY-this.player.y, distance=Math.hypot(dx,dy);
    const stopDistance=nav.action?64:8;
    if (distance<=stopDistance) {
      this.touchNavigation=undefined;
      this.player.setVelocity(0,0);
      if (nav.action) this.performContextualTouchAction(nav.worldX,nav.worldY);
      return {x:0,y:0};
    }
    return distance>0?{x:dx/distance,y:dy/distance}:{x:0,y:0};
  }

  private loadMap(mapId: MapId, spawnId?: string, position?: { x: number; y: number; facing: Facing }) {
    if (mapId === FAIRY_FOREST_ID) this.syncForest();
    if (mineFloorFromMapId(mapId) !== null) this.syncMine();
    this.currentMapId = mapId;
    this.buildingMode = false; this.buildPreview?.setVisible(false);
    const map = this.mapRegistry.require(mapId), width = map.width * GAME_CONFIG.tileSize, height = map.height * GAME_CONFIG.tileSize;
    const hiddenObjects = mapId === "farm" ? new Set(this.farmTreeState.depleted) : undefined;
    this.obstacleCollider?.destroy(); this.obstacles = this.worldRenderer.renderMap(mapId, this.farm.values(), hiddenObjects);
    this.worldRenderer.renderPlaceables(this.placeables.instances);
    this.worldRenderer.renderBuildings(this.buildings.instances);
    this.worldRenderer.renderAnimals(this.ranchState.animals, this.buildings.instances);
    if (mapId === FAIRY_FOREST_ID) this.worldRenderer.renderForestHits((this.family ? this.sharedForestState : this.forestState)?.hits ?? {});
    if (mapId === "farm") this.worldRenderer.renderFarmTreeHits(this.farmTreeState.hits);
    const mineFloor = mineFloorFromMapId(mapId);
    if (mineFloor !== null) this.worldRenderer.renderMineHits(this.mineDaily.floors[mineFloor]?.hits ?? {});
    this.physics.world.setBounds(0, 0, width, height); this.cameras.main.setBounds(0, 0, width, height);
    this.obstacleCollider = this.physics.add.collider(this.player, this.obstacles);
    const spawn = map.spawns.find((entry) => entry.id === spawnId) ?? map.spawns[0];
    if (position) {
      const fallback = tilePoint(spawn.tileX, spawn.tileY);
      const safe = mineFloor !== null ? recoverMinePosition(map, position) : recoverForestPosition(map, position, fallback);
      this.player.setPosition(Phaser.Math.Clamp(safe.x, GAME_CONFIG.tileSize, width - GAME_CONFIG.tileSize), Phaser.Math.Clamp(safe.y, GAME_CONFIG.tileSize, height - GAME_CONFIG.tileSize));
      this.facing = position.facing;
    }
    else { const point = tilePoint(spawn.tileX, spawn.tileY); this.player.setPosition(point.x, point.y); this.facing = spawn.facing; }
    this.cameras.main.startFollow(this.player, true, GAME_CONFIG.cameraFollowLerp, GAME_CONFIG.cameraFollowLerp).setZoom(this.cameraZoom);
    this.lockedWarpId = map.warps.find((warp) => pointInTileRect(this.player.x, this.player.y, warp.area))?.id ?? null;
    this.message = `${map.name}에 도착했어요.`; this.save(false); this.emitHud();
  }

  private checkWarp() {
    const active = this.mapRegistry.require(this.currentMapId).warps.find((warp) => pointInTileRect(this.player.x, this.player.y, warp.area));
    if (!active) { this.lockedWarpId = null; return; }
    if (this.lockedWarpId === active.id) return;
    const destination = mineFloorFromMapId(active.targetMapId);
    if (active.id === "mine_down") {
      if (destination === null || destination > MINE_PLAYABLE_FLOORS) { this.lockedWarpId = active.id; this.say("5층 이후는 아직 막혀 있어요."); return; }
      if (destination > this.mineProgress.deepestUnlockedFloor) { this.lockedWarpId = active.id; this.say("사다리 바위를 캐면 다음 층으로 내려갈 수 있어요."); return; }
    }
    this.loadMap(active.targetMapId, active.targetSpawnId);
  }

  private useFacingTile(inputSource: "keyboard" | "mobile" = "keyboard") {
    if(this.isPaused()||this.npcRequest||this.toolActions.isActive()) return;
    const point = this.playerAnimations.interactionPoint(this.facing);
    if (this.buildingMode) { this.buildAt(point.x, point.y); return; }
    if (this.placing) { this.placeAt(point.x, point.y); return; }
    const context = this.resolveToolUseContext(point.x, point.y, inputSource);
    const toolTarget = this.hasResolvedToolEffect(context);
    if (toolTarget) { this.useResolvedAtWorld(context); return; }
    if (this.openMachineAt(point.x, point.y)) return;
    if (this.openRanchAt(point.x, point.y)) return;
    const object = context.targetKind === "interactive"
      ? this.mapRegistry.require(this.currentMapId).objects.find((entry) => entry.id === context.targetObjectId)
      : undefined;
    const npc=nearestNpc(this.npcs.sampleWorld(this.daySerial,this.npcTime()),this.familyPose(),this.mapRegistry.require(this.currentMapId));
    const priority = facingActionPriority({ toolTarget, interactive: Boolean(object?.interaction), npc: Boolean(npc) });
    if (priority === "interactive" && object?.interaction) { this.performWorldAction(object.interaction.action, object.interaction.containerId); return; }
    if (priority === "npc" && npc) { this.openNpcDialogue(npc.npcId); return; }
    if (this.selectedTool === "fishing_rod") { this.useFishing(context); return; }
    this.useResolvedAtWorld(context);
  }

  private resolveToolUseContext(worldX: number, worldY: number, inputSource: ToolInputSource): ToolUseContext {
    const map = this.mapRegistry.require(this.currentMapId);
    const targetX = Math.floor(worldX / GAME_CONFIG.tileSize), targetY = Math.floor(worldY / GAME_CONFIG.tileSize);
    return resolveToolTarget({
      tool: this.selectedTool,
      facing: this.facing,
      mapId: this.currentMapId,
      inputSource,
      player: { x: this.player.x, y: this.player.y },
      playerAnchor: this.playerAnimations.playerInteractionAnchor(),
      targetWorld: { x: worldX, y: worldY },
      map,
      farmTile: this.currentMapId === "farm" ? this.farm.get(`${targetX},${targetY}`) : undefined,
      farmTreeState: this.currentMapId === "farm" ? this.farmTreeState : undefined,
      fishingWaterValid: this.selectedTool === "fishing_rod" && fishingSpotError(this.fishingCast?.spotId ?? "farm_pond", this.familyPose()) === null,
    });
  }

  private hasResolvedToolEffect(context: ToolUseContext): boolean {
    if (context.targetKind === "water_source") return context.tool === "water";
    if (context.targetKind === "farm_tree") return context.tool === "axe";
    if (context.targetKind === "mine_resource") return context.tool === "pickaxe";
    if (context.targetKind === "fishing_water") return context.tool === "fishing_rod";
    if (context.targetKind === "forest_resource") {
      const object = this.mapRegistry.require(context.mapId).objects.find((entry) => entry.id === context.targetObjectId);
      const kind = object && resourceKind(object);
      return Boolean(kind && FOREST_RESOURCES[kind].tool === context.tool);
    }
    if (context.targetKind !== "farm_tile") return false;
    if (["hoe", "seed", "water", "pickaxe"].includes(context.tool)) return true;
    const tile = this.farm.get(`${context.targetTile.x},${context.targetTile.y}`);
    return context.tool === "hand" && Boolean(tile?.cropType && tile.cropStage !== null && isMatureCrop(tile.cropType, tile.cropStage));
  }

  private familyPoseForTool(context: ToolUseContext): FamilyPose {
    return {
      mapId: context.mapId,
      x: context.player.x,
      y: context.player.y,
      facing: context.facing,
      selectedTool: context.tool,
      moving: false,
    };
  }

  private async openNpcDialogue(npcId:string) {
    if(this.npcRequest)return;
    this.npcRequest=true;this.virtualMovement={x:0,y:0};this.player.setVelocity(0,0);this.emitHud();
    try {
      if(this.family){const result=await this.family.npcAction({kind:"talk",npcId},this.familyPose());if(!this.sceneLive)return;if(result)this.dialogue=result.dialogue;}
      else {this.dialogue=talkToNpc(this.playerProgress,npcId,this.day,this.timeMinutes,this.daySerial);recordNpcGreeting(this.playerProgress,npcId);this.save(false);}
    }finally{this.npcRequest=false;if(this.sceneLive)this.emitHud();}
  }
  private async questAction(action:QuestAction) {
    if(!this.dialogue||this.npcRequest)return;
    const view=questViews(this.family?.progress?.data??this.playerProgress,this.inventory).find(q=>q.id===action.questId);
    if(!view||view.giver!==this.dialogue.npcId)return;
    this.npcRequest=true;this.dialogue.notice=undefined;this.emitHud();
    try{
      if(this.family){const result=await this.family.npcAction(action,this.familyPose());if(result&&this.sceneLive)this.say("의뢰 기록을 반영했어요.");}
      else {this.money=applyQuestAction(this.playerProgress,this.inventory,this.money,action);this.save(false);}
    }catch(error){this.say(error instanceof Error?error.message:"의뢰를 확인해 주세요.");}
    finally{this.npcRequest=false;if(this.sceneLive)this.emitHud();}
  }
  private relationshipEventContext() {
    return { daySerial:this.daySerial,timeMinutes:this.npcTime(),mapId:this.currentMapId,weather:weatherFor(this.forestScope,this.daySerial).id } as const;
  }
  private async giftAction(itemId:ItemId) {
    if(!this.dialogue||this.dialogue.eventId||this.npcRequest)return;
    const npcId=this.dialogue.npcId;this.npcRequest=true;this.dialogue.notice=undefined;this.emitHud();
    try {
      if(this.family){
        const result=await this.family.npcAction({kind:"gift",npcId,itemId},this.familyPose());
        if(result&&this.sceneLive&&this.dialogue?.npcId===npcId&&!this.dialogue.eventId)this.dialogue.notice=result.notice;
      }else{
        const result=giftToNpc(this.playerProgress,this.inventory,npcId,itemId,this.daySerial);
        if(result.error)throw new Error(result.error);
        this.dialogue.notice=result.preference==="loved"?`정말 좋아하는 선물이에요! 호감도 +${result.points}`:result.preference==="disliked"?"마음은 고맙지만 취향에는 맞지 않았어요.":`고마워요! 호감도 +${result.points}`;
        this.save(false);
      }
    }catch(error){this.say(error instanceof Error?error.message:"선물을 건넬 수 없어요.");}
    finally{this.npcRequest=false;if(this.sceneLive)this.emitHud();}
  }
  private eventDialogue(view:RelationshipEventRunView):DialogueView {
    return {npcId:view.npcId,name:view.name,image:view.image,lines:view.lines,index:view.index,eventId:view.eventId,eventTitle:view.title};
  }
  private async startRelationshipEventFlow(eventId:string) {
    if(!this.dialogue||this.dialogue.eventId||this.npcRequest)return;
    this.npcRequest=true;this.dialogue.notice=undefined;this.emitHud();
    try {
      if(this.family){
        const result=await this.family.npcAction({kind:"event-start",eventId},this.familyPose());
        if(result?.event&&this.sceneLive&&this.dialogue?.npcId===result.event.npcId&&!this.dialogue.eventId){this.relationshipEvent=result.event;this.dialogue=this.eventDialogue(result.event);}
      }else{
        const result=startRelationshipEvent(this.playerProgress,eventId,this.relationshipEventContext());
        if(result.error||!result.event)throw new Error(result.error??"관계 이벤트를 시작할 수 없어요.");
        this.relationshipEvent=result.event;this.dialogue=this.eventDialogue(result.event);this.save(false);
      }
    }catch(error){this.say(error instanceof Error?error.message:"관계 이벤트를 시작할 수 없어요.");}
    finally{this.npcRequest=false;if(this.sceneLive)this.emitHud();}
  }
  private async completeRelationshipEventFlow() {
    const active=this.relationshipEvent;if(!active||this.npcRequest)return;
    this.npcRequest=true;this.emitHud();
    try {
      if(this.family){const result=await this.family.npcAction({kind:"event-complete",eventId:active.eventId},this.familyPose());if(!result)return;}
      else {const error=completeRelationshipEvent(this.playerProgress,active.eventId);if(error)throw new Error(error);this.save(false);}
      this.relationshipEvent=undefined;this.dialogue=undefined;this.say("관계 이벤트를 완료했어요.");
    }catch(error){this.say(error instanceof Error?error.message:"관계 이벤트를 완료할 수 없어요.");}
    finally{this.npcRequest=false;if(this.sceneLive)this.emitHud();}
  }
  private performWorldAction(action: MapAction, containerId?: ContainerId) {
    if (action === "sleep") this.askToSleep();
    else if (action === "open_shop") { this.shopOpen = true; this.say("새봄 상점입니다. 필요한 씨앗을 골라 보세요."); }
    else if (action === "craft") { this.craftingOpen = true; this.virtualMovement = { x: 0, y: 0 }; this.player.setVelocity(0, 0); this.say("제작대에서 재료를 가공할 수 있어요."); }
    else if (action === "storage" && containerId && isContainerId(containerId)) this.openStorage(containerId);
    else if (action === "sell") this.sellHarvest();
  }

  private openMachineAt(x: number, y: number): boolean {
    const instance = this.placeables.instances.find(p => p.mapId === this.currentMapId &&
      Math.abs(x - (p.tileX + .5) * GAME_CONFIG.tileSize) <= 24 && Math.abs(y - (p.tileY + .5) * GAME_CONFIG.tileSize) <= 24);
    if (!instance) return false;
    if (Math.hypot(this.player.x - (instance.tileX + .5) * GAME_CONFIG.tileSize, this.player.y - (instance.tileY + .5) * GAME_CONFIG.tileSize) > 70) {
      this.say("기계 가까이에서 이용해 주세요."); return true;
    }
    this.machineOpen = instance.id; this.virtualMovement = { x: 0, y: 0 }; this.player.setVelocity(0, 0); this.say("목재 가공기의 상태를 확인하세요.");
    return true;
  }

  private openRanchAt(x: number, y: number): boolean {
    const coop = this.buildings.instances.find(b => {
      if (b.mapId !== this.currentMapId || b.definitionId !== "chicken_coop" || b.status !== "ready") return false;
      const def = BUILDING_DEFINITIONS[b.definitionId];
      return x >= b.tileX * GAME_CONFIG.tileSize - 16 && x <= (b.tileX + def.footprint.width) * GAME_CONFIG.tileSize + 16 &&
        y >= b.tileY * GAME_CONFIG.tileSize - 16 && y <= (b.tileY + def.footprint.height) * GAME_CONFIG.tileSize + 32;
    });
    if (!coop) return false;
    const def = BUILDING_DEFINITIONS[coop.definitionId], centerX = (coop.tileX + def.footprint.width / 2) * GAME_CONFIG.tileSize;
    const centerY = (coop.tileY + def.footprint.height / 2) * GAME_CONFIG.tileSize;
    if (Math.hypot(this.player.x - centerX, this.player.y - centerY) > 150) { this.say("닭장 가까이에서 돌봐 주세요."); return true; }
    this.ranchOpen = coop.id; this.virtualMovement = { x: 0, y: 0 }; this.player.setVelocity(0, 0); this.say("닭장 상태를 확인하세요.");
    return true;
  }

  private ranchAction(kind: "animal-buy" | "animal-feed" | "animal-pet" | "animal-collect", animalId?: string) {
    if (!this.ranchOpen || this.ranchBusy) return;
    const home = this.buildings.instances.find(b => b.id === this.ranchOpen && b.definitionId === "chicken_coop" && b.status === "ready");
    if (!home) { this.ranchOpen = undefined; this.say("닭장을 찾을 수 없어요."); return; }
    if (this.family) {
      this.ranchBusy = true; this.emitHud();
      const action = kind === "animal-buy" ? { kind, species: "chicken" as const, homeBuildingId: home.id, pose: this.familyPose() } :
        kind === "animal-feed" ? { kind, homeBuildingId: home.id, pose: this.familyPose() } : { kind, animalId: animalId!, pose: this.familyPose() };
      void this.family.act(action).finally(() => { if (this.sceneLive) { this.ranchBusy = false; this.emitHud(); } });
      return;
    }
    let error: string | null = null;
    if (kind === "animal-buy") {
      const result = buyAnimal(this.ranchState, this.buildings, this.money, "chicken", home.id, crypto.randomUUID(), this.daySerial);
      error = result.error; if (!error) this.money = result.money;
    } else if (kind === "animal-feed") error = feedCoop(this.ranchState, this.buildings, this.inventory, home.id, this.daySerial);
    else if (kind === "animal-pet") error = petAnimal(this.ranchState, animalId, this.daySerial);
    else error = collectAnimalProduce(this.ranchState, this.inventory, animalId);
    if (error) { this.say(error); return; }
    this.worldRenderer.renderAnimals(this.ranchState.animals, this.buildings.instances);
    this.save(false); this.say(kind === "animal-buy" ? "새 닭이 가족이 되었어요." : kind === "animal-feed" ? "닭들에게 먹이를 주었어요." : kind === "animal-pet" ? "닭을 쓰다듬었어요. 친밀도가 올랐습니다." : "달걀을 가방에 담았어요.");
  }

  private previewBuilding(worldX: number, worldY: number) {
    if (!this.buildingMode || this.currentMapId !== "farm") { this.buildPreview?.setVisible(false); return; }
    const tileX = Math.floor(worldX / GAME_CONFIG.tileSize), tileY = Math.floor(worldY / GAME_CONFIG.tileSize);
    const def = BUILDING_DEFINITIONS[this.buildingDefinitionId];
    const valid = !buildingPlacementError(this.buildings, this.placeables, [...this.farm.values()], this.mapRegistry.require("farm"),
      def.id, tileX, tileY, [this.familyPose()]) && this.money >= def.cost.money && def.cost.materials.every(m => this.inventory.count(m.itemId) >= m.quantity);
    this.buildPreview ??= this.add.rectangle(0, 0, def.footprint.width * GAME_CONFIG.tileSize,
      def.footprint.height * GAME_CONFIG.tileSize, 0x50b879, .36).setDepth(18);
    this.buildPreview.setPosition((tileX + def.footprint.width / 2) * GAME_CONFIG.tileSize,
      (tileY + def.footprint.height / 2) * GAME_CONFIG.tileSize).setFillStyle(valid ? 0x50b879 : 0xdb6257, .36).setVisible(true);
  }

  private buildAt(worldX: number, worldY: number) {
    if (!this.buildingMode || this.buildingBusy || this.currentMapId !== "farm") return;
    const tileX = Math.floor(worldX / GAME_CONFIG.tileSize), tileY = Math.floor(worldY / GAME_CONFIG.tileSize);
    const buildingDefinition = BUILDING_DEFINITIONS[this.buildingDefinitionId];
    if (Math.hypot(this.player.x - (tileX + buildingDefinition.footprint.width / 2) * GAME_CONFIG.tileSize,
      this.player.y - (tileY + buildingDefinition.footprint.height / 2) * GAME_CONFIG.tileSize) > 150) {
      this.say("건설할 위치 가까이에서 선택해 주세요."); return;
    }
    const error = buildingPlacementError(this.buildings, this.placeables, [...this.farm.values()], this.mapRegistry.require("farm"),
      this.buildingDefinitionId, tileX, tileY, [this.familyPose()]);
    if (error) { this.say(error); return; }
    if (this.family) {
      this.buildingBusy = true; this.emitHud();
      void this.family.act({ kind: "build", definitionId: this.buildingDefinitionId, tileX, tileY, pose: this.familyPose() })
        .then(ok => { if (ok && this.sceneLive) { this.buildingMode = false; this.buildPreview?.setVisible(false); this.say(`${BUILDING_DEFINITIONS[this.buildingDefinitionId].name}을(를) 건설했어요.`); } })
        .finally(() => { if (this.sceneLive) { this.buildingBusy = false; this.emitHud(); } });
      return;
    }
    const result = constructBuilding(this.buildings, this.placeables, [...this.farm.values()], this.inventory, this.money,
      this.mapRegistry.require("farm"), this.buildingDefinitionId, tileX, tileY, [this.familyPose()], crypto.randomUUID(), this.daySerial);
    if (result.error) { this.say(result.error); return; }
    this.money = result.money; this.buildingMode = false; this.buildPreview?.setVisible(false); this.worldRenderer.renderBuildings(this.buildings.instances);
    this.worldRenderer.renderAnimals(this.ranchState.animals, this.buildings.instances);
    this.save(false); this.say(`${BUILDING_DEFINITIONS[this.buildingDefinitionId].name}을(를) 건설했어요.`);
  }

  private expandFarm() {
    if (!this.buildingOpen || this.buildingBusy || this.currentMapId !== "farm") return;
    const area = FARM_EXPANSIONS.south_plot.area;
    if (Math.hypot(this.player.x - (area.startX + area.endX + 1) * GAME_CONFIG.tileSize / 2,
      this.player.y - (area.startY + area.endY + 1) * GAME_CONFIG.tileSize / 2) > 150) { this.say("남쪽 작은 밭 가까이에서 확장해 주세요."); return; }
    if (this.family) {
      this.buildingBusy = true; this.emitHud();
      void this.family.act({ kind: "farm-expand", expansionId: "south_plot", pose: this.familyPose() })
        .then(ok => { if (ok && this.sceneLive) this.say("남쪽 작은 밭을 열었어요."); })
        .finally(() => { if (this.sceneLive) { this.buildingBusy = false; this.emitHud(); } });
      return;
    }
    const tiles = [...this.farm.values()];
    const result = unlockExpansion(this.farmProgress, tiles, this.inventory, this.money, "south_plot", this.placeables, this.buildings);
    if (result.error) { this.say(result.error); return; }
    this.money = result.money;
    for (const tile of tiles) if (!this.farm.has(`${tile.x},${tile.y}`)) { this.farm.set(`${tile.x},${tile.y}`, tile); this.worldRenderer.renderFarmTile(tile); }
    waterFarmForRain(this.farm.values(), weatherFor(this.forestScope, this.daySerial));
    this.save(false); this.say("남쪽 작은 밭을 열었어요.");
  }

  private placeAt(worldX: number, worldY: number) {
    if (!this.placing || this.machineBusy || this.currentMapId !== "farm") { this.say("농장에 배치해 주세요."); return; }
    const x = Math.floor(worldX / GAME_CONFIG.tileSize), y = Math.floor(worldY / GAME_CONFIG.tileSize);
    if (Math.hypot(this.player.x - (x + .5) * GAME_CONFIG.tileSize, this.player.y - (y + .5) * GAME_CONFIG.tileSize) > 90) {
      this.say("가까운 칸을 선택해 주세요."); return;
    }
    const error = placementError(this.placeables, "wood_processor", this.mapRegistry.require("farm"), x, y, [this.familyPose()], this.buildings);
    if (error) { this.say(error); return; }
    if (this.family) {
      this.machineBusy = true; this.emitHud();
      void this.family.act({ kind: "place", definitionId: "wood_processor", tileX: x, tileY: y, pose: this.familyPose() })
        .then(ok => { if (ok && this.sceneLive) { this.placing = false; this.say("목재 가공기를 배치했어요."); } })
        .finally(() => { if (this.sceneLive) { this.machineBusy = false; this.emitHud(); } });
      return;
    }
    const result = placeObject(this.placeables, this.inventory, "wood_processor", this.mapRegistry.require("farm"), x, y, [this.familyPose()], crypto.randomUUID(), this.buildings);
    if (result) { this.say(result); return; }
    this.placing = false; this.worldRenderer.renderPlaceables(this.placeables.instances); this.save(false); this.say("목재 가공기를 배치했어요.");
  }

  private machineAction(kind: "machine-start" | "machine-collect" | "machine-remove") {
    const id = this.machineOpen;
    if (!id || this.machineBusy) return;
    const instance = this.placeables.instances.find(p => p.id === id && p.mapId === this.currentMapId);
    if (!instance) { this.machineOpen = undefined; this.emitHud(); return; }
    const now = worldMinute(this.daySerial, this.timeMinutes);
    if (this.family) {
      this.machineBusy = true; this.emitHud();
      const action = kind === "machine-remove" ? { kind: "place-remove" as const, instanceId: id, pose: this.familyPose() } :
        kind === "machine-start" ? { kind, instanceId: id, processId: "saw_wood", pose: this.familyPose() } :
        { kind, instanceId: id, pose: this.familyPose() };
      void this.family.act(action).then(ok => {
        if (!ok || !this.sceneLive) return;
        if (kind === "machine-remove") this.machineOpen = undefined;
        this.say(kind === "machine-start" ? "목재 가공을 시작했어요." : kind === "machine-collect" ? "목재판을 받았어요." : "기계를 회수했어요.");
      }).finally(() => { if (this.sceneLive) { this.machineBusy = false; this.emitHud(); } });
      return;
    }
    const error = kind === "machine-remove" ? removeObject(this.placeables, this.inventory, id, this.familyPose()) :
      kind === "machine-start" ? startMachine(instance.state.machine, this.inventory, "saw_wood", now) : collectMachine(instance.state.machine, this.inventory, now);
    if (error) { this.say(error); return; }
    if (kind === "machine-remove") { this.machineOpen = undefined; this.worldRenderer.renderPlaceables(this.placeables.instances); }
    this.save(false); this.say(kind === "machine-start" ? "목재 가공을 시작했어요." : kind === "machine-collect" ? "목재판을 받았어요." : "기계를 회수했어요.");
  }

  private useAtWorld(worldX: number, worldY: number, inputSource: ToolInputSource = "pointer") {
    this.useResolvedAtWorld(this.resolveToolUseContext(worldX, worldY, inputSource));
  }

  private useResolvedAtWorld(context: ToolUseContext) {
    if(this.isPaused() || this.toolActions.isActive()) return;
    if (this.family && (this.isPaused() || this.family.busy)) return;
    if (this.family && !this.family.snapshot) { this.say("가족 농장 상태를 불러오는 중이에요. 이동은 계속할 수 있습니다."); return; }
    if (this.buildingMode) { this.buildAt(context.targetWorld.x, context.targetWorld.y); return; }
    if (this.placing) { this.placeAt(context.targetWorld.x, context.targetWorld.y); return; }
    if (this.openMachineAt(context.targetWorld.x, context.targetWorld.y)) return;
    if (this.openRanchAt(context.targetWorld.x, context.targetWorld.y)) return;
    if (context.tool === "fishing_rod") { this.useFishing(context); return; }
    if (this.tryRefillWateringCan(context)) return;
    if (context.tool === "water") { this.useWaterAtWorld(context); return; }
    if (context.mapId === FAIRY_FOREST_ID) { this.useForestResource(context); return; }
    if (mineFloorFromMapId(context.mapId) !== null) { this.useMineResource(context); return; }
    if (context.mapId === "farm" && context.tool === "axe") { this.useFarmTree(context); return; }
    if (context.mapId !== "farm") {
      this.toolActions.execute(context.tool, context.facing, () => this.say(context.tool === "axe" || context.tool === "pickaxe"
        ? "도끼는 농장 나무나 숲에서, 곡괭이는 농장·숲·광산에서 사용해 주세요."
        : "이곳에서는 농사 효과가 적용되지 않아요."), undefined, context);
      return;
    }
    this.useFarmTool(context);
  }

  /** Visual feedback is unconditional after world interactions have had priority.
   * The immutable target is resolved before visual startup; only valid targets mutate. */
  private useFarmTool(context: ToolUseContext) {
    const { x, y } = context.targetTile;
    const tile = this.farm.get(`${x},${y}`);
    const center = tilePoint(x + 0.5, y + 0.5);
    const inRange = Phaser.Math.Distance.Between(context.player.x, context.player.y, center.x, center.y) <= GAME_CONFIG.farmInteractionDistance;
    const farmable = isFarmTile(this.mapRegistry.require("farm"), this.farmProgress, x, y)
      || Boolean(TILE_TYPE_DEFINITIONS[getTileTypeInMap(this.mapRegistry.require("farm"), x, y)]?.farmable);
    const pose = this.family ? this.familyPoseForTool(context) : undefined;
    this.toolActions.execute(context.tool, context.facing, (tool) => {
      if (!farmable) {
        this.say("이곳에서는 농사 도구를 사용할 수 없어요."); return;
      }
      if (!tile) { this.say("이곳에서는 농사 도구를 사용할 수 없어요."); return; }
      if (!inRange) { this.say("조금 더 가까이 가 주세요."); return; }
      if (this.family) {
        void this.family.act({ kind: "tool", tool, cropId: this.selectedCrop, x, y, pose: pose! });
        return;
      }
      if (!this.applyTool(tool, tile)) return;
      this.worldRenderer.renderFarmTile(tile); this.save(false); this.emitHud();
    }, undefined, context);
  }

  private useWaterAtWorld(context: ToolUseContext) {
    const definition = this.wateringCan.currentWater <= 0 ? EMPTY_WATER_ACTION_DEFINITION : undefined;
    const { x, y } = context.targetTile;
    const tile = this.farm.get(`${x},${y}`);
    const center = tilePoint(x + .5, y + .5);
    const inRange = Phaser.Math.Distance.Between(context.player.x, context.player.y, center.x, center.y) <= GAME_CONFIG.farmInteractionDistance;
    const pose = this.family ? this.familyPoseForTool(context) : undefined;
    this.toolActions.execute("water", context.facing, () => {
      if (this.wateringCan.currentWater <= 0) { this.say("물뿌리개가 비었어요. 물가에서 다시 채워 주세요."); return; }
      if (context.mapId !== "farm") return;
      if (!tile || context.targetKind !== "farm_tile") return;
      if (!inRange) return;
      if (!tile.tilled) return;
      if (this.family) {
        void this.family.act({ kind: "tool", tool: "water", cropId: this.selectedCrop, x, y, pose: pose! }).then((accepted) => {
          if (accepted && this.sceneLive) this.say(`물을 주었어요. 물 ${this.wateringCan.currentWater} / ${this.wateringCan.capacity}`);
        });
        return;
      }
      if (!this.applyTool("water", tile)) return;
      this.worldRenderer.renderFarmTile(tile); this.save(false); this.emitHud();
    }, definition, context);
  }

  private useFarmTree(context: ToolUseContext) {
    const map = this.mapRegistry.require("farm");
    const object = context.targetKind === "farm_tree"
      ? map.objects.find((entry) => entry.id === context.targetObjectId)
      : undefined;
    const pose = this.family ? this.familyPoseForTool(context) : undefined;
    this.toolActions.execute("axe", context.facing, (tool) => {
      if (!object) { this.say("나무 가까이에서 나무를 바라보고 도끼를 사용해 주세요."); return; }
      if (!this.family && !canPerformAction(this.stats, "axe")) { this.say("체력이 부족합니다. 잠을 자고 회복하세요."); return; }
      if (this.family) {
        void this.family!.act({ kind: "farm-tree-hit", nodeId: object.id, tool: "axe", pose: pose! }).then((accepted) => {
          if (!accepted || !this.sceneLive || this.currentMapId !== "farm") return;
          const count = this.farmTreeState.hits[object.id] ?? 0;
          this.say(this.farmTreeState.depleted.includes(object.id)
            ? "나무를 베어 목재 3개를 얻었어요."
            : `나무 ${count}/3회`);
        });
        return;
      }
      const result = strikeFarmTree(this.farmTreeState, object, tool, this.toolProgression);
      if (result.state === this.farmTreeState) { this.say(result.message); return; }
      this.farmTreeState = result.state;
      recordSuccessfulAction(this.stats, "axe");
      if (result.drop) this.inventory.add(result.drop, result.quantity);
      if (result.remaining === 0) {
        const position = { x: this.player.x, y: this.player.y, facing: this.facing };
        this.loadMap("farm", undefined, position);
      } else this.worldRenderer.renderFarmTreeHits(this.farmTreeState.hits);
      this.say(result.message);
      this.save(false);
    }, undefined, context);
  }

  private tryRefillWateringCan(context: ToolUseContext): boolean {
    if (context.tool !== "water" || context.targetKind !== "water_source") return false;
    const map = this.mapRegistry.require(context.mapId as MapId);
    const { x, y } = context.targetTile;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height || getTileTypeInMap(map, x, y) !== "water") return false;
    const center = tilePoint(x + .5, y + .5);
    if (Phaser.Math.Distance.Between(context.player.x, context.player.y, center.x, center.y) > GAME_CONFIG.farmInteractionDistance) return false;
    const pose = this.family ? this.familyPoseForTool(context) : undefined;
    this.toolActions.execute("water", context.facing, () => {
      if (this.family) {
        void this.family.act({ kind: "water-refill", pose: pose! }).then(accepted => {
          if (accepted && this.sceneLive) this.say(`물뿌리개를 가득 채웠어요. 물 ${this.wateringCan.currentWater} / ${this.wateringCan.capacity}`);
        });
        return;
      }
      if (!refillWateringCan(this.wateringCan)) { this.say("물뿌리개가 이미 가득 찼어요."); return; }
      this.save(false); this.say(`물뿌리개를 가득 채웠어요. 물 ${this.wateringCan.currentWater} / ${this.wateringCan.capacity}`);
    }, WATER_REFILL_ACTION_DEFINITION, context);
    return true;
  }

  private useFishing(context: ToolUseContext) {
    if (this.family && (this.family.busy || !this.family.snapshot)) return;
    const pose = this.familyPoseForTool(context);
    this.toolActions.execute("fishing_rod", context.facing, () => {
      if (context.targetKind !== "fishing_water") { this.say("물가 가까이에서 물을 향해 던져 주세요."); return; }
      const error = fishingSpotError(this.fishingCast?.spotId ?? "farm_pond", pose);
      if (error) { this.say(error); return; }
      if (this.fishingCast) {
        const castId = this.fishingCast.id;
        if (this.family) { void this.family.act({ kind: "fish-reel", castId, pose }); return; }
        const result = reelFishing(this.fishingCast, castId, this.fishingProgress, this.inventory, this.stats, this.daySerial, this.timeMinutes);
        if (result.error) { this.say(result.error); return; }
        this.fishingCast = result.cast ?? null;
        this.save(false); this.say(result.message ?? "낚시를 마쳤어요."); return;
      }
      if (this.family) { void this.family.act({ kind: "fish-cast", spotId: "farm_pond", pose }); return; }
      const result = beginFishing(this.fishingProgress, null, pose, "farm_pond", this.forestScope, "single", this.daySerial,
        weatherFor(this.forestScope, this.daySerial).id, this.timeMinutes, this.stats);
      if (result.error || !result.cast || !result.progress) { this.say(result.error ?? "낚시를 시작할 수 없어요."); return; }
      this.fishingProgress = result.progress; this.fishingCast = result.cast;
      this.save(false); this.say("찌를 던졌어요. 입질이 오면 행동 버튼을 누르세요.");
    }, undefined, context);
  }

  private useForestResource(context: ToolUseContext) {
    const map = this.mapRegistry.require(context.mapId);
    const object = context.targetKind === "forest_resource"
      ? map.objects.find((entry) => entry.id === context.targetObjectId)
      : undefined;
    this.toolActions.execute(context.tool, context.facing, tool => {
      if (!object) { this.say("채집할 숲 자원 가까이에서 사용해 주세요."); return; }
      const kind = resourceKind(object)!;
      if (tool !== FOREST_RESOURCES[kind].tool) {
        this.say(`${FOREST_RESOURCES[kind].name}: ${FOREST_RESOURCES[kind].tool === "axe" ? "도끼" : FOREST_RESOURCES[kind].tool === "pickaxe" ? "곡괭이" : "손"}을(를) 사용해 주세요.`); return;
      }
      if (tool === "pickaxe" && !this.toolProgression.pickaxe) { this.say("제작대에서 곡괭이를 해금해 주세요."); return; }
      const skillAction = tool === "axe" ? "axe" : tool === "pickaxe" ? "pickaxe" : "forage";
      if (!this.family && !canPerformAction(this.stats, skillAction)) { this.say("체력이 부족합니다. 잠을 자고 회복하세요."); return; }
      if (this.family) {
        const daySerial = this.family.snapshot?.world.daySerial ?? this.family.snapshot?.world.day;
        if (!daySerial) { this.say("가족 숲의 최신 상태를 받는 중이에요."); return; }
        const before = this.sharedForestState;
        const priorCount = this.inventory.count(FOREST_RESOURCES[kind].drop);
        void this.family!.act({ kind: "forest-gather", nodeId: object.id, daySerial, tool, pose: this.familyPoseForTool(context) }).then(accepted => {
          if (!accepted || !this.sceneLive || this.currentMapId !== FAIRY_FOREST_ID) return;
          const definition = FOREST_RESOURCES[kind];
          const delta = this.inventory.count(definition.drop) - priorCount;
          const feedback = forestFeedback(object, before, this.sharedForestState, definition.drop, delta);
          if (feedback) this.forestEffects.play(object, feedback);
        });
        return;
      }
      const before = this.forestState;
      const result = strikeForestNode(this.forestState, object, tool, this.toolProgression);
      if (result.state === this.forestState) { this.say(result.message); return; }
      this.forestState = result.state;
      recordSuccessfulAction(this.stats, skillAction);
      this.worldRenderer.renderForestHits(this.forestState.hits);
      if (result.drop) this.inventory.add(result.drop, result.quantity);
      if (result.remaining === 0) {
        const position = { x: this.player.x, y: this.player.y, facing: this.facing };
        this.syncForest(true); this.loadMap(FAIRY_FOREST_ID, undefined, position);
      }
      const feedback = forestFeedback(object, before, this.forestState, result.drop, result.quantity);
      if (feedback) this.forestEffects.play(object, feedback);
      this.say(result.message);
      this.save(false);
    }, undefined, context);
  }

  private useMineResource(context: ToolUseContext) {
    const floor = mineFloorFromMapId(context.mapId);
    if (floor === null) return;
    const node = context.targetKind === "mine_resource"
      ? this.mapRegistry.require(context.mapId).objects.find((entry) => entry.id === context.targetObjectId)
      : undefined;
    this.toolActions.execute(context.tool, context.facing, tool => {
      if (!node) { this.say("광석 가까이에서 곡괭이를 사용해 주세요."); return; }
      if (tool !== "pickaxe" || !this.toolProgression.pickaxe) { this.say("제작대에서 곡괭이를 해금하고 선택해 주세요."); return; }
      if (!this.family && !canPerformAction(this.stats, "pickaxe")) { this.say("체력이 부족합니다. 잠을 자고 회복하세요."); return; }
      const kind = mineResourceKind(node)!;
      if (this.family) {
        const daySerial = this.family.snapshot?.world.daySerial;
        if (!daySerial) { this.say("가족 광산 상태를 불러오는 중이에요."); return; }
        void this.family.act({ kind: "mine-hit", floor, nodeId: node.id, daySerial, tool, pose: this.familyPoseForTool(context) }).then(accepted => {
          if (!accepted || !this.sceneLive || this.currentMapId !== mineMapId(floor)) return;
          const depleted = this.mineDaily.floors[floor]?.depleted.includes(node.id);
          const count = this.mineDaily.floors[floor]?.hits[node.id] ?? 0;
          this.say(depleted ? `${MINE_RESOURCES[kind].name}에서 ${MINE_RESOURCES[kind].quantity}개를 얻었어요.${kind === "stair" && floor < MINE_PLAYABLE_FLOORS ? ` ${floor + 1}층이 열렸어요!` : ""}` : `${MINE_RESOURCES[kind].name} ${count}/${MINE_RESOURCES[kind].hits}회`);
        });
        return;
      }
      const result = strikeMineNode(this.mineDaily, this.mineProgress, floor, node, this.toolProgression);
      if (!result) { this.say("이미 캔 자원이에요."); return; }
      this.mineDaily = result.daily; this.mineProgress = result.progress;
      if (result.drop) this.inventory.add(result.drop, result.quantity);
      recordSuccessfulAction(this.stats, "pickaxe");
      this.worldRenderer.renderMineHits(this.mineDaily.floors[floor]?.hits ?? {});
      if (result.drop) {
        const position = { x: this.player.x, y: this.player.y, facing: this.facing };
        this.syncMine(true); this.loadMap(this.currentMapId, undefined, position);
      }
      this.say(result.drop ? `${MINE_RESOURCES[kind].name}에서 ${result.quantity}개를 얻었어요.${kind === "stair" && floor < MINE_PLAYABLE_FLOORS ? ` ${floor + 1}층이 열렸어요!` : ""}` : `${MINE_RESOURCES[kind].name} ${result.count}/${MINE_RESOURCES[kind].hits}회`);
      this.save(false);
    }, undefined, context);
  }

  private applyTool(tool: ToolKey, tile: FarmTileData): boolean {
    const result = applyFarmToolEffect(tool, tile, {
      selectedCrop: this.selectedCrop,
      inventory: this.inventory,
      stats: this.stats,
      wateringCan: this.wateringCan,
      toolProgression: this.toolProgression,
      day: this.day,
      raining: weatherFor(this.forestScope, this.daySerial).id === "rain",
    });
    this.say(result.message);
    return result.changed;
  }

  private handleCommand(command: Command) {
    if (command.type === "controls-edit") { this.controlsEditing = command.value === true; this.running = false; this.virtualMovement = { x: 0, y: 0 }; this.player.setVelocity(0, 0); return; }
    if (command.type === "menu-open") { this.menuInputBlocked = command.value === true; this.running = false; this.virtualMovement = { x: 0, y: 0 }; this.player.setVelocity(0, 0); return; }
    if (command.type === "run") { this.running = !this.toolActions.isActive() && command.value === true; return; }
    if (command.type === "ui-close") {
      if (this.npcRequest || this.ranchBusy || this.buildingBusy || this.machineBusy || this.storageBusy || this.craftingBusy || this.transitioning) return;
      if (this.dialogue) { this.relationshipEvent = undefined; this.dialogue = undefined; }
      else if (this.journalOpen) this.journalOpen = false;
      else if (this.ranchOpen) this.ranchOpen = undefined;
      else if (this.buildingOpen) this.buildingOpen = false;
      else if (this.machineOpen) this.machineOpen = undefined;
      else if (this.storageOpen) this.storageOpen = undefined;
      else if (this.inventoryOpen) this.inventoryOpen = false;
      else if (this.craftingOpen) this.craftingOpen = false;
      else if (this.shopOpen) this.shopOpen = false;
      else if (this.sleepPrompt) this.sleepPrompt = false;
      else if (this.buildingMode) { this.buildingMode = false; this.buildPreview?.setVisible(false); }
      else if (this.placing) this.placing = false;
      this.virtualMovement = { x: 0, y: 0 }; this.emitHud(); return;
    }
    if (command.type === "ranch-close") { if (!this.ranchBusy) { this.ranchOpen = undefined; this.emitHud(); } return; }
    if (command.type === "animal-buy" || command.type === "animal-feed") { this.ranchAction(command.type); return; }
    if ((command.type === "animal-pet" || command.type === "animal-collect") && typeof command.value === "string") { this.ranchAction(command.type, command.value); return; }
    if (command.type === "building-close") { if (!this.buildingBusy) { this.buildingOpen = false; this.emitHud(); } return; }
    if (command.type === "building-open") {
      if (this.currentMapId !== "farm") { this.say("농장에서 건설 메뉴를 열어 주세요."); return; }
      if (!this.isPaused() && !this.buildingMode) { this.buildingOpen = true; this.virtualMovement = { x: 0, y: 0 }; this.player.setVelocity(0, 0); this.emitHud(); }
      return;
    }
    if (command.type === "building-mode") {
      if (this.buildingMode) { this.buildingMode = false; this.buildPreview?.setVisible(false); this.say("건설 배치를 취소했어요."); return; }
      if (this.buildingOpen && !this.buildingBusy && typeof command.value === "string" && Object.hasOwn(BUILDING_DEFINITIONS, command.value)) {
        this.buildingDefinitionId = command.value as BuildingId; const def = BUILDING_DEFINITIONS[this.buildingDefinitionId];
        this.buildingOpen = false; this.placing = false; this.buildingMode = true;
        this.say(`${def.name}의 왼쪽 위 칸을 선택하세요. 빈 ${def.footprint.width}×${def.footprint.height} 잔디가 필요해요.`);
      }
      return;
    }
    if (command.type === "farm-expand") { this.expandFarm(); return; }
    if (command.type === "machine-close") { if (!this.machineBusy) { this.machineOpen = undefined; this.emitHud(); } return; }
    if (command.type === "machine-start" || command.type === "machine-collect" || command.type === "machine-remove") { this.machineAction(command.type); return; }
    if (command.type === "place-mode") {
      if (this.buildingMode) return;
      if (this.placing) { this.placing = false; this.say("배치를 취소했어요."); return; }
      if (this.isPaused() || this.machineBusy) return;
      if (this.currentMapId !== "farm" || this.inventory.count("wood_processor") < 1) { this.say("농장에서 가방의 목재 가공기를 배치해 주세요."); return; }
      this.placing = true; this.say("가까운 빈 땅을 누르거나 행동 버튼으로 배치하세요."); return;
    }
    if (command.type === "storage-close") { if (!this.storageBusy) this.closeStorage(); return; }
    if (command.type === "storage-transfer") { this.transferStorage(command.value); return; }
    if (command.type === "storage-commit") { this.commitStorage(command.value); return; }
    if (command.type === "inventory-close") { this.inventoryOpen = false; this.virtualMovement = { x: 0, y: 0 }; this.emitHud(); return; }
    if (command.type === "inventory-open") {
      if (this.isPaused()) return;
      this.inventoryOpen = true; this.virtualMovement = { x: 0, y: 0 }; this.player.setVelocity(0, 0); this.emitHud(); return;
    }
    if (command.type === "consume-food") { this.consumeFoodItem(command.value); return; }
    if (this.inventoryOpen && !["move", "save"].includes(command.type)) return;
    if (this.machineOpen && !["move", "save"].includes(command.type)) return;
    if(command.type==="village-open"){
      const opening=command.value===true;
      if(this.dialogue||this.npcRequest||(opening&&this.isPaused()))return;
      this.journalOpen=opening;this.virtualMovement={x:0,y:0};
      if(this.journalOpen&&this.family)void this.family.loadProgress().then(()=>{if(this.sceneLive)this.emitHud();}).catch(()=>{if(this.sceneLive)this.say("주민 기록을 불러올 수 없어요. 연결 후 다시 열어 주세요.");});
      this.emitHud();return;
    }
    if(command.type==="npc-gift"&&typeof command.value==="string"&&Object.hasOwn(ITEM_DEFINITIONS,command.value)){void this.giftAction(command.value as ItemId);return;}
    if(command.type==="relationship-event-start"&&typeof command.value==="string"){void this.startRelationshipEventFlow(command.value);return;}
    if(command.type==="quest-action"){void this.questAction(command.value as QuestAction);return;}
    if(command.type==="dialogue-close"||command.type==="dialogue-next") {
      if(this.relationshipEvent&&this.dialogue?.eventId===this.relationshipEvent.eventId){
        if(command.type==="dialogue-next"&&advanceRelationshipEvent(this.relationshipEvent)==="advanced")this.dialogue.index=this.relationshipEvent.index;
        else if(command.type==="dialogue-next"){void this.completeRelationshipEventFlow();return;}
        else {this.relationshipEvent=undefined;this.dialogue=undefined;}
      }else if(this.dialogue && command.type==="dialogue-next" && this.dialogue.index+1<this.dialogue.lines.length) this.dialogue.index++;
      else this.dialogue=undefined;
      this.virtualMovement={x:0,y:0};this.emitHud();return;
    }
    if((this.dialogue||this.journalOpen||this.npcRequest) && !["move","save"].includes(command.type))return;
    if (command.type === "seed-select" && isCropId(command.value)) { this.selectedCrop = command.value; this.selectedTool = "seed"; this.emitHud(); return; }
    if (this.family && (command.type === "save" || command.type === "load")) {
      this.family.savePersonal(this.familyPose(), this.daySerial);
      void this.family.refresh().then(() => this.say("가족 농장 서버 상태를 받았어요.")).catch(() => this.say("서버에 연결할 수 없습니다.")); return;
    }
    if (this.testMode && (command.type === "save" || command.type === "load")) { this.say("테스트 플레이에서는 실제 게임 저장을 변경하지 않아요."); return; }
    if (command.type === "move") {
      const value = command.value as Partial<MovementVector> | undefined;
      this.virtualMovement = { x: Number(value?.x) || 0, y: Number(value?.y) || 0 };
    }
    if (command.type === "tool" && typeof command.value === "string" && Object.hasOwn(TOOL_ACTION_DEFINITIONS, command.value)) this.selectTool(command.value as ToolKey);
    if (command.type === "action") this.useFacingTile("mobile");
    if (command.type === "save") this.save(true);
    if (command.type === "load") { const data = this.repository.load(); if (data) this.restore(data, true); else this.say("아직 저장된 농장이 없어요."); }
    if (command.type === "help") { this.helpOpen = command.value === "open"; this.virtualMovement = { x: 0, y: 0 }; this.emitHud(); }
    if (command.type === "family-sleep-cancel") { void this.family?.act({ kind: "sleep-cancel", pose: this.familyPose() }); return; }
    if (command.type === "sleep-confirm") this.sleep();
    if (command.type === "sleep-cancel") { this.sleepPrompt = false; this.say("조금 더 둘러보기로 했어요."); }
    if (command.type === "shop-close") { this.shopOpen = false; this.say("다음에 또 들러 주세요."); }
    if (command.type === "shop-buy" && typeof command.value === "string") this.buy(command.value);
    if (command.type === "craft-close") { if (!this.craftingBusy) { this.craftingOpen = false; this.virtualMovement = { x: 0, y: 0 }; this.emitHud(); } }
    if (command.type === "craft" && typeof command.value === "string") this.craftRecipe(command.value);
    if (command.type === "tool-upgrade" && typeof command.value === "string") this.upgradeToolAtTable(command.value);
    if (command.type === "sell") this.sellHarvest();
  }

  private openStorage(containerId: ContainerId) {
    this.virtualMovement={x:0,y:0}; this.touchNavigation=undefined; this.player.setVelocity(0,0);
    if (!this.family) { this.storageOpen=containerId; this.say("가방과 보관함 사이에서 아이템을 옮길 수 있어요."); return; }
    if (this.storageBusy) return;
    this.storageBusy=true; this.emitHud();
    void this.family.act({ kind:"storage-lock", containerId, acquire:true, pose:this.familyPose() }).then(ok=>{
      if (ok && this.sceneLive) { this.storageOpen=containerId; this.say("보관함을 열었어요. 현재는 나만 사용할 수 있어요."); }
    }).finally(()=>{ if(this.sceneLive){this.storageBusy=false;this.emitHud();} });
  }

  private closeStorage() {
    const containerId=this.storageOpen;
    this.storageOpen=undefined; this.emitHud();
    if (this.family && containerId) void this.family.act({ kind:"storage-lock", containerId, acquire:false, pose:this.familyPose() });
  }

  private transferStorage(value: unknown) {
    if (!this.storageOpen || this.storageBusy || !value || typeof value !== "object") return;
    const { direction, itemId, quantity } = value as { direction: StorageDirection; itemId: ItemId; quantity: number };
    if (this.family) {
      this.storageBusy = true; this.emitHud();
      void this.family.act({ kind: "storage", containerId: this.storageOpen, direction, itemId, quantity, pose: this.familyPose() })
        .finally(() => { if (this.sceneLive) { this.storageBusy = false; this.emitHud(); } });
      return;
    }
    const error = transferItem(this.inventory, this.storage, this.storageOpen, direction, itemId, quantity);
    if (error) { this.say(error); return; }
    this.save(false); this.say("아이템을 옮겼어요.");
  }

  private commitStorage(value: unknown) {
    if (!this.storageOpen || this.storageBusy || !Array.isArray(value)) return;
    const transfers = value as StorageTransfer[];
    if (this.family) {
      this.storageBusy = true; this.emitHud();
      void this.family.act({ kind: "storage-batch", containerId: this.storageOpen, transfers, pose: this.familyPose() })
        .then(ok => { if (ok && this.sceneLive) this.say("보관함 변경사항을 반영했어요."); })
        .finally(() => { if (this.sceneLive) { this.storageBusy = false; this.emitHud(); } });
      return;
    }
    const error = transferItemsAtomically(this.inventory, this.storage, this.storageOpen, transfers);
    if (error) { this.say(error); return; }
    this.save(false); this.say("보관함 변경사항을 반영했어요.");
  }

  private consumeFoodItem(value: unknown) {
    if (!this.inventoryOpen || !isFoodItemId(value)) return;
    if (this.family) {
      void this.family.act({ kind: "consume-food", itemId: value, pose: this.familyPose() }).then((accepted) => {
        if (accepted && this.sceneLive) this.say("스테미나 비스켓을 먹었어요.");
      });
      return;
    }
    const result = consumeFood(this.inventory, this.stats, value);
    if (result.consumed) this.save(false);
    this.say(result.message);
  }

  private craftRecipe(recipeId: string) {
    if (!this.craftingOpen || this.craftingBusy) return;
    const recipe = getRecipe(recipeId);
    if (!recipe) { this.say("없는 제작법이에요."); return; }
    if (this.family) {
      this.craftingBusy = true; this.emitHud();
      void this.family.act({ kind: "craft", recipeId, pose: this.familyPose() }).then(ok => {
        if (ok && this.sceneLive) this.say(`${recipe.name} ${recipe.output.quantity}개를 만들었어요.`);
      }).finally(() => { if (this.sceneLive) { this.craftingBusy = false; this.emitHud(); } });
      return;
    }
    if (!craft(this.inventory, recipe)) { this.say("재료가 부족해요."); return; }
    this.say(`${recipe.name} ${recipe.output.quantity}개를 만들었어요.`);
    this.save(false);
  }

  private upgradeToolAtTable(upgradeId: string) {
    if (!this.craftingOpen || this.craftingBusy) return;
    const upgrade = getToolUpgrade(upgradeId);
    if (!upgrade) { this.say("없는 도구 강화예요."); return; }
    if (this.family) {
      this.craftingBusy = true; this.emitHud();
      void this.family.act({ kind: "tool-upgrade", upgradeId, pose: this.familyPose() }).then(ok => {
        if (ok && this.sceneLive) this.announceTool(upgrade.tool === "axe" ? "튼튼한 도끼로 강화했습니다!" : "곡괭이를 해금했습니다! 이제 채광할 수 있어요.");
      }).finally(() => { if (this.sceneLive) { this.craftingBusy = false; this.emitHud(); } });
      return;
    }
    if (!upgradeTool(this.inventory, this.toolProgression, upgrade)) { this.say("도구 단계나 재료를 확인해 주세요."); return; }
    this.save(false); this.announceTool(upgrade.tool === "axe" ? "튼튼한 도끼로 강화했습니다!" : "곡괭이를 해금했습니다! 이제 채광할 수 있어요.");
  }

  private announceTool(message: string) { this.toolNotice = message; this.toolNoticeUntil = performance.now() + 5000; this.say(message); }

  private buy(listingId: string) {
    if (this.family) { void this.family.act({ kind: "buy", listingId, pose: this.familyPose() }); return; }
    const listing = GENERAL_STORE_LISTINGS.find((entry) => entry.id === listingId);
    if (!listing) return;
    const result = purchaseInventoryItem(this.inventory, this.money, listing.itemId, listing.price, listing.quantity);
    if (!result.purchased) this.say("돈이 부족해요.");
    else { this.money = result.money; this.say(`${listing.name} ${listing.quantity}개를 샀어요.`); this.save(false); }
    this.emitHud();
  }
  private sellHarvest() {
    if (this.family) { void this.family.act({ kind: "sell", pose: this.familyPose() }); return; }
    const { amount, earned } = sellMarketGoods(this.inventory);
    if (!amount) this.say("판매할 작물이나 물고기가 없어요.");
    else { this.money += earned; this.say(`${amount}개를 팔아 ${earned}G를 얻었어요!`); this.save(false); }
    this.emitHud();
  }
  private askToSleep() { if (!this.helpOpen && !this.transitioning) { this.sleepPrompt = true; this.say("오늘 하루를 마치고 잠드시겠습니까?"); } }
  private sleep() {
    if (!this.sleepPrompt || this.transitioning) return;
    if (this.family) {
      this.sleepPrompt = false; this.emitHud();
      void this.family.act({ kind: "sleep", pose: this.familyPose() }).then((ok) => {
        if (!this.sceneLive) return;
        this.transitioning = false;
        if (ok) this.loadMap("farmhouse", "bed_wake");
        this.emitHud();
      }); return;
    }
    this.sleepPrompt = false; this.transitioning = true; this.player.setVelocity(0, 0); this.emitHud();
    this.sleepTimer = window.setTimeout(() => {
      const grown = advanceFarmDay([...this.farm.values()]);
      restoreStamina(this.stats);
      this.fishingCast = null;
      const previousDaySerial = this.daySerial;
      this.daySerial++;
      this.day = calendarDate(this.daySerial).day;
      this.buildings = normalizeBuildings(this.buildings, this.daySerial);
      advanceRanchDay(this.ranchState, previousDaySerial, this.daySerial);
      waterFarmForRain(this.farm.values(), weatherFor(this.forestScope, this.daySerial));
      this.syncForest();
      this.mineDaily = emptyMineDaily(this.daySerial);
      this.syncMine(true);
      this.timeMinutes = GAME_CONFIG.day.startMinutes;
      this.placeables = normalizePlaceables(this.placeables, worldMinute(this.daySerial, this.timeMinutes));
      this.timeAccumulator = 0; this.lateNightWarned = false; this.transitioning = false;
      this.loadMap("farmhouse", "bed_wake");
      this.message = grown ? `잘 잤어요. 물을 준 작물 ${grown}개가 자랐습니다.` : "잘 잤어요. 새로운 아침이 밝았습니다.";
      this.save(false); this.emitHud();
    }, GAME_CONFIG.day.sleepTransitionMs);
  }

  private selectTool(tool: ToolKey) { if (tool === "pickaxe" && !this.toolProgression.pickaxe) { this.say("제작대에서 곡괭이를 해금해 주세요."); return; } this.selectedTool = tool; this.say(`${ITEM_DEFINITIONS[tool].name}을(를) 선택했어요.`); }
  private getObjective() {
    const tiles = [...this.farm.values()];
    if (Object.values(CROP_DEFINITIONS).some(c => this.inventory.count(c.harvestItemId) > 0)) return { objective: "수확물을 판매해 보세요", progress: 95 };
    if (!tiles.some((tile) => tile.tilled)) return { objective: "첫 밭을 갈아 보세요", progress: 5 };
    if (!tiles.some((tile) => tile.cropStage !== null)) return { objective: "선택한 씨앗을 심으세요", progress: 25 };
    if (tiles.some((tile) => tile.cropType && tile.cropStage !== null && isMatureCrop(tile.cropType, tile.cropStage))) return { objective: "다 자란 작물을 수확하세요", progress: 80 };
    if (!tiles.some((tile) => tile.wateredToday)) return { objective: "작물에 오늘의 물을 주세요", progress: 45 };
    return { objective: "농장집 침대에서 잠드세요", progress: 65 };
  }
  private formatTime() { const h = Math.floor(this.timeMinutes / 60), m = this.timeMinutes % 60; return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${m.toString().padStart(2, "0")}`; }
  private emitHud() {
    const personal=this.family?.progress?.data??this.playerProgress;
    if(this.dialogue){const rel=personal.relationships[this.dialogue.npcId];if(rel)this.dialogue.relationship=`${relationshipLevel(rel.points)} · 호감도 ${rel.points}`;}
    const npcPoses=this.npcs?.sampleWorld(this.daySerial,this.npcTime())??[];
    const villagers=NPC_DEFINITIONS.map(n=>{const p=npcPoses.find(p=>p.npcId===n.id),points=personal.relationships[n.id].points;return {id:n.id,name:n.name,points,level:relationshipLevel(points),location:p?this.mapRegistry.get(p.mapId)?.name??"다른 장소":"다른 장소",activity:p?.activity??"휴식"};});
    const step = this.getObjective();
    const date = calendarDate(this.daySerial);
    const relationshipEvents=this.dialogue&&!this.dialogue.eventId?availableRelationshipEvents(personal,this.dialogue.npcId,this.relationshipEventContext()).map(event=>({id:event.id,title:event.title})):[];
    const hud: HudState = { wateringCan:normalizeWateringCan(this.wateringCan), relationshipEvents,ranchState:this.ranchState, ranchOpen:this.ranchOpen, ranchBusy:this.ranchBusy, buildingDefinitionId:this.buildingDefinitionId, fishingStage: fishingStage(this.fishingCast, worldMinute(this.daySerial, this.timeMinutes)), marketCount: [...Object.values(CROP_DEFINITIONS).map(c => c.harvestItemId), ...Object.values(FISH_DEFINITIONS).map(f => f.itemId), "egg" as const].reduce((n,id) => n + this.inventory.count(id), 0), buildings:normalizeBuildings(this.buildings, this.daySerial), farmProgress:normalizeFarmProgress(this.farmProgress), buildingOpen:this.buildingOpen, buildingMode:this.buildingMode, buildingBusy:this.buildingBusy, placeables:normalizePlaceables(this.placeables, worldMinute(this.daySerial, this.timeMinutes)), placing:this.placing, machineOpen:this.machineOpen, machineBusy:this.machineBusy, worldTimeMinute:worldMinute(this.daySerial, this.timeMinutes), storageOpen:this.storageOpen, storageBusy:this.storageBusy, storage:normalizeStorage(this.storage), stats: normalizePlayerStats(this.stats), toolNotice:this.toolNotice, inventoryOpen:this.inventoryOpen, toolProgression: { ...this.toolProgression }, craftingOpen:this.craftingOpen,craftingBusy:this.craftingBusy,craftingItems:this.inventory.serialize().items,villageOpen:this.journalOpen,villagers,quests:this.family&&!this.family.progress?[]:questViews(this.family?.progress?.data??this.playerProgress,this.inventory), npcBusy:this.npcRequest, dialogue:this.dialogue, money: this.money, selectedCrop: this.selectedCrop, seedCounts: Object.fromEntries(Object.values(CROP_DEFINITIONS).map(c => [c.id, this.inventory.count(c.seedItemId)])), seeds: this.inventory.count(getCropDefinition(this.selectedCrop).seedItemId), harvest: Object.values(CROP_DEFINITIONS).reduce((n,c) => n + this.inventory.count(c.harvestItemId), 0), resources: { wood:this.inventory.count("wood"),stone:this.inventory.count("stone"),wild_herb:this.inventory.count("wild_herb"),moon_mushroom:this.inventory.count("moon_mushroom"),fairy_bloom:this.inventory.count("fairy_bloom") }, selectedTool: this.selectedTool,
      objective: step.objective, message: this.message, progress: step.progress, day: date.day, daySerial:this.daySerial, year: date.year, season: date.season, weather: weatherFor(this.forestScope, this.daySerial).id, timeText: this.formatTime(), sleepPrompt: this.sleepPrompt,
      transitioning: this.transitioning, shopOpen: this.shopOpen, mapId: this.currentMapId, mapName: this.mapRegistry.require(this.currentMapId).name };
    gameEvents.dispatchEvent(new CustomEvent("hud", { detail: hud }));
  }
  private say(message: string) { if(this.dialogue)this.dialogue.notice=message; this.message = message; this.emitHud(); }
  private familyPose(): FamilyPose {
    return { mapId: this.currentMapId, x: this.player.x, y: this.player.y, facing: this.facing, selectedTool: this.selectedTool,
      moving: Boolean(this.player.body?.velocity.x || this.player.body?.velocity.y) };
  }
  private applyFamilySnapshot(snapshot: FamilySnapshot) {
    if (!this.sceneLive) return;
    gameEvents.dispatchEvent(new CustomEvent("family-sleep", { detail: snapshot.sleep }));
    this.npcMinute = snapshot.npcTimeMinutes ?? snapshot.world.timeMinutes; this.npcClockReceived = performance.now();
    this.daySerial = snapshot.world.daySerial ?? snapshot.world.day;
    const nextForestState = normalizeForestState(snapshot.world.forestState, this.daySerial);
    const depletedChanged = !this.sharedForestState || this.sharedForestState.daySerial !== this.daySerial ||
      JSON.stringify(this.sharedForestState.depleted) !== JSON.stringify(nextForestState.depleted);
    this.sharedForestState = nextForestState;
    if (this.forestDayInstalled !== this.daySerial || depletedChanged) {
      const oldPosition = this.currentMapId === FAIRY_FOREST_ID ? { x: this.player.x, y: this.player.y, facing: this.facing } : undefined;
      this.syncForest(depletedChanged);
      if (oldPosition && this.forestDayInstalled === this.daySerial) this.loadMap(FAIRY_FOREST_ID, undefined, oldPosition);
    } else if (this.currentMapId === FAIRY_FOREST_ID) this.worldRenderer.renderForestHits(nextForestState.hits);
    const nextMineDaily = normalizeMineDaily(snapshot.world.mineDaily, this.daySerial, this.forestScope);
    const floor = mineFloorFromMapId(this.currentMapId);
    const mineChanged = this.mineDayInstalled !== this.daySerial ||
      (floor !== null && JSON.stringify(this.mineDaily.floors[floor]?.depleted) !== JSON.stringify(nextMineDaily.floors[floor]?.depleted));
    this.mineDaily = nextMineDaily;
    this.mineProgress = normalizeMineProgress(snapshot.world.mineProgress);
    if (mineChanged) {
      const position = floor !== null ? { x: this.player.x, y: this.player.y, facing: this.facing } : undefined;
      this.syncMine(true);
      if (position) this.loadMap(this.currentMapId, undefined, position);
    } else if (floor !== null) this.worldRenderer.renderMineHits(this.mineDaily.floors[floor]?.hits ?? {});
    const nextFarmTreeState = normalizeFarmTreeState(snapshot.world.farmTreeState, farmTreeIds(this.mapRegistry.require("farm")));
    const farmTreeDepletedChanged = JSON.stringify(this.farmTreeState.depleted) !== JSON.stringify(nextFarmTreeState.depleted);
    this.farmTreeState = nextFarmTreeState;
    if (this.currentMapId === "farm" && farmTreeDepletedChanged) {
      this.loadMap("farm", undefined, { x: this.player.x, y: this.player.y, facing: this.facing });
    } else if (this.currentMapId === "farm") this.worldRenderer.renderFarmTreeHits(this.farmTreeState.hits);
    this.day = calendarDate(this.daySerial).day; this.timeMinutes = snapshot.world.timeMinutes; this.money = snapshot.world.money;
    this.inventory = new Inventory(snapshot.inventory);
    this.toolProgression = normalizeToolProgression(snapshot.toolProgression);
    this.stats = normalizePlayerStats(snapshot.stats);
    this.wateringCan = normalizeWateringCan(snapshot.wateringCan);
    this.fishingProgress = normalizeFishingProgress(snapshot.fishingProgress);
    this.fishingCast = snapshot.fishingCast ?? null;
    if (snapshot.fishingNotice) this.message = snapshot.fishingNotice;
    this.storage = normalizeStorage(snapshot.world.storage);
    this.placeables = normalizePlaceables(snapshot.world.placeables, worldMinute(this.daySerial, this.timeMinutes));
    this.buildings = normalizeBuildings(snapshot.world.buildings, this.daySerial);
    this.ranchState = normalizeRanchState(snapshot.world.ranchState, this.buildings);
    this.farmProgress = normalizeFarmProgress(snapshot.world.farmProgress);
    if (this.machineOpen && !this.placeables.instances.some(p => p.id === this.machineOpen)) this.machineOpen = undefined;
    this.worldRenderer.renderPlaceables(this.placeables.instances);
    this.worldRenderer.renderBuildings(this.buildings.instances);
    this.worldRenderer.renderAnimals(this.ranchState.animals, this.buildings.instances);
    if (this.selectedTool === "pickaxe" && !this.toolProgression.pickaxe) this.selectedTool = "hand";
    applyFamilyFarmSnapshot(
      this.farm,
      snapshot.world.farm,
      (x, y) => isFarmTile(this.mapRegistry.require("farm"), this.farmProgress, x, y),
      (tile) => this.worldRenderer.renderFarmTile(tile),
    );
    if (floor !== null && floor > this.mineProgress.deepestUnlockedFloor) {
      this.loadMap(mineMapId(1), "entry"); this.say("광산 진행도를 확인해 1층으로 돌아왔어요.");
    }
    this.emitHud();
  }
  private snapshot(): SaveData { return { version: 4, wateringCan:this.wateringCan, ranchState:this.ranchState, mineProgress:this.mineProgress, mineDaily:this.mineDaily, buildings:normalizeBuildings(this.buildings, this.daySerial), farmProgress:this.farmProgress, placeables:normalizePlaceables(this.placeables, worldMinute(this.daySerial, this.timeMinutes)), storage:this.storage, stats:this.stats, fishingProgress:this.fishingProgress, playerProgress:this.playerProgress, toolProgression:this.toolProgression, forestState:this.forestState, farmTreeState:this.farmTreeState, daySerial:this.daySerial, day: this.day, timeMinutes: this.timeMinutes, money: this.money, selectedTool: this.selectedTool,
    player: { x: this.player.x, y: this.player.y, facing: this.facing, mapId: this.currentMapId }, inventory: this.inventory.serialize(), farm: [...this.farm.values()].map((tile) => ({ ...tile })), savedAt: Date.now() }; }
  private save(notify: boolean) { if (!this.player || this.testMode) return; if (this.family) { this.family.savePersonal(this.familyPose(), this.daySerial); return; } this.repository.save(this.snapshot()); if (notify) this.say("이 브라우저에 현재 장소와 농장 상태를 저장했어요."); }
  private syncForest(force = false) {
    if (this.testMode || (!force && this.forestDayInstalled === this.daySerial)) return;
    if (!this.family && this.forestState.daySerial !== this.daySerial) this.forestState = emptyForestState(this.daySerial);
    if (installFairyForest(this.mapRegistry, this.forestScope, this.daySerial, this.family ? this.sharedForestState ?? undefined : this.forestState)) this.forestDayInstalled = this.daySerial;
  }
  private syncMine(force = false) {
    if (this.testMode || (!force && this.mineDayInstalled === this.daySerial)) return;
    this.mineDaily = normalizeMineDaily(this.mineDaily, this.daySerial, this.forestScope);
    if (installMine(this.mapRegistry, this.forestScope, this.daySerial, this.mineDaily)) this.mineDayInstalled = this.daySerial;
  }
  private applySavedState(data: SaveData) {
    this.playerProgress=normalizeProgress(data.playerProgress);this.daySerial=data.daySerial??data.day;
    this.forestState=normalizeForestState(data.forestState,this.daySerial);
    this.farmTreeState=normalizeFarmTreeState(data.farmTreeState,farmTreeIds(this.mapRegistry.require("farm")));
    this.forestDayInstalled=0;
    this.mineProgress=normalizeMineProgress(data.mineProgress); this.mineDaily=normalizeMineDaily(data.mineDaily,this.daySerial,this.forestScope); this.mineDayInstalled=0;
    this.day = calendarDate(this.daySerial).day; this.timeMinutes = data.timeMinutes; this.money = data.money; this.toolProgression = normalizeToolProgression(data.toolProgression); this.stats = normalizePlayerStats(data.stats); this.wateringCan = normalizeWateringCan(data.wateringCan); this.fishingProgress = normalizeFishingProgress(data.fishingProgress); this.fishingCast = null; this.storage = normalizeStorage(data.storage); this.placeables = normalizePlaceables(data.placeables, worldMinute(this.daySerial, this.timeMinutes)); this.buildings = normalizeBuildings(data.buildings, this.daySerial); this.ranchState = normalizeRanchState(data.ranchState, this.buildings); this.farmProgress = normalizeFarmProgress(data.farmProgress); this.selectedTool = data.selectedTool === "pickaxe" && !this.toolProgression.pickaxe ? "hand" : data.selectedTool;
    this.inventory = new Inventory(data.inventory); this.facing = data.player.facing;
    const savedFloor = mineFloorFromMapId(data.player.mapId);
    this.currentMapId = savedFloor !== null && savedFloor > this.mineProgress.deepestUnlockedFloor ? mineMapId(1) : data.player.mapId;
    for (const id of Object.keys(FARM_EXPANSIONS) as (keyof typeof FARM_EXPANSIONS)[])
      for (const tile of expansionTiles(id)) this.farm.delete(`${tile.x},${tile.y}`);
    for (const id of this.farmProgress.unlocked) for (const tile of expansionTiles(id)) if (!this.farm.has(`${tile.x},${tile.y}`)) this.farm.set(`${tile.x},${tile.y}`, tile);
    for (const saved of data.farm) { const tile = this.farm.get(`${saved.x},${saved.y}`); if (tile) Object.assign(tile, saved); }
    waterFarmForRain(this.farm.values(), weatherFor(this.forestScope, this.daySerial));
    this.lateNightWarned = this.timeMinutes >= GAME_CONFIG.day.lateNightMinutes;
  }
  private restore(data: SaveData, notify: boolean) { this.applySavedState(data); this.syncForest(); this.syncMine(); this.loadMap(this.currentMapId, undefined, data.player.mapId === this.currentMapId ? data.player : undefined); if (notify) this.say("저장된 장소와 농장을 불러왔어요."); }
}
