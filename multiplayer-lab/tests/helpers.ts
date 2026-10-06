import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { matchMaker } from '@colyseus/core';
import { Client, type InputHandle, type Room } from '@colyseus/sdk';
import { createLabServer } from '../server/createLabServer.js';
import { ROOM_NAME, SERVER_TICK_RATE } from '../shared/config.js';
import { type LabState, MoveInput, type Player } from '../shared/schema.js';

export type TestRoom = Room<unknown, LabState>;
export type TestServer = ReturnType<typeof createLabServer>;

export async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) assert.fail(`Timed out: ${message}`);
    await delay(10);
  }
}

export function authority(room: TestRoom): LabState {
  const actualRoom = matchMaker.getLocalRoomById(room.roomId);
  assert.ok(actualRoom, 'the actual server room must exist');
  return actualRoom.state as LabState;
}

export function player(state: LabState, sessionId: string): Player {
  const result = state.players.get(sessionId);
  assert.ok(result, `player ${sessionId} should exist`);
  return result;
}

export function point(position: { x: number; y: number }): { x: number; y: number } {
  return { x: position.x, y: position.y };
}

export function movement(room: TestRoom): InputHandle<MoveInput> {
  return room.input({ type: MoveInput, mode: 'reliable' });
}

/** Send at the real input rate, then wait for the server's input acknowledgement. */
export async function sendSteps(
  room: TestRoom,
  values: { moveX: number; moveY: number; run: boolean },
  steps: number,
): Promise<InputHandle<MoveInput>> {
  const input = movement(room);
  Object.assign(input.data, values);
  for (let i = 0; i < steps; i += 1) {
    input.send();
    await delay(1_000 / SERVER_TICK_RATE);
  }
  const lastSent = input.sentCount;
  await waitFor(() => input.lastProcessed >= lastSent, `acknowledge input ${lastSent}`);
  return input;
}

export async function joinPair(url: string): Promise<[TestRoom, TestRoom]> {
  const first: TestRoom = await new Client(url).create<LabState>(ROOM_NAME, { nickname: 'Alice' });
  first.reconnection.enabled = false;
  try {
    const second: TestRoom = await new Client(url).joinById<LabState>(first.roomId, { nickname: 'Bob' });
    second.reconnection.enabled = false;
    await waitFor(() => first.state.players?.size === 2 && second.state.players?.size === 2, 'both initial states');
    return [first, second];
  } catch (error) {
    await closeRooms([first]);
    throw error;
  }
}

export async function closeRooms(rooms: TestRoom[]): Promise<void> {
  await Promise.all(rooms.map(async (room) => {
    room.reconnection.enabled = false;
    if (room.connection.isOpen) await room.leave();
    else room.connection.close();
  }));
}

/** Terminate the real server socket: no consented leave message or protocol mock. */
export function dropConnection(room: TestRoom): void {
  // Node 22+ SDK clients may use the native global WebSocket, which has no
  // terminate(). The ws-transport server always exposes a real ws socket.
  const actualRoom = matchMaker.getLocalRoomById(room.roomId);
  const actualClient = actualRoom.clients.find((client) => client.sessionId === room.sessionId);
  assert.ok(actualClient);
  const socket = actualClient.ref as unknown as { terminate(): void };
  assert.equal(typeof socket.terminate, 'function');
  socket.terminate();
}

export async function ping(room: TestRoom): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('RTT measurement timed out')), 4_000);
    room.ping((milliseconds) => {
      clearTimeout(timer);
      resolve(milliseconds);
    });
  });
}
