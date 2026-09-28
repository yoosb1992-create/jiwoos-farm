# NPC world foundation

NPC content lives in `game/npc/definitions.ts`, separate from map editor JSON. `NpcController.sample(day, minute)` is pure with respect to game time: independently joined clients sample the same route, independent of frame rate. NPC positions are not persisted or polled.

A schedule step has a start minute, optional seasonal day list, destination map, explicit starting cell and target cell, arrival facing and activity. At a map-changing step the actor disappears from the old map and appears at the new step's safe starting cell. No warp trigger is executed. Authors must explicitly align consecutive same-map route endpoints. Speed is pixels per real second converted through the configured game-minute duration.

Navigation uses fixed-order cardinal BFS and a conservative cell mask for non-walkable terrain, map bounds, collision regions, object collision rectangles plus actor clearance and warp cells. Unreachable destinations leave actors at their safe starting point; invalid/missing maps or starts omit them. A controller is scoped to one immutable MapRegistry snapshot; recreate it after map editing.

Validation and sampling tests run with the existing regression suite. Map editor document/schema and player asset IDs are unchanged.
