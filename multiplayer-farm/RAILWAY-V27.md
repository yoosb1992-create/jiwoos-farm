# v2.7 preview deployment handoff

Target repository only: `yoosb1992-create/jiwoos-farm`  
Source branch: `feature/v2.7-world-editor-2`  
Keep production Frontend and Backend on `feature/v2.6-farm-content-expansion`.

The mobile editor and runtime build from the existing Dockerfiles. The branch is included in the existing multiplayer workflow, including typecheck, unit/integration/DB tests, browser smoke and Docker checks. Root CI and the unchanged golden multiplayer-lab CI remain enabled.

On 2026-10-06 UTC, creating the empty preview services `Editor27Backend` and `Editor27Frontend` in the existing `jiwoos-farm-v2-5` project was rejected by Railway:

> Free plan resource provision limit exceeded. Please upgrade to provision more resources!

Neither service was created. The public production source, database, variables and domains were not changed. A v2.7 URL must not be reported as deployed until provisioning and health checks succeed. There is no CLI requirement for the user.

## Prepared dashboard/API configuration

`deployment/railway-v27-preview.json` contains the service plan. After the account can provision two preview services:

1. Create the two services in the existing project and production environment, with distinct preview names/domains. They are separate services; do not change the two production services.
2. Set their Dockerfile, health and source branch settings from the plan.
3. Backend reuses the existing private Postgres connection but sets `FARM_DATABASE_SCHEMA=farm_v27_preview`. The process accepts only `farm_v26` (existing/default) or `farm_v27_preview`. There is no database reset/drop/copy. First startup creates only its own tables in the new schema, using existing migrations.
4. Generate both public service domains. The frontend WebSocket endpoint references `Editor27Backend`; backend CORS references `Editor27Frontend` only.
5. Connect the v2.7 branch after its required CI succeeds, then verify both `/healthz` endpoints, `/editor.html`, a new preview family, and a save/publish/new-family roundtrip on Android.
6. Preview editor URL: `https://<Editor27Frontend domain>/editor.html`. Preview game URL: the same domain at `/`. These are placeholders, not provisioned URLs.

The existing public game remains https://frontend-production-a998.up.railway.app/ and the existing v2.6 editor remains https://frontend-production-a998.up.railway.app/editor.html . They do not serve World Editor 2.0 until a later explicit production cutover.

## Production transition

Do not automatically promote based only on local or CI browser emulation. Keep the v2.6 branch and its published deployment available for rollback. Once Android preview is accepted, switch production source deliberately, keeping the production schema `farm_v26`. Existing family layouts remain snapshots. Only newly created families selecting a published v2.7 blueprint receive that world. Do not point production at the preview schema or transfer preview session tokens into production.
