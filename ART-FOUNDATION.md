# 지우네 농장 · Art Foundation

This pass keeps the v2.7 farm layout, multiplayer authority, saves and collision
geometry. It replaces the most visible art with warm painted sprites and gives
the game and World Editor one shared asset contract.

## Direction

Warm upper-left sunlight; cream limestone, honey oak, terracotta roofs, moss and
lime foliage, turquoise water. Large house/tree silhouettes frame small actors.
Fine detail lives inside readable shapes; paths remain distinct from grass.
The supplied reference informed mood and material choices, not map composition.
No pond, planted field, new region, permanent building or animal was added to the
default farm. The 128 × 88 map remains editable and open for player cultivation.

## Shipped assets

All new files are in `public/assets/art-foundation/`. `manifest.json` lists exact
dimensions, sizes and SHA-256 checksums. `multiplayer-farm/ART-PROMPTS.json` records every production
prompt and the built-in image-generation tool used. Generated alpha is preserved;
there is no chroma-key removal or external copyrighted asset pack.

| Folder | Content |
| --- | --- |
| `terrain/` | grass, packed dirt, irregular limestone paving, gravel, worked soil, water |
| `sprites/` | house, stone well, broadleaf oak, pine, flowering bush, clover grass, small rocks, reeds, water lily, mushroom, wooden bridge, chest, workbench, notice board, cow, sheep, hen |
| `crops/` | four growth strips packed as separate stages (carrot, cabbage, tomato, berry); sixteen further mature crop silhouettes |

All 21 existing crops use image art for seed, sprout, growing and mature stages.
Early stages share four botanical families; `sproutberry` and `heartberry` share
berry art. Their gameplay definitions, growth durations and rewards are unchanged.
The older painted bench, lamp, mailbox, fence, flower bed, green shrub and large
rock remain in the catalog; they benefit from the shared sampling/scale fixes.

## Asset contract

`shared/art-assets.ts` is the single binding between stable asset IDs and art.

- `source.path`: packed image on disk (usually 2× logical resolution).
- `frameSize`: logical world pixels, independent of downloaded image resolution.
- `displayScale`: default presentation multiplier; saved object width/height wins.
- `origin`: normalized anchor, retained for every replaced legacy asset.
- Saved collision rectangles, interaction points and depth values remain authority.
- New tree canopies have no extra collision; existing trunk rectangles still apply.
- Crop frames are 80 × 104 image pixels / 40 × 52 world pixels, baseline at 80%.
- An explicit sprite-sheet `frameWidth/frameHeight` denotes source pixels. Single
  images always draw their entire source; the editor never crops a 2× sprite to
  its logical frame size.

Runtime uses image textures first. Existing procedural crops/animals/water props
remain a missing-image fallback; replaced legacy objects can load their old PNG
when the new image fails. Missing ground art uses the semantic color painter.
No editor code is imported by the game entry.

## Ground and performance

The six image materials are sampled in continuous world coordinates. Seed chooses
stable offsets. Mirrored repeating samples avoid seams across texture/chunk edges.
Grass has no independent per-tile brightness rectangles. Dark grass, seasons,
shallows and deep water use restrained color glazes. Connected path/water edges
retain neighbor masks, gain rounded outside corners and a fine seeded bank fringe.
Worked soil composes the same image material with readable furrows once at launch.
Older saved maps also receive the ground materials without converting their data.

World2 still renders only visible 512px chunks with the existing viewport margin.
Editor uses its bounded chunk LRU and low-zoom overview. Images are decoded once;
there are no per-frame full-world scans or per-object DOM nodes. The editor's
seasonal sprite cache is capped at 32 entries. Animated pixel characters retain
nearest filtering; painted scenery uses linear filtering.

## Editor and release checks

Palette thumbnails retain aspect ratio and use the same origin and logical size
as the world canvas. Terrain brushes show their actual material. Game and editor
share foliage season colors. Test Play, collision overlays, authoring and export
continue to use the existing world data.

Existing default-farm browser smoke now decodes every new asset, catching both
missing files and invalid image bodies even when a renderer fallback conceals the
failure. Existing unit/integration/browser/production CI gates are retained.
No test-only world decoration or planted field ships to production.

`multiplayer-farm/build/pack-art.py` is an optional Pillow authoring helper: it trims transparent
padding, splits growth strips at transparent gutters, preserves alpha, scales and
atomically writes WebP. It is not needed by CI, the server, the editor or players.

## Further art work

Character/NPC directional animation, UI emoji icons, bespoke seasonal tree sheets
and animal walk cycles retain their current implementation. Seasonal vegetation
currently uses shared color treatment, not separately painted snow canopies.
Early crop-stage family sharing can later be replaced per species without changing
the gameplay model. Android hardware performance and subjective art preference
still benefit from the user's device review.
