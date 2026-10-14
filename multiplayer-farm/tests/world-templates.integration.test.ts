import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { makeStore, join, until } from "./helpers.js";
import { createFarmServer } from "../server/createFarmServer.js";
import { defaultLayout } from "../shared/layout.js";
import { newWorld2, setCell, terrainCode } from "../shared/world2.js";
import {
  prepareLayout,
  type OfficialWorld,
} from "../shared/world-templates.js";
import { newMember, entity } from "../shared/world.js";
import { isFarmable } from "../shared/applyMovement.js";
import { NPCS } from "../shared/content.js";
import { matchMaker } from "@colyseus/core";
import type { FarmRoom } from "../server/FarmRoom.js";

test("official authority, local/server starts, town buildings, regions and NPC routes share one multiplayer layout", async () => {
  const store = makeStore(),
    server = createFarmServer({ store, port: 0, host: "127.0.0.1" }),
    { url } = await server.listen();
  const http = url.replace(/^ws/, "http");
  const post = (path: string, data: unknown, token = "") =>
    fetch(http + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(data),
    });
  try {
    const official = (await (
      await fetch(http + "/api/world-templates/official")
    ).json()) as OfficialWorld;
    const owner = await store.login(
        true,
        "",
        "owner-" + randomUUID().slice(0, 5),
      ),
      original = await store.farmSnapshot(owner.token);
    assert.deepEqual(original.world.layout, official.layout);
    assert.deepEqual(
      await (await fetch(http + "/api/blueprints/defaults")).json(),
      official.layout,
    );
    assert.equal(
      (
        await post(
          "/api/world-templates/official",
          {
            layout: official.layout,
            revision: official.revision,
            confirm: true,
          },
          owner.token,
        )
      ).status,
      403,
    );
    const layout = structuredClone(official.layout),
      town = layout.maps.town!;
    town.width += 8;
    setCell(town, "terrain", 10, 10, terrainCode("sand"));
    const building = town.objects.find(
      (o) => o.layer === "Buildings" && !o.kind,
    )!;
    assert.ok(building);
    building.position.tileX += 2;
    layout.npcBindings = {
      [NPCS[0]!.id]: {
        homeMapId: "town",
        homeObjectId: building.id,
        role: "farmer",
      },
    };
    const region = "region-template-test";
    layout.maps[region] = {
      id: region,
      name: "연결 테스트",
      width: 24,
      height: 20,
      baseTileType: "grass",
      objects: [],
      terrainRegions: [],
      collisionRegions: [],
      farmAreas: [],
      world2: newWorld2(),
      spawns: [{ id: "entry", tileX: 6.5, tileY: 6.5, facing: "down" }],
      warps: [
        {
          id: "return-town",
          area: { startX: 1, endX: 2, startY: 7, endY: 8 },
          targetMapId: "town",
          targetSpawnId: town.spawns[0]!.id,
        },
      ],
    };
    town.warps.push({
      id: "new-region",
      area: {
        startX: town.width - 4,
        endX: town.width - 3,
        startY: 7,
        endY: 8,
      },
      targetMapId: region,
      targetSpawnId: "entry",
    });
    town.world2!.npcRoutes = [
      {
        id: NPCS[0]!.id,
        points: [
          {
            minute: 480,
            x: 12.5,
            y: 12.5,
            facing: "down",
            animation: "산책",
            dialogue: "안녕",
          },
        ],
      },
    ];
    const invalid = structuredClone(layout);
    invalid.maps[region]!.warps[0]!.targetSpawnId = "missing";
    assert.equal(
      (
        await post("/api/session", {
          create: true,
          nickname: "invalid",
          startWorld: {
            type: "local",
            id: "test",
            revision: 1,
            layout: invalid,
          },
        })
      ).status,
      400,
    );
    const r = await post("/api/session", {
      create: true,
      nickname: "local-" + randomUUID().slice(0, 5),
      startWorld: { type: "local", id: "device-a", revision: 3, layout },
    });
    assert.equal(r.status, 200);
    const session = await r.json(),
      peer = await store.login(
        false,
        session.farmId,
        "other device",
        undefined,
        undefined,
        undefined,
        { type: "local", id: "ignored", revision: 1, layout: defaultLayout() },
      );
    const A = await join(url, session),
      B = await join(url, peer);
    try {
      assert.deepEqual(JSON.parse(A.state.layout), prepareLayout(layout));
      assert.equal(A.state.layout, B.state.layout);
    } finally {
      await A.leave();
      await B.leave();
    }
    const created = await store.createBlueprint(
      prepareLayout(layout),
      owner.token,
      "강변 설계도",
    );
    assert.ok(
      (await store.listBlueprints(owner.token)).some(
        (b) => b.id === created.id,
      ),
    );
    assert.equal(
      (
        await post("/api/session", {
          create: true,
          nickname: "denied",
          startWorld: {
            type: "server",
            id: created.id,
            revision: 0,
            editToken: "forged",
          },
        })
      ).status,
      400,
    );
    const remote = await store.login(
      true,
      "",
      "server-" + randomUUID().slice(0, 5),
      undefined,
      undefined,
      undefined,
      {
        type: "server",
        id: created.id,
        revision: created.revision,
        editToken: created.editToken,
      },
    );
    assert.deepEqual(
      (await store.farmSnapshot(remote.token)).world.layout,
      prepareLayout(layout),
    );
    const key = randomUUID() + randomUUID(),
      old = process.env.FARM_OPERATOR_TOKEN_HASH;
    process.env.FARM_OPERATOR_TOKEN_HASH = createHash("sha256")
      .update(key)
      .digest("hex");
    try {
      assert.equal(
        (
          await post(
            "/api/world-templates/official",
            { layout, revision: official.revision, confirm: true },
            key,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await post(
            "/api/world-templates/official",
            { layout, revision: official.revision, confirm: true },
            key,
          )
        ).status,
        409,
      );
      const latest = await store.officialWorld(),
        next = await store.login(
          true,
          "",
          "official-" + randomUUID().slice(0, 5),
        );
      assert.deepEqual(
        (await store.farmSnapshot(next.token)).world.layout,
        latest.layout,
      );
      assert.deepEqual(
        (await store.farmSnapshot(owner.token)).world.layout,
        original.world.layout,
      );
      await store.publishOfficial(official.layout, latest.revision);
    } finally {
      if (old === undefined) delete process.env.FARM_OPERATOR_TOKEN_HASH;
      else process.env.FARM_OPERATOR_TOKEN_HASH = old;
    }
  } finally {
    await server.close();
  }
});

test("offline backup/apply/restore preserve progress; conflicts, stale revisions, guests and active rooms cannot write", async () => {
  const store = makeStore(),
    server = createFarmServer({ store, port: 0, host: "127.0.0.1" }),
    { url } = await server.listen();
  try {
    const s = await store.login(true, "", "safe-" + randomUUID().slice(0, 5)),
      guest = await store.login(false, s.farmId, "guest");
    const lease = await store.lease(s.farmId, () => {}),
      world = await lease.load();
    world.day = 25;
    world.minute = 810;
    const m = (world.members[s.playerId] = newMember(s.playerId, s.nickname));
    m.money = 777;
    m.inventory.wood = 23;
    m.toolLevels!.axe = 3;
    m.position = { area: "farm", x: 60.5 * 32, y: 37.5 * 32, facing: "down" };
    let cropX = 20,
      cropY = 20;
    while (!isFarmable("farm", cropX, cropY, world.layout!.maps)) {
      if (++cropX >= 100) {
        cropX = 20;
        cropY++;
      }
    }
    const crop = entity(
      "protected-crop",
      "farm",
      "crop",
      (cropX + 0.5) * 32,
      (cropY + 0.5) * 32,
      "",
    );
    crop.crop = "sproutberry";
    crop.watered = true;
    crop.stage = 2;
    world.entities[crop.id] = crop;
    world.chestStores = { kept: { wood: 25 } };
    world.treeRegrowth = {
      future: entity("future", "farm", "tree", 39.5 * 32, 41.5 * 32, "tree"),
    };
    world.revision++;
    await lease.save(world, world.revision - 1);
    await lease.close();
    const before = await store.farmSnapshot(s.token);
    await assert.rejects(() => store.farmSnapshot(guest.token));
    const edited = structuredClone(before.world.layout!);
    edited.maps.town!.name = "편집한 마을";
    await assert.rejects(() =>
      store.previewFarmLayout(guest.token, before.world.revision, edited),
    );
    const active = await join(url, s);
    await assert.rejects(
      () => store.previewFarmLayout(s.token, before.world.revision, edited),
      /열려/,
    );
    const roomId = active.roomId;
    await (matchMaker.getLocalRoomById(roomId) as FarmRoom).disconnect();
    await until(() => !matchMaker.getLocalRoomById(roomId));
    const current = await store.farmSnapshot(s.token),
      revision = current.world.revision;
    const bad = structuredClone(current.world.layout!);
    setCell(bad.maps.farm!, "water", cropX, cropY, terrainCode("water"));
    const conflict = await store.previewFarmLayout(s.token, revision, bad);
    assert.ok(conflict.conflicts.some((c) => c.id === crop.id));
    assert.equal(conflict.previewId, undefined);
    assert.deepEqual((await store.farmSnapshot(s.token)).world, current.world);
    const preview = await store.previewFarmLayout(s.token, revision, edited);
    assert.equal(preview.conflicts.length, 0);
    assert.ok(preview.backupId);
    assert.ok(preview.previewId);
    const unchanged = await store.farmSnapshot(s.token);
    assert.deepEqual(unchanged.world, current.world);
    assert.ok(unchanged.backups.some((b) => b.id === preview.backupId));
    await assert.rejects(() =>
      store.applyFarmLayout(guest.token, preview.previewId!),
    );
    const locked = await store.lease(s.farmId, () => {});
    await assert.rejects(
      () => store.applyFarmLayout(s.token, preview.previewId!),
      /열려/,
    );
    await locked.close();
    const applied = await store.applyFarmLayout(s.token, preview.previewId!);
    assert.deepEqual(
      await store.applyFarmLayout(s.token, preview.previewId!),
      applied,
    );
    const after = await store.farmSnapshot(s.token);
    assert.equal(after.world.layout!.maps.town!.name, "편집한 마을");
    assert.deepEqual(
      { ...after.world, layout: undefined, revision: 0, layoutRevision: 0 },
      { ...current.world, layout: undefined, revision: 0, layoutRevision: 0 },
    );
    const second = await join(url, s);
    assert.equal(JSON.parse(second.state.layout).maps.town.name, "편집한 마을");
    const secondId = second.roomId;
    await (matchMaker.getLocalRoomById(secondId) as FarmRoom).disconnect();
    await until(() => !matchMaker.getLocalRoomById(secondId));
    await assert.rejects(
      () => store.previewFarmLayout(s.token, revision, edited),
      /버전/,
    );
    const latest = await store.farmSnapshot(s.token),
      restore = await store.previewFarmLayout(
        s.token,
        latest.world.revision,
        undefined,
        preview.backupId,
      );
    assert.ok(restore.restore);
    assert.ok(restore.backupId);
    await store.applyFarmLayout(s.token, restore.previewId!);
    const restored = await store.farmSnapshot(s.token);
    assert.deepEqual(
      { ...restored.world, revision: 0, layoutRevision: 0 },
      { ...current.world, revision: 0, layoutRevision: 0 },
    );
    const other = await store.login(
      true,
      "",
      "other-" + randomUUID().slice(0, 5),
    );
    await assert.rejects(() =>
      store.previewFarmLayout(other.token, 0, undefined, preview.backupId),
    );
  } finally {
    await server.close();
  }
});
