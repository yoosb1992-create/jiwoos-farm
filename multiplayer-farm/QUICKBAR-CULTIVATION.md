# Cultivation and personal quickbar

The farm evaluates cultivable natural terrain at runtime, including saved maps.
Building/no-placement zones remain furniture permissions. Physical collision,
natural entities, installations, paths, spawns and entrances remain protected.
Removing a live natural entity releases its tile. No saved layout is repainted.

`client/tilled-ground.ts` caches cardinal soil adjacency on world revisions.
Only changed occupancy and its four neighbors get new masks. Soil, all crop
stages and withered plants join the same 32px ground; wet tint and seed light
remain separate. No new server crop fields or database migrations are needed.

`Member.quickbar` lives in the existing PostgreSQL JSON snapshot, and travels
only in each authenticated player's personal state. `updateQuickbar` applies
validated deltas through the existing durable transaction/receipt path. It
cannot change inventories, another member's settings, or the grid dimensions.
Missing legacy settings receive defaults; intentional empty registrations stay
empty. Unowned registrations remain stored but render empty and cannot be used.

| Visual row | Slots |
|---|---|
| Upper | 4, 5, 6, 7 |
| Bottom | 1, 2, 3, ★ |

IDs, bottom-origin coordinates and item registration are independent.
`expandQuickbar` is a future server reward hook, not an enabled player command.
It only adds IDs: new rows extend upward, new columns retain existing coordinates,
and the favorite cell stays at the bottom right.

The bag manages slot assignment/removal and separate ordered favorites.
Empty slots open an owned-item picker. The preview selector always offers hand.
Favorites have an expanded grid or vertical scrolling list; display preference
is device-local in Settings and the control layout editor. The popup avoids the
actual control rectangles and falls back to the management dialog when a heavily
customized tiny viewport has no usable space.

`tool-icon-art.ts` paints four original 32px UI-only silhouettes. The shared
item-icon resolver applies them to the tray, favorites, bag, upgrades and preview.
Neither held tool art nor character animation art was changed.

## Focused validation

- `quickbar.unit.test.ts`: stable IDs, row/column extension, ownership, no item
  grants, favorites, JSON compatibility, member isolation and bag categories.
- `cultivation.unit.test.ts`: terrain eligibility, occupancy/removal, protected
  entrances, local cardinal adjacency and crop/withered connections.
- `quickbar.integration.test.ts`: real SDK/WebSocket changes, family isolation,
  durable room disposal/reload and same-player reconnect. Uses PostgreSQL in CI.
- `browser/quickbar.spec.ts`: exact positions at 320/390px, landscape and tablet
  sizes; bag/empty-slot registration, favorites, display settings, reload,
  transparent icons and live scene connected wet/crop underlays.

## Android checks

1. On an existing farm, clear nature and till nearby grass; check blocked doors,
   rocks and buildings, connected dry/wet plots, planted and mature crops.
2. Register from the bag, clear a slot, touch the empty slot and register again.
3. Use the last seed or store a tool: its registration must look empty; reacquiring
   it restores the icon. The hand selector must remain available.
4. Add, replace, reorder and remove favorites; try expanded and vertical modes,
   rotate/fold the device and confirm action/RUN/carry controls remain usable.
5. Reconnect using the same saved player session on another device; verify the
   registrations. A different family member must retain their own settings.
