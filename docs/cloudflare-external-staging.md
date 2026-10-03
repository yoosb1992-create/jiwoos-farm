# Cloudflare external staging

This staging path exists to compare the current ChatGPT Sites deployment with a direct Cloudflare Workers deployment without replacing production first.

## What stays the same

- The game and Family realtime code stay in this repository.
- `FAMILY_ROOM` remains the room-scoped Durable Object.
- D1 remains authoritative for persistent Family state.
- WebRTC/WebSocket/D1 fallback behavior is unchanged.
- The existing ChatGPT Sites deployment is not modified by these commands.

## What is different

The external Workers deployment cannot rely on ChatGPT Sites authentication headers. It uses the standalone Jiwoo's Farm account/session tables introduced in `drizzle/0006_farm_accounts.sql`.

Passwords:
- minimum: 2 Unicode characters
- no application-level maximum length
- PBKDF2-SHA256, per-account random salt
- session cookies store only a random token; D1 stores only its SHA-256 hash

## One-time staging D1

Wrangler OAuth must already be authorized for the target Cloudflare account.

Create a new database dedicated to staging:

```bash
npx wrangler d1 create jiwoos-farm-staging
```

Copy the returned database ID. Do not point the staging initializer at the existing Sites database.

Initialize only the NEW staging database:

```bash
export JIWOO_STAGING_D1_NAME=jiwoos-farm-staging
export JIWOO_STAGING_CONFIRM=INIT_NEW_STAGING_DB
npm run staging:d1:init
```

The initializer refuses to run unless the database name contains `staging` and the explicit confirmation value is supplied.

## Build and deploy

Set the staging D1 identity:

```bash
export JIWOO_STAGING_D1_NAME=jiwoos-farm-staging
export JIWOO_STAGING_D1_ID=<D1_DATABASE_ID>
export JIWOO_STAGING_WORKER_NAME=jiwoos-farm-staging
npm run staging:deploy
```

`staging:prepare` starts from the framework-generated `dist/server/wrangler.json`, preserves the generated Durable Object configuration, replaces only the D1 binding with the staging database, enables `workers.dev`, and refuses deployment preparation if the `FAMILY_ROOM` binding is absent.

## A/B realtime check

Open the existing ChatGPT Sites URL on one pair of devices and the new `workers.dev` URL on another test run.

Inside Family mode, expand the Family status panel. The diagnostic line shows:

- current host
- `WebRTC`, `WebSocket`, `D1 fallback`, or connecting
- age of the last presence update

Interpretation:

- Workers = WebSocket/WebRTC while Sites = D1 fallback: hosting/runtime path is the likely cause.
- Both = D1 fallback: investigate realtime ticket/WebSocket routing or network traversal instead of moving more hosting.
- Both = WebSocket/WebRTC but movement still feels delayed: inspect client interpolation/rendering.
- Map editor crashes in both environments: treat the editor renderer/history architecture as the separate cause.
