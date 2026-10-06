import express, { type Application } from "express";
import type { Store } from "../persistence/store.js";
import { defaultLayout, validateLayout } from "../shared/layout.js";
import { safeSpawn } from "../shared/regions.js";
/** Editing capability protects only this blueprint. It grants no authority over a live farm. */
export function blueprintRoutes(app: Application, store: Store): void {
  const attempts = new Map<string, { count: number; until: number }>();
  app.use(
    "/api/blueprints",
    express.json({ limit: "1mb" }),
    (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      const key = req.socket.remoteAddress ?? "unknown",
        now = Date.now();
      let n = attempts.get(key);
      if (!n || n.until < now) {
        n = { count: 0, until: now + 60000 };
        attempts.set(key, n);
      }
      if (attempts.size > 2000)
        for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
      if (++n.count > 60) {
        res.status(429).json({ error: "잠시 후 저장하세요" });
        return;
      }
      next();
    },
  );
  app.get("/api/blueprints/defaults", (_req, res) => res.json(defaultLayout()));
  app.get("/api/blueprints/:id", async (req, res) => {
    try {
      res.json(
        await store.getBlueprint(
          req.params.id,
          req.headers.authorization?.replace(/^Bearer /, "") ?? "",
        ),
      );
    } catch (e) {
      res
        .status(403)
        .json({ error: e instanceof Error ? e.message : "권한 없음" });
    }
  });
  app.post("/api/blueprints", async (req, res) => {
    try {
      const layout = validateLayout(req.body);
      for (const m of Object.values(layout.maps))
        for (const s of m.spawns) safeSpawn(m.id, s.id, layout.maps);
      res.json(await store.createBlueprint(layout));
    } catch (e) {
      res
        .status(400)
        .json({ error: e instanceof Error ? e.message : "설계도 오류" });
    }
  });
  app.post("/api/blueprints/:id", async (req, res) => {
    try {
      const b = req.body as Record<string, unknown>;
      if (!Number.isSafeInteger(b.revision)) throw Error("버전 오류");
      const layout = validateLayout(b.layout);
      for (const m of Object.values(layout.maps))
        for (const s of m.spawns) safeSpawn(m.id, s.id, layout.maps);
      res.json(
        await store.saveBlueprint(
          req.params.id,
          req.headers.authorization?.replace(/^Bearer /, "") ?? "",
          layout,
          b.revision as number,
          b.publish === true,
        ),
      );
    } catch (e) {
      res
        .status(400)
        .json({ error: e instanceof Error ? e.message : "저장 오류" });
    }
  });
}
