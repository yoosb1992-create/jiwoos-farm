import { Client, type Room } from "@colyseus/sdk";
import { randomUUID } from "node:crypto";
import { FarmState, MoveInput } from "../shared/schema.js";
import { ROOM_NAME } from "../shared/config.js";
import { createFarmServer } from "../server/createFarmServer.js";
import {
  PostgresStore,
  type Store,
  type Session,
} from "../persistence/store.js";
import { MemoryTestStore } from "../persistence/memory-test-store.js";
import type { ActionResult, Command } from "../shared/world.js";
export const delay = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));
export async function until(
  check: () => boolean,
  timeout = 5000,
): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error("condition timed out");
    await delay(10);
  }
}
export const makeStore = (): Store =>
  process.env.DATABASE_URL
    ? new PostgresStore(process.env.DATABASE_URL)
    : new MemoryTestStore();
export type TestRoom = Room<unknown, FarmState>;
export async function join(url: string, session: Session): Promise<TestRoom> {
  const room = await new Client(url).joinOrCreate<FarmState>(
    ROOM_NAME,
    { farmId: session.farmId, token: session.token },
    FarmState,
  );
  room.reconnection.enabled = false;
  room.onMessage("personal", () => undefined);
  room.onMessage("actionResult", () => undefined);
  await until(() => !!room.state?.players.has(room.sessionId));
  return room;
}
export function action(
  room: TestRoom,
  type: string,
  extra: Partial<Command> = {},
): Promise<ActionResult> {
  const command = { actionId: randomUUID(), type, ...extra };
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      off();
      reject(new Error(`Action timed out: ${type}`));
    }, 5000);
    const off = room.onMessage("actionResult", (result: ActionResult) => {
      if (result.actionId === command.actionId) {
        clearTimeout(timeout);
        off();
        resolve(result);
      }
    });
    room.send("action", command);
  });
}
export async function move(
  room: TestRoom,
  x: number,
  y: number,
  steps = 9,
  run = false,
): Promise<void> {
  const input = room.input({ type: MoveInput, mode: "reliable" });
  for (let i = 0; i < steps; i++) {
    input.data.moveX = x;
    input.data.moveY = y;
    input.data.run = run;
    input.send();
    await delay(1000 / 30);
  }
  await until(() => input.lastProcessed >= input.sentCount);
}
export async function fixture() {
  const store = makeStore();
  await store.migrate();
  const a = await store.login(true, "", "테스트 비밀번호", "A"),
    b = await store.login(false, a.farmId, "테스트 비밀번호", "B"),
    c = await store.login(false, a.farmId, "테스트 비밀번호", "C");
  const server = createFarmServer({ store, port: 0, host: "127.0.0.1" });
  const { url } = await server.listen();
  const A = await join(url, a),
    B = await join(url, b),
    C = await join(url, c);
  return {
    store,
    server,
    url,
    a,
    b,
    c,
    A,
    B,
    C,
    async close() {
      await Promise.all(
        [A, B, C].map((r) =>
          r.connection.isOpen ? r.leave() : Promise.resolve(),
        ),
      );
      await server.close();
    },
  };
}
