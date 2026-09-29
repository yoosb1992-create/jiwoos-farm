import { applyQuestAction, questViews, recordNpcGreeting, type QuestAction } from "./quests/engine";
import { normalizeProgress, talkToNpc, relationshipLevel } from "./npc/progress";
import { nearestNpc, type DialogueView } from "./npc/dialogue";
import { NpcController } from "./npc/NpcController";
import { NPC_DEFINITIONS } from "./npc/definitions";
import { NpcRenderer, preloadNpcs, createNpcAssets } from "./npc/NpcRenderer";
import { RemotePlayers } from "./family/RemotePlayers";
import { FamilyClient } from "./family/client";
import type { FamilyPose, FamilySession, FamilySnapshot } from "./family/types";
import * as Phaser from "phaser";
import { gameEvents, type HudState, type ToolKey } from "./events";
import { advanceFarmDay, sellAllCrops, Inventory, LocalStorageSaveRepository, purchaseInventoryItem, type FarmTileData, type SaveData } from "./domain";
import { AssetManager } from "./assets/AssetManager";
import { PLAYER_ASSET, displayedSize, physicsBoxForScale, type Facing } from "./assets/definitions";
import { WorldRenderer } from "./rendering/WorldRenderer";
import { ForestGatheringEffects } from "./rendering/ForestGatheringEffects";
import { forestFeedback } from "./forest/feedback";
import { GAME_CONFIG } from "./config";
import { CROP_DEFINITIONS, DEFAULT_CROP_ID, isCropId, type CropId, getCropDefinition, isMatureCrop } from "./data/crops";
import { ITEM_DEFINITIONS } from "./data/items";
import { getRecipe } from "./crafting/definitions";
import { craft } from "./crafting/engine";
import { getToolUpgrade } from "./tools/definitions";
import { normalizeToolProgression, upgradeTool } from "./tools/progression";
import type { ToolProgression } from "./tools/types";
import { GENERAL_STORE_LISTINGS } from "./data/shop";
import { TILE_TYPE_DEFINITIONS, getTileTypeInMap, pointInTileRect, tilePoint } from "./maps/definitions";
import type { MapAction, MapId } from "./maps/types";
import { MapRegistry } from "./maps/MapRegistry";
import { FAIRY_FOREST_ID, recoverForestPosition } from "./forest/generation";
import { installFairyForest } from "./forest/registry";
import { emptyForestState, findForestResource, FOREST_RESOURCES, normalizeForestState, resourceKind, strikeForestNode, type ForestState } from "./forest/resources";
import { PlayerAnimationController } from "./player/PlayerAnimationController";
import { ToolActionSystem } from "./actions/ToolActionSystem";
import { TOOL_ACTION_DEFINITIONS } from "./actions/toolActionDefinitions";
import { facingFromMovement, mergeMovementInput, type MovementVector } from "./input/MovementInput";

export const REAL_MS_PER_GAME_MINUTE = GAME_CONFIG.day.realMsPerGameMinute;
type Command = { type: string; value?: unknown };
export interface FarmSceneOptions { maps?: MapRegistry; initialMapId?: MapId; testMode?: boolean; family?: FamilySession }

export class FarmScene extends Phaser.Scene {
  private journalOpen = false;
  private dialogue?: DialogueView;
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
  private assetManager!: AssetManager;
  private worldRenderer!: WorldRenderer;
  private forestEffects!: ForestGatheringEffects;
  private playerAnimations!: PlayerAnimationController;
  private toolActions!: ToolActionSystem;
  private inventory = new Inventory();
  private toolProgression: ToolProgression = normalizeToolProgression(undefined);
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
  private forestDayInstalled = 0;
  private forestState: ForestState = emptyForestState(1);
  private sharedForestState: ForestState | null = null;
  private readonly forestScope: string;
  private readonly testMode: boolean;
  private helpOpen = true;
  private sleepPrompt = false;
  private shopOpen = false;
  private craftingOpen = false;
  private craftingBusy = false;
  private transitioning = false;
  private lateNightWarned = false;
  private lockedWarpId: string | null = null;
  private message = "갈색 밭 가까이에서 괭이를 사용하세요.";
  private commandHandler = (event: Event) => this.handleCommand((event as CustomEvent<Command>).detail);

  constructor(options: FarmSceneOptions = {}) {
    super("FarmScene");
    this.mapRegistry = options.maps ?? new MapRegistry();
    this.testMode = options.testMode === true;
    this.forestScope = options.family?.room.id ?? "single";
    if (!this.testMode) this.syncForest();
    this.currentMapId = this.mapRegistry.has(options.initialMapId ?? "farm") ? (options.initialMapId ?? "farm") : "farm";
    if (options.family && !this.testMode) this.family = new FamilyClient(options.family, (snapshot) => this.applyFamilySnapshot(snapshot), (message) => this.say(message));
  }
  preload() { this.assetManager = new AssetManager(this); this.assetManager.preload(); preloadNpcs(this); }

  create() {
    this.sceneLive = true;
    this.npcs = new NpcController(NPC_DEFINITIONS, this.mapRegistry);
    createNpcAssets(this); this.npcRenderer = new NpcRenderer(this);
    this.assetManager ??= new AssetManager(this);
    this.assetManager.createFallbackTextures(); this.assetManager.createPlayerAnimations();
    this.worldRenderer = new WorldRenderer(this, this.mapRegistry); this.buildFarm();
    this.forestEffects = new ForestGatheringEffects(this);
    const saved = this.testMode || this.family ? null : this.repository.load();
    const personal = this.family?.loadPersonal();
    if (personal) { this.currentMapId = personal.mapId; this.facing = personal.facing; this.selectedTool = personal.selectedTool; }
    if (saved) this.applySavedState(saved);
    if (personal?.forestDaySerial && personal.mapId === FAIRY_FOREST_ID) this.daySerial = personal.forestDaySerial;
    this.syncForest();
    const playerSize = displayedSize(PLAYER_ASSET);
    this.player = this.physics.add.sprite(0, 0, PLAYER_ASSET.textureKey).setDisplaySize(playerSize.width, playerSize.height)
      .setOrigin(PLAYER_ASSET.origin.x, PLAYER_ASSET.origin.y).setDepth(20).setCollideWorldBounds(true);
    const box = physicsBoxForScale(PLAYER_ASSET.collisionBox, { x: this.player.scaleX, y: this.player.scaleY });
    this.player.body!.setSize(box.width, box.height).setOffset(box.offsetX, box.offsetY);
    this.playerAnimations = new PlayerAnimationController(this.player, this.facing); this.toolActions = new ToolActionSystem(this.playerAnimations);
    this.loadMap(this.currentMapId, undefined, personal ?? (saved ? { x: saved.player.x, y: saved.player.y, facing: saved.player.facing } : undefined));
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D,ONE,TWO,THREE,FOUR,FIVE,SIX") as Record<string, Phaser.Input.Keyboard.Key>;
    this.actionKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.useAtWorld(pointer.worldX, pointer.worldY));
    gameEvents.addEventListener("command", this.commandHandler);
    const cleanup = () => {
      if (!this.sceneLive) return;
      try { this.save(false); } catch { /* Continue cleanup if local storage is full. */ }
      if (this.sleepTimer !== undefined) window.clearTimeout(this.sleepTimer);
      this.sceneLive = false;
      gameEvents.removeEventListener("command", this.commandHandler);
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
    if (!this.family && !this.isPaused()) this.advanceClock(delta);
    this.npcRenderer.update(this.npcs.sample(this.day, this.npcTime()), this.currentMapId, this.familyPose(), this.family&&!this.family.progress?[]:questViews(this.family?.progress?.data??this.playerProgress,this.inventory), this.mapRegistry.require(this.currentMapId));
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
    if (Phaser.Input.Keyboard.JustDown(this.wasd.FIVE)) this.selectTool("axe");
    if (Phaser.Input.Keyboard.JustDown(this.wasd.SIX)) this.selectTool("pickaxe");
    this.checkWarp();
  }

  private npcTime() { return this.family ? Math.min(GAME_CONFIG.day.endMinutes, this.npcMinute + Math.min(2000, Math.max(0, performance.now()-this.npcClockReceived))/REAL_MS_PER_GAME_MINUTE) : this.timeMinutes + this.timeAccumulator/REAL_MS_PER_GAME_MINUTE; }
  private isPaused() { return this.journalOpen || !!this.dialogue || this.helpOpen || this.sleepPrompt || this.shopOpen || this.craftingOpen || this.transitioning; }
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
    if (mapId === FAIRY_FOREST_ID) this.syncForest();
    this.currentMapId = mapId;
    const map = this.mapRegistry.require(mapId), width = map.width * GAME_CONFIG.tileSize, height = map.height * GAME_CONFIG.tileSize;
    this.obstacleCollider?.destroy(); this.obstacles = this.worldRenderer.renderMap(mapId, this.farm.values());
    if (mapId === FAIRY_FOREST_ID) this.worldRenderer.renderForestHits((this.family ? this.sharedForestState : this.forestState)?.hits ?? {});
    this.physics.world.setBounds(0, 0, width, height); this.cameras.main.setBounds(0, 0, width, height);
    this.obstacleCollider = this.physics.add.collider(this.player, this.obstacles);
    const spawn = map.spawns.find((entry) => entry.id === spawnId) ?? map.spawns[0];
    if (position) {
      const safe = mapId === FAIRY_FOREST_ID ? recoverForestPosition(map, position) : position;
      this.player.setPosition(Phaser.Math.Clamp(safe.x, GAME_CONFIG.tileSize, width - GAME_CONFIG.tileSize), Phaser.Math.Clamp(safe.y, GAME_CONFIG.tileSize, height - GAME_CONFIG.tileSize));
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
    if(this.isPaused()||this.npcRequest) return;
    const npc=nearestNpc(this.npcs.sample(this.day,this.npcTime()),this.familyPose(),this.mapRegistry.require(this.currentMapId));
    if(npc) { this.openNpcDialogue(npc.npcId); return; }
    const point = this.playerAnimations.interactionPoint(this.facing);
    const object = this.mapRegistry.require(this.currentMapId).objects.find((entry) => entry.interaction && pointInTileRect(point.x, point.y, entry.interaction.area));
    if (object?.interaction) { this.performWorldAction(object.interaction.action); return; }
    this.useAtWorld(point.x, point.y);
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
  private performWorldAction(action: MapAction) {
    if (action === "sleep") this.askToSleep();
    else if (action === "open_shop") { this.shopOpen = true; this.say("새봄 상점입니다. 필요한 씨앗을 골라 보세요."); }
    else if (action === "craft") { this.craftingOpen = true; this.virtualMovement = { x: 0, y: 0 }; this.player.setVelocity(0, 0); this.say("제작대에서 재료를 가공할 수 있어요."); }
    else if (action === "sell") this.sellHarvest();
  }

  private useAtWorld(worldX: number, worldY: number) {
    if(this.isPaused()) return;
    if (this.family && (this.isPaused() || this.family.busy)) return;
    if (this.family && !this.family.snapshot) { this.say("가족 농장 상태를 불러오는 중이에요. 이동은 계속할 수 있습니다."); return; }
    if (this.currentMapId === FAIRY_FOREST_ID) { this.useForestResource(worldX, worldY); return; }
    if (this.selectedTool === "axe" || this.selectedTool === "pickaxe") { this.say("도끼와 곡괭이는 요정의 숲에서 사용해 주세요."); return; }
    if (this.currentMapId !== "farm") { this.say("이곳에서는 농사 도구를 사용할 수 없어요."); return; }
    const x = Math.floor(worldX / GAME_CONFIG.tileSize), y = Math.floor(worldY / GAME_CONFIG.tileSize);
    if (!TILE_TYPE_DEFINITIONS[getTileTypeInMap(this.mapRegistry.require("farm"), x, y)].farmable) { this.say("이곳에서는 농사 도구를 사용할 수 없어요."); return; }
    const tile = this.farm.get(`${x},${y}`);
    if (!tile) { this.say("이곳에서는 농사 도구를 사용할 수 없어요."); return; }
    const center = tilePoint(x + 0.5, y + 0.5);
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, center.x, center.y) > GAME_CONFIG.farmInteractionDistance) { this.say("조금 더 가까이 가 주세요."); return; }
    if (this.family) {
      this.toolActions.execute(this.selectedTool, this.facing, (tool) => { void this.family!.act({ kind: "tool", tool, cropId: this.selectedCrop, x, y, pose: this.familyPose() }); });
      return;
    }
    const executed = this.toolActions.execute(this.selectedTool, this.facing, (tool) => this.applyTool(tool, tile));
    if (!executed) return;
    this.worldRenderer.renderFarmTile(tile); this.save(false); this.emitHud();
  }

  private useForestResource(worldX: number, worldY: number) {
    const map = this.mapRegistry.require(FAIRY_FOREST_ID);
    const object = findForestResource(map, { x: worldX, y: worldY }, this.player);
    if (!object) { this.say("채집할 숲 자원 가까이에서 사용해 주세요."); return; }
    const kind = resourceKind(object)!;
    if (this.selectedTool !== FOREST_RESOURCES[kind].tool) {
      this.say(`${FOREST_RESOURCES[kind].name}: ${FOREST_RESOURCES[kind].tool === "axe" ? "도끼" : FOREST_RESOURCES[kind].tool === "pickaxe" ? "곡괭이" : "손"}을(를) 사용해 주세요.`); return;
    }
    if (this.selectedTool === "pickaxe" && !this.toolProgression.pickaxe) { this.say("제작대에서 곡괭이를 해금해 주세요."); return; }
    if (this.family) {
      const daySerial = this.family.snapshot?.world.daySerial ?? this.family.snapshot?.world.day;
      if (!daySerial) { this.say("가족 숲의 최신 상태를 받는 중이에요."); return; }
      this.toolActions.execute(this.selectedTool, this.facing, tool => {
        const before = this.sharedForestState;
        const priorCount = this.inventory.count(FOREST_RESOURCES[kind].drop);
        void this.family!.act({ kind: "forest-gather", nodeId: object.id, daySerial, tool, pose: this.familyPose() }).then(accepted => {
          if (!accepted || !this.sceneLive || this.currentMapId !== FAIRY_FOREST_ID) return;
          const definition = FOREST_RESOURCES[kind];
          const delta = this.inventory.count(definition.drop) - priorCount;
          const feedback = forestFeedback(object, before, this.sharedForestState, definition.drop, delta);
          if (feedback) this.forestEffects.play(object, feedback);
        });
      });
      return;
    }
    this.toolActions.execute(this.selectedTool, this.facing, () => {
      const before = this.forestState;
      const result = strikeForestNode(this.forestState, object, this.selectedTool, this.toolProgression);
      this.forestState = result.state;
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
    });
  }

  private applyTool(tool: ToolKey, tile: FarmTileData) {
    const crop = getCropDefinition(this.selectedCrop);
    if (tool === "hoe") {
      if (tile.tilled) this.say("이미 잘 갈아 둔 밭이에요."); else { tile.tilled = true; this.say("포슬포슬하게 땅을 갈았어요."); }
    } else if (tool === "seed") {
      if (!tile.tilled) this.say("먼저 괭이로 땅을 갈아야 해요.");
      else if (tile.cropStage !== null) this.say("이미 작물이 자라고 있어요.");
      else if (!this.inventory.consume(crop.seedItemId)) this.say("씨앗이 없어요. 마을 상점에서 살 수 있어요.");
      else { tile.cropType = this.selectedCrop; tile.cropStage = 0; tile.wateredToday = false; tile.plantedDay = this.day; this.say(`${crop.name} 씨앗을 심었어요.`); }
    } else if (tool === "water") {
      if (tile.cropStage === null) this.say("먼저 씨앗을 심어 주세요.");
      else if (tile.wateredToday) this.say("오늘은 이미 촉촉하게 물을 주었어요.");
      else { tile.wateredToday = true; this.say("물을 주었어요. 오늘 하루를 마치면 한 단계 자라요!"); }
    } else if (!tile.cropType || tile.cropStage === null || !isMatureCrop(tile.cropType, tile.cropStage)) this.say("아직 수확할 때가 아니에요.");
    else { const harvested = getCropDefinition(tile.cropType); this.inventory.add(harvested.harvestItemId); Object.assign(tile, { cropType: null, cropStage: null, wateredToday: false, plantedDay: null, tilled: true }); this.say(`통통한 ${harvested.name}를 수확했어요!`); }
  }

  private handleCommand(command: Command) {
    if(command.type==="village-open"){
      if(this.dialogue||this.npcRequest)return;
      this.journalOpen=command.value===true;this.virtualMovement={x:0,y:0};
      if(this.journalOpen&&this.family)void this.family.loadProgress().then(()=>{if(this.sceneLive)this.emitHud();}).catch(()=>{if(this.sceneLive)this.say("주민 기록을 불러올 수 없어요. 연결 후 다시 열어 주세요.");});
      this.emitHud();return;
    }
    if(command.type==="quest-action"){void this.questAction(command.value as QuestAction);return;}
    if(command.type==="dialogue-close"||command.type==="dialogue-next") {
      if(this.dialogue && command.type==="dialogue-next" && this.dialogue.index+1<this.dialogue.lines.length) this.dialogue.index++;
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
    if (command.type === "action") this.useFacingTile();
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
        if (ok && this.sceneLive) this.say(`${upgrade.name}을(를) 마쳤어요.`);
      }).finally(() => { if (this.sceneLive) { this.craftingBusy = false; this.emitHud(); } });
      return;
    }
    if (!upgradeTool(this.inventory, this.toolProgression, upgrade)) { this.say("도구 단계나 재료를 확인해 주세요."); return; }
    this.save(false); this.say(`${upgrade.name}을(를) 마쳤어요.`);
  }

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
    const { amount, earned } = sellAllCrops(this.inventory);
    if (!amount) this.say("판매할 수확물이 없어요.");
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
      this.daySerial++;
      this.syncForest();
      this.day = this.day >= GAME_CONFIG.day.daysPerSeason ? 1 : this.day + 1; this.timeMinutes = GAME_CONFIG.day.startMinutes;
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
    const npcPoses=this.npcs?.sample(this.day,this.npcTime())??[];
    const villagers=NPC_DEFINITIONS.map(n=>{const p=npcPoses.find(p=>p.npcId===n.id),points=personal.relationships[n.id].points;return {id:n.id,name:n.name,points,level:relationshipLevel(points),location:p?this.mapRegistry.get(p.mapId)?.name??"다른 장소":"다른 장소",activity:p?.activity??"휴식"};});
    const step = this.getObjective();
    const hud: HudState = { toolProgression: { ...this.toolProgression }, craftingOpen:this.craftingOpen,craftingBusy:this.craftingBusy,craftingItems:this.inventory.serialize().items,villageOpen:this.journalOpen,villagers,quests:this.family&&!this.family.progress?[]:questViews(this.family?.progress?.data??this.playerProgress,this.inventory), npcBusy:this.npcRequest, dialogue:this.dialogue, money: this.money, selectedCrop: this.selectedCrop, seedCounts: Object.fromEntries(Object.values(CROP_DEFINITIONS).map(c => [c.id, this.inventory.count(c.seedItemId)])), seeds: this.inventory.count(getCropDefinition(this.selectedCrop).seedItemId), harvest: Object.values(CROP_DEFINITIONS).reduce((n,c) => n + this.inventory.count(c.harvestItemId), 0), resources: { wood:this.inventory.count("wood"),stone:this.inventory.count("stone"),wild_herb:this.inventory.count("wild_herb"),moon_mushroom:this.inventory.count("moon_mushroom"),fairy_bloom:this.inventory.count("fairy_bloom") }, selectedTool: this.selectedTool,
      objective: step.objective, message: this.message, progress: step.progress, day: this.day, timeText: this.formatTime(), sleepPrompt: this.sleepPrompt,
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
    this.day = snapshot.world.day; this.timeMinutes = snapshot.world.timeMinutes; this.money = snapshot.world.money;
    this.inventory = new Inventory(snapshot.inventory);
    this.toolProgression = normalizeToolProgression(snapshot.toolProgression);
    if (this.selectedTool === "pickaxe" && !this.toolProgression.pickaxe) this.selectedTool = "hand";
    for (const remote of snapshot.world.farm) {
      const tile = this.farm.get(`${remote.x},${remote.y}`);
      if (tile && JSON.stringify(tile) !== JSON.stringify(remote)) { Object.assign(tile, remote); this.worldRenderer.renderFarmTile(tile); }
    }
    this.emitHud();
  }
  private snapshot(): SaveData { return { version: 4, playerProgress:this.playerProgress, toolProgression:this.toolProgression, forestState:this.forestState, daySerial:this.daySerial, day: this.day, timeMinutes: this.timeMinutes, money: this.money, selectedTool: this.selectedTool,
    player: { x: this.player.x, y: this.player.y, facing: this.facing, mapId: this.currentMapId }, inventory: this.inventory.serialize(), farm: [...this.farm.values()].map((tile) => ({ ...tile })), savedAt: Date.now() }; }
  private save(notify: boolean) { if (!this.player || this.testMode) return; if (this.family) { this.family.savePersonal(this.familyPose(), this.daySerial); return; } this.repository.save(this.snapshot()); if (notify) this.say("이 브라우저에 현재 장소와 농장 상태를 저장했어요."); }
  private syncForest(force = false) {
    if (this.testMode || (!force && this.forestDayInstalled === this.daySerial)) return;
    if (!this.family && this.forestState.daySerial !== this.daySerial) this.forestState = emptyForestState(this.daySerial);
    if (installFairyForest(this.mapRegistry, this.forestScope, this.daySerial, this.family ? this.sharedForestState ?? undefined : this.forestState)) this.forestDayInstalled = this.daySerial;
  }
  private applySavedState(data: SaveData) {
    this.playerProgress=normalizeProgress(data.playerProgress);this.daySerial=data.daySerial??data.day;
    this.forestState=normalizeForestState(data.forestState,this.daySerial);
    this.forestDayInstalled=0;
    this.day = data.day; this.timeMinutes = data.timeMinutes; this.money = data.money; this.toolProgression = normalizeToolProgression(data.toolProgression); this.selectedTool = data.selectedTool === "pickaxe" && !this.toolProgression.pickaxe ? "hand" : data.selectedTool;
    this.inventory = new Inventory(data.inventory); this.facing = data.player.facing; this.currentMapId = data.player.mapId;
    for (const saved of data.farm) { const tile = this.farm.get(`${saved.x},${saved.y}`); if (tile) Object.assign(tile, saved); }
    this.lateNightWarned = this.timeMinutes >= GAME_CONFIG.day.lateNightMinutes;
  }
  private restore(data: SaveData, notify: boolean) { this.applySavedState(data); this.syncForest(); this.loadMap(data.player.mapId, undefined, data.player); if (notify) this.say("저장된 장소와 농장을 불러왔어요."); }
}
