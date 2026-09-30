import type { FishId } from "./types";

export type FishingCatchGrade = "perfect" | "good" | "catch";
export interface FishingMinigameState { castId: string; fishId: FishId }
export interface FishingMinigameResult { castId: string; success: boolean; grade?: FishingCatchGrade }
export interface FishingMazeDifficulty { size: number; timeLimitMs: number; attempts: number; label: string }
export interface FishingMazeCell { x: number; y: number }
export interface FishingMaze {
  size: number;
  start: FishingMazeCell;
  goal: FishingMazeCell;
  passages: readonly string[];
}
export interface FishingMazeWall { x1: number; y1: number; x2: number; y2: number }

const DIFFICULTY: Record<FishId, FishingMazeDifficulty> = {
  minnow: { size: 4, timeLimitMs: 14_000, attempts: 3, label: "쉬움" },
  crucian: { size: 5, timeLimitMs: 16_000, attempts: 3, label: "보통" },
  carp: { size: 6, timeLimitMs: 18_000, attempts: 3, label: "어려움" },
  catfish: { size: 7, timeLimitMs: 20_000, attempts: 2, label: "희귀" },
};

export const fishingMazeDifficulty = (fishId: FishId): FishingMazeDifficulty => DIFFICULTY[fishId];
export const isFishingCatchGrade = (value: unknown): value is FishingCatchGrade =>
  value === "perfect" || value === "good" || value === "catch";
export const fishingCatchGradeLabel = (grade: FishingCatchGrade | undefined) =>
  grade === "perfect" ? "Perfect! · " : grade === "good" ? "Good! · " : grade === "catch" ? "Catch! · " : "";
export const fishingCatchGrade = (attemptNumber: number): FishingCatchGrade =>
  attemptNumber <= 1 ? "perfect" : attemptNumber === 2 ? "good" : "catch";

const cellKey = (cell: FishingMazeCell) => `${cell.x},${cell.y}`;
export const fishingMazePassageKey = (a: FishingMazeCell, b: FishingMazeCell) => {
  const first = a.y < b.y || (a.y === b.y && a.x <= b.x) ? a : b;
  const second = first === a ? b : a;
  return `${cellKey(first)}|${cellKey(second)}`;
};

function seededRandom(seedText: string) {
  let state = 2166136261;
  for (const character of seedText) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  state >>>= 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

export function generateFishingMaze(castId: string, fishId: FishId): FishingMaze {
  const { size } = fishingMazeDifficulty(fishId);
  const start = { x: 0, y: size - 1 }, goal = { x: size - 1, y: 0 };
  const random = seededRandom(`jiwoos-farm:fishing-maze:v1:${castId}:${fishId}`);
  const passages = new Set<string>(), visited = new Set<string>([cellKey(start)]), stack: FishingMazeCell[] = [start];
  const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

  while (stack.length) {
    const current = stack[stack.length - 1];
    const candidates = directions
      .map(direction => ({ x: current.x + direction.x, y: current.y + direction.y }))
      .filter(next => next.x >= 0 && next.y >= 0 && next.x < size && next.y < size && !visited.has(cellKey(next)));
    if (!candidates.length) { stack.pop(); continue; }
    const next = candidates[Math.floor(random() * candidates.length)];
    passages.add(fishingMazePassageKey(current, next));
    visited.add(cellKey(next));
    stack.push(next);
  }
  return { size, start, goal, passages: [...passages] };
}

export function fishingMazeCanMove(maze: FishingMaze, from: FishingMazeCell, to: FishingMazeCell) {
  if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) !== 1) return false;
  return maze.passages.includes(fishingMazePassageKey(from, to));
}

export function fishingMazeWalls(maze: FishingMaze): FishingMazeWall[] {
  const walls: FishingMazeWall[] = [];
  const passage = new Set(maze.passages);
  const open = (a: FishingMazeCell, b: FishingMazeCell) => passage.has(fishingMazePassageKey(a, b));
  for (let y = 0; y < maze.size; y++) for (let x = 0; x < maze.size; x++) {
    if (y === 0 || !open({ x, y }, { x, y: y - 1 })) walls.push({ x1: x, y1: y, x2: x + 1, y2: y });
    if (x === 0 || !open({ x, y }, { x: x - 1, y })) walls.push({ x1: x, y1: y, x2: x, y2: y + 1 });
    if (x === maze.size - 1) walls.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
    if (y === maze.size - 1) walls.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1 });
  }
  return walls;
}
