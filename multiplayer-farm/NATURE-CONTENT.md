# Nature content: World Editor 2.0

Baseline: `0a8ce8cd082dcb27a927a72165ce4b33eab2865d` on `feature/v2.7-world-editor-2`.
This change implements nature gameplay, rather than repeating the earlier Art Pass.

## Trees and balance

| Species ID | Name | Planting item | Days: seedling / young | Mature tree drops |
|---|---|---|---|---|
| tree_cherry | 벚꽃나무 | cherry_seed · 벚꽃 씨앗 | 3 / 4 | wood, cherry_petals, cherry_seed |
| tree_pine | 소나무 | pine_cone · 솔방울 | 3 / 5 | wood, pine_needles, pine_cone |
| tree_maple | 단풍나무 | maple_seed · 단풍 씨앗 | 3 / 4 | wood, maple_seed, maple_sap (15%) |
| tree_willow | 버드나무 | willow_sapling · 버드 묘목 | 2 / 4 | wood, willow_branch, willow_sapling |
| tree_birch | 자작나무 | birch_sapling · 자작 묘목 | 2 / 5 | wood, birch_bark, birch_sapling |
| tree_oak | 참나무 | acorn · 도토리 | 3 / 5 | wood, acorn |
| tree_bamboo | 대나무 | bamboo_shoot · 죽순 | 2 / 3 | bamboo, bamboo_shoot |
| tree_metasequoia | 메타세쿼이아 | metasequoia_seed · 메타세쿼이아 씨앗 | 3 / 5 | wood, metasequoia_seed (25%) |

Stages are persisted integers: 0 새싹, 1 어린나무, 2 성목, 3 거목, 4 수호목.
Every tree rolls for giant growth at 2% per day after 14 full days as a mature tree.
Every giant rolls for guardian growth at 0.5% per day after 28 full days as a giant.
Rolls depend on world seed, world day, tree ID and transition type. The last processed
world day is saved, so reloads do not repeat or reroll growth. Natural forest trees
also retain their identities and age; daily forage continues to refresh.

| Stage | Axe Lv1 hits | Axe Lv2 hits |
|---|---:|---:|
| Seedling | 1 | 1 |
| Young | 2 | 1 |
| Mature | 3 | 2 |
| Giant | 5 | 3 |
| Guardian | 7 | 4 |
| Stump | 3 | 3 |

Young trees return their planting item. Mature-or-older tree drops are one of each
listed item, subject to the listed probability. Clearing a stump adds one wood
(or bamboo). Editor-enabled regrowth starts again as a seedling after seven days
with the stump retained. Fully removing a farm stump leaves cleared land.
Natural forest resource slots refill the following day after full removal.

## Authority, land protection and saves

`plantTree` is an input-only command. The server checks the current front tile,
stationary/running state, natural grass, item ownership and stamina, then creates
a stage-zero entity and consumes one item atomically through existing action
receipts and persistence. Species, stage, HP and drops cannot be supplied by clients.

Planting excludes paths, water, soil/crops (including watered soil), structures,
warps and adjacent access, collision, installations, no-placement zones, spawn
protection (three-tile radius) and trees/stumps within three tiles.

World save version 4 adds optional tree metadata and nature clear timestamps.
Legacy unannotated trees become mature; species is inferred from the old asset,
with oak as fallback and the existing starter pine preserved. Existing layouts,
family members, inventories, crops, receipts and Postgres identities are retained.
There is no SQL schema migration, reset or replacement database in this change.

## Farmable ground semantics

The farmable zone is now treated strictly as **permission to use the hoe**, not as a
separate empty-ground biome. Untouched farmable grass behaves like any other natural
grass: it can hold planted trees, first-day natural trees, debris and wild growth.
Only the actual cultivated state (soil/crop/withered entities), protected paths,
structures, warps, spawn buffers, collisions and no-placement zones block natural
placement.

A brand-new farm also seeds 14 sparse natural trees across valid open grass using
all eight species and seedling/young/mature stages. Because natural placement ignores
the farmable bit, some of these can appear in future field space; clearing them is
part of opening the farm. Existing family saves are not retroactively filled with
these first-day trees.

## Denser farm wilderness and animal-feed grass

Farmable is still only permission to hoe. Untilled farmable grass now receives the
same natural-content treatment as every other open grass tile. The default density
is intentionally much higher so the 128×88 farm no longer looks empty:

- up to **48** sparse natural trees on the initial/upgrade pass;
- **320** branches/stones/weeds/wildflowers initially, with branches and stones
  weighted to about 72% of those obstacles; after the first cleanup only about 2–5
  grow back per day, capped at **380**;
- **420** grass/clover patches initially; after the first cleanup only about 3–7
  grow back per day, capped at **500**.


The intentionally heavy first-day population is the point: the player should need to
clear a working area before deciding where the first field, paths and animal space go.
The gentle daily regrowth avoids turning that opening chore into a permanent full-farm
maintenance tax.

Existing v5 family saves get this denser additive pass once on upgrade, but only on
still-natural grass. Tilled soil, crops, paths, buildings, warps, spawn protection,
collisions, placed objects and protected fenced interiors are not overwritten.

Short grass, tall grass and clover are now real forage. Gathering them yields
`grass` (목초). The crafting table recipe converts **3 목초 → 1 동물 먹이**.
Purchased animal feed remains valid, so players can either buy feed or clear/harvest
the farm to support their animals. The three grass variants are also available in
the World Editor Nature palette.

## Debris and flowers

Natural debris has 22 separate sprites: six branches, six stones, six weeds/grass
and four wildflowers. New farms request 30; each new day requests 2–6 additional
objects, capped at 50 generated farm debris. Protection can reduce the actual
number on small or fully developed editor maps. Authored objects are not counted
against the generated-debris cap.

Exclusions include every planting exclusion, tree bases, duplicate occupied tiles,
well access and building buffers. Player decorations and enclosed fence interiors
are protected. A cleared/tilled tile gets seven days of debris respite.

Flower bodies include seven crop flowers (pinktulip, dewflower, sunwheel, lavender,
chrysanthemum, winterstar, frostflower), four wildflowers (white/yellow/pink/purple),
and five editor garden flowers (daisy/poppy/bluebell/hydrangea/lavender).
These are 16 content entries, excluding older incidental flower-bed scenery.

The existing 12 expanded crops retain their gameplay definitions and seasonal
shop selection. Each now resolves to its own new mature sprite: pinktulip,
sweetpea, springonion, coolcucumber, watermelon, lavender, rubybeet,
chrysanthemum, scarletbean, icelettuce, snowpea and frostflower. Existing early
crop phases share the established crop-family sprites. Regrow crops, quick roots,
flowers and high-value watermelon remain differentiated rather than adding more IDs.
Seven common tree seeds/saplings are sold year-round. Metasequoia seed is a rare
natural drop. New members start with two pine cones and two acorns; existing
inventories are not rewritten.

## Art, runtime and Editor

103 original alpha WebP sprites (about 3.16 MB): 64 tree sprites, 22 debris,
five garden flowers and 12 mature crops. `NATURE-PROMPTS.json` records the built-in
image-generation prompts and source hashes; `public/assets/nature/manifest.json`
records shipped paths, dimensions and hashes. No external asset pack was used.

All 8 × 5 basic growth silhouettes are separately drawn. Each species also has
summer, autumn and winter mature art. Evergreen pine/bamboo retain their green
growth art year-round. Deciduous seedlings/young trees share their growth art
across seasons. Deciduous giants/guardians outside spring reuse an enlarged
seasonal mature crown, composited with their distinct giant/guardian root section.
Thus these seasonal old-growth variants are composites, not 8 × 5 × 4 unique assets.
Both the runtime and editor use the same species/stage/season selection and sizes.

Editor categories are Trees, Nature and Flowers, with fitted image thumbnails.
Tree properties include eight species, five stages, chop, stump, seven-day regrow,
species-default/custom primary drop and planted/natural origin.

To repack generated atlases, install Pillow and numpy, supply a JSON array of
`{id, path, prompt}` source records, and run:

```sh
python multiplayer-farm/build/pack-nature.py source-manifest.json
```

Generated sources must follow the documented grids; inspect gutters before reuse.
The packer preserves alpha and does not recolor the art. Existing valid outputs
are retained; remove only the intended output files before replacing an atlas.

## CI correction and verification

The failure trace from run `38039642779` showed that the old single production
browser scenario completed its gameplay assertions, then exhausted its 60-second
budget during the final screenshot/session cleanup. It is now two independent
production scenarios with the same timeout and retained movement, multiplayer,
crop/water, tree/drop, inventory and reconnect assertions. The farming test checks
the actual authoritative front tile and moves to clear land when daily debris
occupies it. No test was deleted or disabled and no timeout was increased.

Run `38052071972` subsequently exposed a separate startup-order race: DOM reload
completed before Phaser preload and the saved-session join. The UI assertion
started before that join and exhausted its default five-second assertion window;
the server was healthy and the connection completed immediately afterward.
Reload/history checks now observe the actual successful matchmaking HTTP response
before checking login dismissal and the connected UI. The extra initial reload
introduced by splitting the tree scenario was removed; crop reload and post-drop
history restoration remain asserted. All timeout values are unchanged.

Railway's original watch paths excluded tests and CI configuration. Consequently
the recovery commit was immediately skipped even though it was fixing the gate
that had blocked the nature release. Both existing production services now also
watch farm tests, Playwright configs, the farm workflow and the audited watch-path
manifest in `deployment/auto-deploy-watch.json`. Existing source paths are retained
and Wait for CI stays enabled. This is a scoped watch-path update, with no service,
database, environment variable, domain or replica changes.

Nature unit tests cover all species, progression, deterministic rare promotions,
minimum stage ages, drops/hits/stumps, terrain exclusions, debris counts, legacy
saves and Editor roundtrips. Integration tests use three real SDK/WebSocket clients
for contested planting, single-item consumption, forged state rejection and reconnect.
Browser tests decode all shipped nature images, plant via touch, reload the tree,
and edit/persist the eight-species/five-stage properties and thumbnails.

Local type/unit/integration/deployment/build/browser gates are run before push.
Local integration and production-browser checks use an isolated MemoryTestStore;
the unchanged GitHub workflow runs the real Postgres, DB, production-browser,
Docker restart/shutdown and golden-lab gates. Public family data is not test data.
