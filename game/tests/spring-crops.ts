import { strict as assert } from "node:assert";
import { FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { CROP_DEFINITIONS, isMatureCrop } from "../data/crops";
import { GENERAL_STORE_LISTINGS } from "../data/shop";
import { Inventory, normalizeSaveData, advanceFarmDay, sellAllCrops } from "../domain";
import { familyTestDB } from "./family-db";
import type { FamilyPose } from "../family/types";
import { waterFarmForRain, weatherFor } from "../weather/system";
for (const crop of [CROP_DEFINITIONS.sunpotato, CROP_DEFINITIONS.heartberry, CROP_DEFINITIONS.morningcarrot]) {
  const { db, close } = familyTestDB();
  try {
    const room = (await new FamilyRooms(db).create("A", "봄작물", "지우")).room;
    await new FamilyRooms(db).join("B", room.inviteCode, "수빈");
    const state = new FamilyState(db);
    const pose: FamilyPose = { mapId: "farm", x: 304, y: 224, facing: "down", selectedTool: "seed", moving: false };
    const act = async (raw: unknown) => state.act("A", room.id, (await state.read("A", room.id)).revision, raw);
    const listing = GENERAL_STORE_LISTINGS.find(l => l.itemId === crop.seedItemId)!;
    const bought = await act({ kind: "buy", listingId: listing.id, price: -999, quantity: 999, pose: { ...pose, mapId: "general_store", x: 288, y: 224 } });
    assert.equal(bought.world.money, 120 - listing.price); assert.equal(bought.inventory.items[crop.seedItemId], 1);
    const tool = { kind: "tool", tool: "hoe", x: 9, y: 8, pose: { ...pose, selectedTool: "hoe" } };
    await act(tool); await assert.rejects(act({ ...tool, tool: "seed", cropId: "nonexistent", pose: { ...pose, selectedTool: "seed" } }));
    const planted = await act({ ...tool, tool: "seed", cropId: crop.id, growthDays: 0, pose: { ...pose, selectedTool: "seed" } });
    assert.equal(planted.world.farm[0].cropType, crop.id);
    assert.equal((await state.read("B", room.id)).world.farm[0].cropType, crop.id);
    const saved = normalizeSaveData({ version: 4, day: 1, timeMinutes: 360, money: planted.world.money, selectedTool: "seed", player: pose, inventory: planted.inventory, farm: planted.world.farm, savedAt: Date.now() });
    assert.equal(saved?.farm[0].cropType, crop.id); assert.equal(saved?.inventory.items[crop.seedItemId], 0);
    const localTile = { ...planted.world.farm[0] };
    for (let day = 1; day <= crop.growthDays; day++) {
      if (!localTile.wateredToday) await act({ ...tool, tool: "water", pose: { ...pose, selectedTool: "water" } });
      const next = await act({ kind: "sleep", pose: { ...pose, mapId: "farmhouse", x: 304, y: 224 } });
      localTile.wateredToday = true; advanceFarmDay([localTile]);
      waterFarmForRain([localTile], weatherFor(room.id, next.world.daySerial!));
      assert.deepEqual(next.world.farm[0], localTile, "local/server growth must match");
      assert.equal(isMatureCrop(localTile.cropType!, localTile.cropStage!), day === crop.growthDays);
    }
    const harvest = await act({ ...tool, tool: "hand", pose: { ...pose, selectedTool: "hand" } });
    assert.equal(harvest.inventory.items[crop.harvestItemId], 1);
    assert.equal((await state.read("B", room.id)).inventory.items[crop.harvestItemId] ?? 0, 0);
    const inventory = new Inventory(harvest.inventory); assert.equal(sellAllCrops(inventory).earned, crop.sellPrice);
    const sold = await act({ kind: "sell", pose, price: 100000 });
    assert.equal(sold.world.money, 120 - listing.price + crop.sellPrice);
    assert.equal((await state.read("B", room.id)).world.money, sold.world.money);
  } finally { close(); }
}
console.log("Spring crops: all 3 purchase/plant/grow/harvest/sell, server prices and shared/local parity passed");
