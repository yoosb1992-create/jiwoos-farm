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
