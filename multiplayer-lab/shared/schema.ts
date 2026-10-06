import { schema, t, type SchemaType } from '@colyseus/schema';

/** Only input crosses the client -> server boundary; never x/y positions. */
export const MoveInput = schema({
  moveX: t.float32().default(0),
  moveY: t.float32().default(0),
  run: t.boolean().default(false),
}, 'LabMoveInput');
export type MoveInput = SchemaType<typeof MoveInput>;

export const Player = schema({
  x: t.float64().default(96),
  y: t.float64().default(96),
  nickname: t.string().default('Player'),
  color: t.string().default('#60a5fa'),
  connected: t.boolean().default(true),
}, 'LabPlayer');
export type Player = SchemaType<typeof Player>;

export const LabState = schema({
  players: t.map(Player),
  tick: t.uint32().default(0),
}, 'LabState');
export type LabState = SchemaType<typeof LabState>;
