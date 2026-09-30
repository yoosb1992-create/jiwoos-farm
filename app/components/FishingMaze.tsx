"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FISH_DEFINITIONS } from "@/game/fishing/definitions";
import {
  fishingCatchGrade, fishingMazeCanMove, fishingMazeDifficulty, fishingMazeWalls, generateFishingMaze,
  type FishingMinigameResult, type FishingMinigameState, type FishingMazeCell,
} from "@/game/fishing/maze";

type Point = { x: number; y: number };

export function FishingMaze({ session, onResolve }: { session: FishingMinigameState; onResolve: (result: FishingMinigameResult) => void }) {
  const difficulty = fishingMazeDifficulty(session.fishId);
  const fish = FISH_DEFINITIONS[session.fishId];
  const maze = useMemo(() => generateFishingMaze(session.castId, session.fishId), [session.castId, session.fishId]);
  const walls = useMemo(() => fishingMazeWalls(maze), [maze]);
  const boardRef = useRef<SVGSVGElement>(null);
  const active = useRef<{ pointerId: number; point: Point; cell: FishingMazeCell } | null>(null);
  const resolved = useRef(false);
  const attemptsRef = useRef(difficulty.attempts);
  const deadline = useRef(Date.now() + difficulty.timeLimitMs);
  const [attemptsLeft, setAttemptsLeft] = useState(difficulty.attempts);
  const [remainingMs, setRemainingMs] = useState(difficulty.timeLimitMs);
  const [trail, setTrail] = useState<Point[]>([]);
  const [status, setStatus] = useState("물고기에서 시작해 낚싯바늘까지 한 번에 이어 그리세요.");

  const resolve = (success: boolean, grade?: FishingMinigameResult["grade"], message?: string) => {
    if (resolved.current) return;
    resolved.current = true; active.current = null;
    if (message) setStatus(message);
    window.setTimeout(() => onResolve({ castId: session.castId, success, grade }), success ? 420 : 520);
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (resolved.current) return;
      const remaining = Math.max(0, deadline.current - Date.now());
      setRemainingMs(remaining);
      if (remaining <= 0) resolve(false, undefined, "시간 종료! 물고기가 빠져나갔어요.");
    }, 80);
    return () => window.clearInterval(timer);
  }, []);

  const pointFor = (event: ReactPointerEvent<SVGSVGElement>): Point | null => {
    const box = boardRef.current?.getBoundingClientRect();
    if (!box?.width || !box.height) return null;
    const limit = maze.size - .0001;
    return {
      x: Math.max(0, Math.min(limit, (event.clientX - box.left) / box.width * maze.size)),
      y: Math.max(0, Math.min(limit, (event.clientY - box.top) / box.height * maze.size)),
    };
  };
  const cellFor = (point: Point): FishingMazeCell => ({ x: Math.floor(point.x), y: Math.floor(point.y) });
  const sameCell = (a: FishingMazeCell, b: FishingMazeCell) => a.x === b.x && a.y === b.y;

  const consumeAttempt = (message: string) => {
    if (!active.current) return;
    active.current = null; setTrail([]);
    const next = attemptsRef.current - 1;
    attemptsRef.current = next; setAttemptsLeft(next);
    if (next <= 0) resolve(false, undefined, "선긋기 기회를 모두 사용했어요. 물고기가 도망갔습니다.");
    else setStatus(`${message} 다시 물고기에서 시작하세요. · 남은 ${next}회`);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.preventDefault(); event.stopPropagation();
    if (resolved.current || active.current) return;
    const point = pointFor(event); if (!point) return;
    const cell = cellFor(point);
    if (!sameCell(cell, maze.start)) { setStatus("🐟 물고기 칸에서 선을 시작해 주세요."); return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = { pointerId: event.pointerId, point, cell };
    setTrail([point]); setStatus("좋아요. 벽을 넘지 말고 🎣까지 이어 가세요.");
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = active.current;
    if (!current || current.pointerId !== event.pointerId || resolved.current) return;
    event.preventDefault(); event.stopPropagation();
    const point = pointFor(event); if (!point) return;
    const dx = point.x - current.point.x, dy = point.y - current.point.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / .12));
    let previousCell = current.cell;
    for (let i = 1; i <= steps; i++) {
      const sample = { x: current.point.x + dx * i / steps, y: current.point.y + dy * i / steps };
      const nextCell = cellFor(sample);
      if (!sameCell(nextCell, previousCell)) {
        if (!fishingMazeCanMove(maze, previousCell, nextCell)) { consumeAttempt("장애물에 줄이 걸렸어요!"); return; }
        previousCell = nextCell;
      }
    }
    current.point = point; current.cell = previousCell;
    setTrail(points => [...points, point].slice(-260));
    if (sameCell(previousCell, maze.goal)) {
      const usedAttempt = difficulty.attempts - attemptsRef.current + 1;
      const grade = fishingCatchGrade(usedAttempt);
      resolve(true, grade, grade === "perfect" ? "Perfect! 한 번에 길을 찾았어요!" : grade === "good" ? "Good! 물고기를 끌어냈어요!" : "Catch! 물고기를 끌어냈어요!");
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (active.current?.pointerId !== event.pointerId || resolved.current) return;
    event.preventDefault(); event.stopPropagation();
    consumeAttempt("도착 전에 선이 끊겼어요.");
  };

  const seconds = (remainingMs / 1000).toFixed(1);
  const wallWidth = Math.max(.065, .11 - maze.size * .004);
  const trailPoints = trail.map(point => `${point.x},${point.y}`).join(" ");

  return <div className="fishing-maze-shade" role="dialog" aria-modal="true" aria-label={`${fish.name} 낚시 미로`}
    onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}>
    <section className="fishing-maze-card">
      <header>
        <div><small>🎣 입질! · {difficulty.label}</small><h2>{fish.name}를 끌어올리세요</h2></div>
        <div className="fishing-maze-stats"><b className={remainingMs <= 5000 ? "danger" : ""}>{seconds}초</b><span>선긋기 {attemptsLeft}회</span></div>
      </header>
      <p>🐟에서 시작해 장애물을 넘지 않고 🎣까지 드래그하세요. 벽을 넘거나 중간에 손을 떼면 한 번의 기회를 사용합니다.</p>
      <div className="fishing-maze-board-wrap">
        <svg ref={boardRef} className="fishing-maze-board" viewBox={`0 0 ${maze.size} ${maze.size}`} preserveAspectRatio="xMidYMid meet"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
          <rect x="0" y="0" width={maze.size} height={maze.size} className="fishing-maze-water" />
          {walls.map((wall, index) => <line key={index} x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
            className="fishing-maze-wall" strokeWidth={wallWidth} />)}
          {trail.length > 1 && <polyline points={trailPoints} className="fishing-maze-trail" strokeWidth={Math.max(.08, .13 - maze.size * .004)} />}
          <circle cx={maze.start.x + .5} cy={maze.start.y + .5} r=".34" className="fishing-maze-start" />
          <circle cx={maze.goal.x + .5} cy={maze.goal.y + .5} r=".34" className="fishing-maze-goal" />
          <text x={maze.start.x + .5} y={maze.start.y + .61} className="fishing-maze-icon">🐟</text>
          <text x={maze.goal.x + .5} y={maze.goal.y + .61} className="fishing-maze-icon">🎣</text>
        </svg>
      </div>
      <footer><span aria-live="polite">{status}</span><button type="button" onClick={() => resolve(false, undefined, "낚시를 포기했어요.")}>포기</button></footer>
    </section>
  </div>;
}
