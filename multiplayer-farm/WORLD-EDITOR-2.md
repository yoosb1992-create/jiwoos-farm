# World Editor 2.0 (v2.7)

Work branch: `feature/v2.7-world-editor-2`  
Base: `d4f645c30b0666151f7894ad9e32ec0d0422690a` (`feature/v2.6-farm-content-expansion`, verified CI success).

This branch preserves the production v2.6 branch and the multiplayer-lab source. It does not overwrite existing family saves. The game and editor remain separate Vite entries (`/` and `/editor.html`). The editor UI, undo journal, draft store, palette and prefabs are absent from the game entry. Rendering and authoritative world rules are shared.

## Phone workflow

1. Open the editor; use ☰ → 지역 설정 to create a named region. Farm, village, road, fairy forest, mines, coast and indoor maps remain selectable.
2. Brush opens terrain, tool, size, collision and zone controls. One finger operates the selected tool. Two fingers pan/pinch; adding a second finger cancels an uncommitted stroke. Long press opens properties. The bottom sheet collapses with ⌄.
3. Use objects to search real sprite thumbnails. ☆, recent and favorites persist on the device. Tap an asset and then the map. Selection supports large touch resize handles, group movement and property fields.
4. Paint farmable/fishing/placement zones; add spawns and rectangular automatic warps. Warp properties select destination map and spawn. A building can create an entrance marker. Server validation rejects missing destinations.
5. NPC schedules accept time, position, facing, activity label and optional dialogue. The A → B navigation test uses the same collision and elevation rules as gameplay.
6. Spring/summer/autumn/winter and morning/day/evening/night/clear/rain/snow/fog controls preview the world. Seasonal terrain overrides and seasonal object visibility avoid duplicating maps.
7. ▶ Test creates an isolated local world and test actor. Tap paths or use directional buttons; confirm collision, automatic warps, farming, fishing eligibility, NPC positions and basic events. Exit restores the original editor camera and draft. It never logs in or writes a family save.
8. Save records a server blueprint. Initial World publishes a version of that blueprint. New Family creates a farm from the selected published version. Continue on an existing family retains its original world.
9. JSON export/import transfers a blueprint between phone and tablet without an edit key. Import validates schema, sizes, IDs, chunk coordinates, property bounds and warp links. The receiving device creates its own editing capability when saving a new blueprint.

## World data

`WorldLayout.version = 2` extends the v1 compatibility envelope. Each `MapData.world2` contains:

- `chunkSize: 16`, deterministic `seed`, and sparse `chunks["cx,cy"].layers`.
- Numeric palette cells: terrain, water, elevation, collision, zones, spring, summer, autumn, winter. Codes resolve to stable semantic names in `TERRAIN`, not sprite-sheet coordinates.
- Water configuration (pond/river/forest/sea/cave, seasonal/common/rare fish table, season override, rare bonus), NPC routes, and declarative event zones.
- Objects retain existing assets/anchors plus layer, size, rotation, depth offset, visible/seasons, group, bridge, tree and building properties. Warps/spawns remain compatible arrays.
- Published copies carry `blueprintId` and `worldVersion`; created worlds also record `initialWorldVersion` and `blueprintId`.

Twenty terrain types: grass, dark_grass, soil, tilled_soil, sand, beach_sand, stone, gravel, stone_path, dirt_path, wood_floor, snow, water, shallow_water, deep_water, cliff, hill, stairs, ramp, mine_floor.

Autotiling uses N/E/S/W cardinal bits and four gated diagonal bits. Painted edges and concave corners are derived from neighbors; water depths connect as a water family. A coordinate/seed hash selects stable three-way texture/tone variations. Water shores are static painted tiles; continuous animated waves are not implemented.

Elevation supports flat, raised, cliff, stairs and ramp. Shared movement/pathfinding only cross elevation boundaries through stairs/ramps. Water/cliffs block by default. Bridges and explicit walkable paint permit crossing; explicit blocked paint takes priority. Object colliders and manual collision are separate. Rotation is visual; colliders remain axis aligned.

## Implemented tools and panels

| Area | Scope |
|---|---|
| Brushes | Pencil, eraser, filled rectangle/circle, line, iterative bucket, eyedropper; sizes 1–15 |
| Selection | Area selection, object/group move, large resize handle, copy/paste/delete; terrain+objects move together in a selected region |
| Layers | Terrain, Water, Elevation, Ground Decoration, Objects, Buildings, Upper Decoration, Collision, Zones, NPC, Events, Seasonal; visibility, locks, edit focus |
| Palette | Nature/Farm/Village/Water/Buildings, thumbnails, search, device favorites/recent |
| Trees/buildings | Existing tree variants, five growth scales, stump/chop/daily regrow/drop settings; entrance marker, home annotation, shadow |
| Zones | Farmable, building, decoration, animal, forage spawn, fishing, no-placement; chunk brush masks |
| Authority | Same collision/farmable/fishing/placement/warp data on client and server; forage zones generate deterministic daily gatherables |
| NPC | Time points, facing, activity annotation, optional dialogue; cached collision-aware paths shared by client interaction and server validation |
| Events | Enter/interact/day/time/weather/season/quest conditions; dialogue/item/warp/quest/decorative message actions; once per player or once per player per day |
| Seasons | Four sparse overlays plus object visibility; separate lighting/weather preview controls |
| Nature | Seeded forest/meadow brushes, density, tree/bush/rock/flower/mushroom weights |
| Prefabs | Pond, field, flowerbed, forest, bridge, yard, pasture, plaza; device custom selection stamps |
| Navigation | Grid, coordinates, tile/half/free snapping, minimap jump, A → B route and collision overlay |
| Map sizing | Explicit apply button, crop confirmation, reversible trimmed cells/objects and clamped spawns/warps |

## Memory and performance

- 16×16 sparse semantic chunks; maximum single map 262,144 cells, each axis 12–1024; up to 32 regions and 1,048,576 cells across a blueprint. JSON requests/imports cap at 16 MiB.
- Editor draws only viewport chunks, with a 32-entry LRU at 256×256 pixels (about 8 MiB raw pixel storage). Distant zoom uses sampled terrain colors instead of rendering full-resolution world textures. No per-tile DOM elements.
- Gameplay creates/removes visible 512×512 GPU ground textures, and spatially culls authored objects. Immutable layouts are shared across server action proposals rather than deep-cloned on every action.
- 60 undo actions: changed cells are grouped by chunk and packed as `(index,before,after)` bytes. One fully painted 80,000-cell layer is 240,000 bytes of cell history, not 80,000 JavaScript change objects retained per undo. Object edits retain only affected objects; small metadata changes retain affected fields. A completed stroke is one action.
- Drafts are stored in IndexedDB with a 5-second debounce and visibility/page-hide flush attempts. An abrupt process kill can still lose the last unflushed five seconds. Draft saving never publishes.

## Persistence and authorization

Existing per-blueprint random 256-bit edit capabilities are reused. The backend stores only their hash and checks the bearer edit key and expected revision on save/publish. A capability authorizes its own blueprint, not existing families or another blueprint. Creating a private blueprint is allowed without a game/family password. This is a per-device/per-blueprint publishing model, not a global administrator changing every player's default. No new secrets are committed.

Saved blueprint and published snapshot are separate database fields. Saving does not replace the previous published snapshot. New farms copy the published version, so later edits/publishing do not hot-reload any connected farm. The optional "apply to current farm" feature is intentionally not offered; no live-farm destructive endpoint was added.

## Validation and remaining limits

Local validation: typecheck and server/client build pass; 16 unit tests (including 80,000-cell roundtrip/60 history/autotile seam/authority), 6 multiplayer integration tests, 6 deployment tests, and all 4 browser tests pass. The phone smoke covers create 400×200 map, water painting, undo/redo, NPC point, winter preview, isolated test play, IndexedDB restore, publish, and creating a playable family carrying the new map. This is browser emulation, not measured Android hardware performance.

Still limited:

- No 3D or arbitrary elevation heights; no animated water waves.
- Existing art plus small generated water decorations/bridge variants are reused. New artwork for eight distinct tree species and separate NPC animation asset selection is not included.
- NPC routes are editable for existing NPCs; there is no NPC character/portrait authoring. The activity field is an annotation, not arbitrary animation scripting. Cross-map schedule changes use schedule boundaries rather than simulated journeys across several maps.
- Event actions do not include music switching, scripted NPC movement or changing authoritative global weather. Decorative effect is a message. Event reuse is once/day rather than every re-entry.
- Fishing settings are per map, shared by its painted fishing masks, not individually named pools. Seasonal overlays/visibility are visual; hiding a seasonal static object does not remove its base collision.
- Group identifiers group objects; terrain travels with area selection or a prefab, not a persisted hierarchical mixed-layer group.
- Test play is an isolated validation actor, not the complete multiplayer lobby/game UI or fishing minigame. It verifies fishing eligibility and shared farm actions.
- Local custom prefabs/favorites are not account-synchronized. Undo history resets on import/reload; the draft itself persists.
- Current-farm replacement/checkpoint migration is absent. Production v2.6 stays unchanged.
- Railway Preview could not be provisioned: the account returned `Free plan resource provision limit exceeded. Please upgrade to provision more resources!`. No v2.7 live editor URL exists yet. See `RAILWAY-V27.md`.

CI records for runtime source commit `d35436a6263f375ec779648729168f08dc4d7476`:

- [Root regression/build](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37498749820)
- [Farm/World Editor, Postgres, Docker and golden lab](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37498750084)

Subsequent documentation-only commits do not alter that runtime tree and follow the repository's existing workflow path filters.
