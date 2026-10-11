# Sunlit seeds and tool attempts

The release keeps the existing Colyseus room, PostgreSQL snapshot/receipt store,
crop IDs, growth days, harvest rules, mature crop paintings and Railway services.
No data migration is required.

## Crop presentation

`shared/crop-visuals.ts` assigns all 33 crops a botanical seed and plant form.
`client/crop-art.ts` bakes original pixel textures at startup: small earth mounds
with grain, fine seeds, round seeds, flat seeds, beans, bulbs or planting tubers.
The seed texture has no foliage. Sprouts have cotyledons; growing plants use
root-crop tops, cabbage rosettes, corn blades, climbing/ground vines, bushes,
flower buds or narrow bulb/lavender leaves. Mature artwork is preserved.

`shared/sunlight.ts` is the presentation entry point. The default profile has
sunrise at 06:00, a 90-minute dawn, dusk beginning at 17:00 and sunset at 19:00.
Smooth transitions produce a normalized light level. Seed glow is a separate
halo/highlight texture with a small local shimmer, multiplied by that level.
At night its opacity is exactly zero; the seed and dry/wet soil remain visible.
Only stage-zero crops receive glow. Advancing growth or unloading an area
removes the overlay.

Future code can provide `profile` (sunrise, sunset, dawn/dusk lengths, peak),
`sunlightIntensity`, `seasonalSunModifier` and local `exposure`. Seasonal profile
overrides currently remain neutral. This release does not change crop growth
rates or implement seasonal sun travel. There are no additional network ticks
or persisted light fields; all clients derive light from the server day/minute.

## Input and authority

With water selected, the action button/keyboard always sends `useTool(water)`
for the authoritative front tile. Mouse/touch taps approach the selected ground
cell and pour there, even over objects, wells, shop or fishing targets. Wells
are explicitly refilled by interacting with them using **hand**. Pouring does
not silently switch into refilling, harvesting or opening a panel.

`applyAction` checks ownership, stamina and command bounds, then resolves the
physical attempt separately from its effect. An invalid in-world `useTool`
target returns a committed failed effect, with animation and one stamina cost.
Missing/deleted targets also produce empty swings. A successful dry-soil/crop
watering spends one water unit; wet, invalid or empty-can attempts do not
change tiles, water inventory or quest counts. They still animate and cost
stamina. An empty can cannot water a tile. Insufficient stamina cannot start
another physical action. Out-of-range/forged commands are rejected.

The existing room commits stamina, world changes and the action receipt in one
storage operation, then broadcasts the result/animation. Replaying an action ID
returns the receipt without another cost or broadcast. Legacy valid physical
tool commands use the same cost boundary; rejected legacy commands which never
execute an animation remain rejected. The client never subtracts tool stamina.

| Action | Stamina |
| --- | ---: |
| Axe, including empty/wrong-target swings | 3 |
| Pickaxe, including empty/wrong-target swings | 3 |
| Hoe | 2 |
| Scythe, watering | 1 |
| Axe on a twig, pickaxe on surface stone, axe/pickaxe removing a wild flower | 1 |
| Hand gathering/harvesting | 1 |
| Automatic/hand pickup, explicit well refill | 0 |
| Accepted fishing cast | 3 |

Fishing retains its existing cast/bite/minigame rules: no extra charge on hook,
catch/failure or cancellation. A rejected cast does not start a fishing action.

## Focused verification

- `tests/sunlight-tools.unit.test.ts`: light boundaries and extension inputs,
  all tool misses, successful single costs, wet soil, empty can, well priority,
  forged/range/ownership rejection, planting/growth/harvest/save compatibility.
- `tests/interaction.integration.test.ts`: real Colyseus clients, peer stamina
  sync, replayed failure receipts, exactly one effect, reconnect persistence.
- `tests/browser/sunlight-tools.spec.ts`: PC keyboard/mouse and phone touch,
  invalid pouring water streams, well priority, valid/repeat watering, live
  scene day/dusk/night opacity and a dry/wet botanical growth contact sheet.
