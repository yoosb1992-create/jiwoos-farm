import express, { type Application } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Store } from "../persistence/store.js";
import { prepareLayout } from "../shared/world-templates.js";
/** Operator authority comes exclusively from backend configuration, never owner/UI flags. */
export function isWorldOperator(token: string): boolean {
  const hash = process.env.FARM_OPERATOR_TOKEN_HASH ?? "";
  return (
    /^[a-f0-9]{64}$/.test(hash) &&
    token.length >= 32 &&
    token.length <= 200 &&
    timingSafeEqual(
      Buffer.from(hash, "hex"),
      createHash("sha256").update(token).digest(),
    )
  );
}
export function worldTemplateRoutes(app: Application, store: Store) {
  const token = (headers: { authorization?: string }) =>
    headers.authorization?.replace(/^Bearer /, "") ?? "";
  const attempts = new Map<string, { count: number; until: number }>();
  app.use(
    ["/api/world-templates", "/api/farm-layout"],
    express.json({ limit: "16mb" }),
    (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      const key = req.socket.remoteAddress ?? "",
        now = Date.now();
      let n = attempts.get(key);
      if (!n || n.until < now) {
        n = { count: 0, until: now + 60000 };
        attempts.set(key, n);
      }
      if (attempts.size > 2000)
        for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
      if (++n.count > 60) {
        res.status(429).json({ error: "잠시 후 다시 시도하세요" });
        return;
      }
      next();
    },
  );
  app.get("/api/world-templates/official", async (_req, res) => {
    try {
      res.json(await store.officialWorld());
    } catch {
      res.status(503).json({ error: "공식 월드를 불러오지 못했어요" });
    }
  });
  app.get("/api/world-templates/published/:id", async (req, res) => {
    try {
      res.json({ layout: await store.publishedBlueprint(req.params.id) });
    } catch (e) {
      res
        .status(404)
        .json({ error: e instanceof Error ? e.message : "게시 설계도 없음" });
    }
  });
  app.post("/api/world-templates/official", async (req, res) => {
    if (!isWorldOperator(token(req.headers))) {
      res
        .status(403)
        .json({ error: "별도의 서버 운영자 게시 권한이 필요합니다" });
      return;
    }
    try {
      if (
        !Number.isSafeInteger(req.body?.revision) ||
        req.body?.confirm !== true
      )
        throw Error("게시 버전과 최종 확인을 확인하세요");
      res.json(
        await store.publishOfficial(
          prepareLayout(req.body.layout),
          req.body.revision,
        ),
      );
    } catch (e) {
      res
        .status(409)
        .json({ error: e instanceof Error ? e.message : "게시 실패" });
    }
  });
  app.get("/api/farm-layout", async (req, res) => {
    try {
      res.json(await store.farmSnapshot(token(req.headers)));
    } catch (e) {
      res
        .status(403)
        .json({ error: e instanceof Error ? e.message : "농장 불러오기 실패" });
    }
  });
  app.post("/api/farm-layout/preview", async (req, res) => {
    try {
      if (!Number.isSafeInteger(req.body?.revision))
        throw Error("농장 저장 버전을 확인하세요");
      const restoreId =
        typeof req.body.restoreId === "string" ? req.body.restoreId : undefined;
      res.json(
        await store.previewFarmLayout(
          token(req.headers),
          req.body.revision,
          restoreId ? undefined : prepareLayout(req.body.layout),
          restoreId,
        ),
      );
    } catch (e) {
      res
        .status(409)
        .json({ error: e instanceof Error ? e.message : "검사 실패" });
    }
  });
  app.post("/api/farm-layout/apply", async (req, res) => {
    try {
      if (typeof req.body?.previewId !== "string" || req.body.confirm !== true)
        throw Error("변경 미리보기와 최종 확인이 필요합니다");
      res.json(
        await store.applyFarmLayout(token(req.headers), req.body.previewId),
      );
    } catch (e) {
      res
        .status(409)
        .json({ error: e instanceof Error ? e.message : "적용 실패" });
    }
  });
}
