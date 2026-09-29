# NPC world foundation

NPC content lives in `game/npc/definitions.ts`, separate from map editor JSON. `NpcController.sample(day, minute)` is pure with respect to game time: independently joined clients sample the same route, independent of frame rate. NPC positions are not persisted or polled.

A schedule step has a start minute, optional seasonal day list, destination map, explicit starting cell and target cell, arrival facing and activity. At a map-changing step the actor disappears from the old map and appears at the new step's safe starting cell. No warp trigger is executed. Authors must explicitly align consecutive same-map route endpoints. Speed is pixels per real second converted through the configured game-minute duration.

Navigation uses fixed-order cardinal BFS and a conservative cell mask for non-walkable terrain, map bounds, collision regions, object collision rectangles plus actor clearance and warp cells. Unreachable destinations leave actors at their safe starting point; invalid/missing maps or starts omit them. A controller is scoped to one immutable MapRegistry snapshot; recreate it after map editing.

Validation and sampling tests run with the existing regression suite. Map editor document/schema and player asset IDs are unchanged.

## First residents and graphics

| ID | Resident | Routine (game time) |
| --- | --- | --- |
| daon | 다온, meticulous warm shopkeeper, teal hair / terracotta apron | 06:00 town, 08:00 store, 13:00 store shelves, 18:00 town |
| boram | 보람, patient farmer, mustard scarf / green overalls | 06:00 farm, 11:00 road, 15:00 town, 19:00 farm |
| soli | 솔이, curious young nature observer, mint cap / blue jacket / backpack | 06:00 town, 10:00 road, 14:00 farm pond, 18:00 town |

`public/assets/npc/{daon,boram,soli}.png`: 256×144 RGBA, 8 columns × 4 rows, 32×36 frames. Rows down/up/left/right; first four columns idle, last four walk. Therefore idle ranges 0–3/8–11/16–19/24–27, walk 4–7/12–15/20–23/28–31. Bottom baseline 34 with transparent final row. Missing/invalid sheets use distinct generated fallback textures. Player main/dev sheets remain unchanged.

Built-in imagegen generated each original atlas. Prompt set: original cozy farming NPC pixel art, true transparent background, 8×4 equal cells, down/up/left/right rows, four subtle idle plus four alternating contact/passing walking poses, aligned feet, dark outline/earth palette, no text/grid/commercial-game copies. Character variants: Daon short teal hair, cream shirt, terracotta apron; Boram auburn braid, mustard headscarf, sage overalls; Soli brown bob, mint leaf cap, blue jacket, cream shorts, tan backpack. Atlases were packaged into exact engine cells with nearest-neighbour scaling and a common scale per character.

Family snapshots carry fractional `npcTimeMinutes` derived from the shared server clock. Clients interpolate this clock for at most two seconds between snapshots, then freeze NPCs until recovery. This adds no NPC polling or stored movement. Local mode uses its local game clock. Small network latency differences remain possible; identical day/minute always resolves to the same pose.

## Dialogue

`game/npc/dialogue.ts` selects data-only scripts independently of the React `NpcDialogue` UI. First meeting has priority, then the time-of-day pool plus general and day-gated lines rotates while avoiding consecutive repeats. Space/mobile action selects the nearest same-map NPC within 64px before object/tool actions. Dialogue freezes only the local actor; Family clock and presence polling continue. Next/close controls are touch-sized. No AI API is connected.

## Personal relationships and storage

Daily first talk grants 10 points, capped at 1000. Levels at 0/20/80/200 are data-owned in `game/npc/progress.ts`. A monotonically increasing optional `daySerial` distinguishes a new spring after day 28; legacy worlds default it to their current day. Repeated dialogue on one day never grants duplicate points.

Single-player SaveData remains v4 with optional `playerProgress` and `daySerial`; old saves normalize to zero relationships. Family progress uses a separate `family_player_progress` table, keyed by membership player ID, with revision CAS and member FK cascade. Read/write APIs retain ChatGPT authentication and room membership checks. Day/world revision is checked when committing dialogue, so a concurrent sleep cannot apply a bonus for the wrong snapshot. The server uses its NPC schedule and checks player proximity (96px server allowance for polling latency). Progress is fetched once on family entry and on interaction, not per-frame. Rejoining the same membership preserves it; leaving the room removes that membership's progress.

`drizzle/0004_player_progress.sql` is prepared for a future staging-only deployment. It has only been applied to ephemeral local SQLite tests. No staging or production migration/deployment is performed in this task.

## Quests

Definitions in `game/quests/definitions.ts` own prerequisites, NPC giver, objective and reward. `engine.ts` computes locked/available/active/completed/rewarded states and applies transitions. Three starter quests: greet all three residents after accepting Boram's request; deliver one sproutberry to Daon; deliver one morningcarrot to Soli. Delivery consumes the item before completion, claiming is separate and can occur only once. Greetings and deliveries are personal. Money rewards enter the family treasury; seed and relationship rewards belong to the claimant.

Family quest delivery/reward changes use one D1 batch transaction with progress and world revision checks plus a unique mutation receipt. The server ignores client reward quantities/prices and reads its own definitions. Local SQLite tests exercise duplicate claims, stale revisions, member isolation and forced second-statement failure to confirm transaction rollback. No additional quest migration beyond 0004 is needed.

## Village UX and future editor integration

NPC names render over their sprites. `!` means an available quest; `★` means a delivery or reward is ready. A nearby unobstructed resident shows `대화 ⋯`. Client selection and server interaction checks both reject rays through solid terrain/objects. Actors are non-physics views whose deterministic paths avoid fixed map obstacles; they do not block family players. Open `주민·의뢰` in the game menu for current resident locations, relationship levels and quest status. The journal/dialogue blocks only local movement, with no Family time pause. Panels are scrollable and closed during normal movement.

NPC schedules/spawns remain a separate data model from MapEditorDocument. The editor schema is unchanged; a future NPC editor can edit these definitions through an independent document adapter. Custom maps with missing or blocked NPC destinations safely omit those NPCs instead of altering editor data.

## Verification and manual staging checklist

Automated tests cover definition validity, day/time selection, map transitions, deterministic sampling, route collision masks, spritesheet dimensions/frames/fallback, first/period/progress dialogue selection, per-day relationship points and day-28 rollover, v1/v4 save compatibility, Family membership/privacy/reconnect/CAS/cascade, quest transitions/rewards/rollback, UI markup, existing Family Beta, spring crops and map editor regression. Rendering tests use a narrow Phaser scene double; UI tests render React markup. They are not two real accounts or a real mobile browser session.

A subsequent explicitly requested staging deployment must apply migration 0004 once to the existing isolated Family staging D1 before serving this branch. Do not recreate tables, reapply 0000–0003, or use production. This task prepares source only: the live staging remains Family Beta.

After that deployment:

1. Log in as A and B on separate devices, join the same farm and close help. Visit Boram near the farm's western path, then Daon/Soli in town. Compare their positions at the same shared time, including schedule map transitions.
2. Check walking/idle direction, stable feet, name labels, `!`/`★` and proximity speech indicator. NPCs should avoid buildings, water and warp trigger cells.
3. Open dialogue with Space/mobile action. Confirm next/close, repeated line rotation, morning/afternoon/evening lines, and day-gated lines. Only the talking player stops; B and shared time continue.
4. Talk twice on one day: only +10 once. Check A/B relationship isolation, reconnect persistence, and a fresh bonus after sleeping on the next day.
5. Accept Boram's greeting quest, then greet all three (including Boram again), return and claim. Verify a second claim is unavailable. A's journal progresses independently of B's.
6. Accept Daon's sproutberry delivery and Soli's carrot delivery. Grow/harvest the required crop, deliver once, then claim. Check personal item consumption/seeds and shared money on both clients.
7. If the NPC walks away or changes maps during a long conversation, close it and approach again before delivering or claiming; the server always rechecks current proximity.
8. Interrupt connectivity during an interaction, then reopen the journal after recovery. A response lost after a successful commit must not grant a duplicate reward on retry.
9. On phone/tablet portrait and landscape, check scrolling, button hit targets, readable text and closing panels before using the joystick. Recheck existing family tools/sleep/management, local save/load and editor test-play/return/undo/export.

Remaining: no AI dialogue, gifting, NPC editor UI, dynamic avoidance between actors or complete continuous routes across maps. Schedule changes explicitly relocate to safe map cells. Network latency can produce small visual phase differences; disconnected clients freeze NPC extrapolation after two seconds. Personal records refresh on family entry, interaction or opening the journal, without additional recurring polling. Visual playtesting and two-account authentication must be performed by real users after the separate staging deployment.
