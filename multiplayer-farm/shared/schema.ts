import { schema, t, type SchemaType } from "@colyseus/schema";

/** Only input crosses the client -> server boundary; never x/y positions. */
export const MoveInput = schema(
  {
    moveX: t.float32().default(0),
    moveY: t.float32().default(0),
    faceX: t.float32().default(0),
    faceY: t.float32().default(0),
    run: t.boolean().default(false),
  },
  "FarmMoveInput",
);
export type MoveInput = SchemaType<typeof MoveInput>;

export const Player = schema(
  {
    x: t.float64().default(96),
    y: t.float64().default(96),
    nickname: t.string().default("Player"),
    color: t.string().default("#60a5fa"),
    connected: t.boolean().default(true),
    playerId: t.string().default(""),
    area: t.string().default("farm"),
    facing: t.string().default("down"),
    moving: t.boolean().default(false),
    running: t.boolean().default(false),
    stamina: t.float64().default(100),
    actionTicks: t.uint8().default(0),
  },
  "FarmPlayer",
);
export type Player = SchemaType<typeof Player>;

export const WorldEntity = schema(
  {
    id: t.string(),
    area: t.string(),
    kind: t.string(),
    asset: t.string(),
    x: t.float64(),
    y: t.float64(),
    hp: t.int16(),
    stage: t.int16(),
    crop: t.string(),
    watered: t.boolean(),
    item: t.string(),
    quantity: t.uint16(),
    readyAt: t.float64(),
    owner: t.string(),
    species: t.string().default(""),
    planted: t.boolean().default(false),
    chopEnabled: t.boolean().default(true),
    regrow: t.boolean().default(false),
    treeDrop: t.string().default(""),
    treeStageDay: t.uint32().default(1),
  },
  "FarmEntity",
);
export type WorldEntity = SchemaType<typeof WorldEntity>;
export const FarmState = schema(
  {
    players: t.map(Player),
    tick: t.uint32().default(0),
    entities: t.map(WorldEntity),
    day: t.uint32().default(1),
    minute: t.uint16().default(360),
    weather: t.string().default("clear"),
    revision: t.uint32().default(0),
    deepest: t.uint8().default(1),
    votes: t.uint8().default(0),
    storage: t.string().default("ready"),
    layout: t.string().default(""),
  },
  "FarmState",
);
export type FarmState = SchemaType<typeof FarmState>;
