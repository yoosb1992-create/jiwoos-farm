# v2.8.5.2 — shipping crate and shared quantities

Starting revision: `c40722e00ca0ec48a4c3e82df7aa9a9c9c9b62e2`.

- Default crate: tile `(67, 31.5)`, right of the farmhouse `(60, 29)`, above the family chest `(65.5, 34.5)`. Its 56×28 collision footprint and reachable southern approach are checked against map geometry. A separate 80×72 open harvest crate drawing is shared by game and editor.
- World JSON version 12 adds a missing crate when a family room loads. New families also normalize old official/local/published starting layouts. Occupied preferred positions use a collision-checked alternative near the house. No existing objects or progress are removed. If no position is available, the owner is directed to the current-farm editor. Existing crates are reused.
- Pending shipments and up to 30 recent morning reports belong to each member, independent of crate IDs/locations. Shipping reserves inventory without paying money; only the depositor can partially withdraw before the day changes. Morning settlement, money, inventory, snapshot and action receipt commit together through the existing PostgreSQL transaction/revision fence. Retrying the same successful action ID returns its durable receipt. Offline members are settled too.
- The current-farm editor permits safe movement of the existing crate and preserves its ledger. Duplicate crates and blocked/unreachable placement are rejected. Existing backup/restore snapshots include the ledgers and reports. Operator publication authentication is unchanged; deployment does not rewrite an operator's official-world publication.
- `QuantityDialog` is reused for shipping/return, shop purchase/immediate sale, chest transfers and recipe crafting. `shared/transactions.ts` centralizes prices, capacity quotes and positive-integer validation. Recipe ingredients/results come from the existing recipe definitions. Tool upgrades retain their single-action UI.
- Direct numeric input, ±1/±10, 1/5/10/half/max, live totals and explicit confirmation. A transaction is limited to 999; the limit is stated and larger inventories require separate transactions. Existing chest protocol half/all requests remain compatible. Quantity input stays mounted while authoritative personal state changes.
- FAST/TARGETED/FULL workflow and PostgreSQL/Railway topology are unchanged. No new project/database, reset, SQL schema migration or official publication bypass.

## Focused validation

- 23 focused unit/integration checks: new and existing layout placement, occupied fallback, no-space fallback, duplicate prevention, owner-only returns, day settlement, JSON reload, safe editor movement, quantities/capacity, existing household and default-map invariants, and real Colyseus clients sharing durable action receipts.
- Mobile browser flows: common shop purchase and affordability; both chest directions with direct input, recipe count and existing upgrades; crate touch while holding an axe, invalid inputs/cancel, 37-item shipment, 7-item return, reconnect, 30-item morning settlement. Numeric keypad attribute, scroll width and dialog layout checked. Local browser uses a software Chromium renderer; actual Android keyboard display is device-controlled.
- Typecheck, server compilation and production client build using the existing Backend endpoint.
- GitHub CI runs the selected checks, including real PostgreSQL integration, after push. Deployment success must be checked against the pushed SHA for both existing Frontend and Backend.

## Operational behavior

Existing inactive family farms receive the additive migration on their next connection, not via a destructive bulk rewrite. No claim is made that every private production farm has been opened during validation. Official editor defaults stored by an operator remain their publication; crate compatibility is applied when the game creates/loads a farm. If the operator wants the stored publication itself changed, use the existing authenticated publish flow.
