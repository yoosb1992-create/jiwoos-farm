# v2.8.4 — explicit entry and incremental CI

Opening/reloading the client always opens the lobby. Saved sessions and player
identity are preserved. Continue, saved-farm selection, new-farm creation, family
join and personal-code import are explicit entry actions. Once playing, the
existing Colyseus token recovery and durable player-token fallback remain in
charge. Cancel/logout/pagehide invalidate in-flight intent and HTTP requests.
A late response cannot replace the current selection. Visibility/focus/online
only wake recovery after an explicit entry action in this page lifetime.

## CI operation

`Farm CI` is the single automatic orchestrator. Same-repository pull requests
reuse their push coverage; fork PRs get their own merged-code check. A required
aggregate rejects failure/cancellation and rejects a skipped *selected* gate.
Concurrency is keyed by commit and does not cancel required deployment gates.

| Layer | Work |
|---|---|
| FAST | Typecheck, core data/action unit tests plus imported dependants, static-server safety, one server/client build, selector/gate safety |
| TARGETED | Affected integration/browser tests; real disposable PostgreSQL for persistence/auth/shared state/editor/entry changes; production browser and Docker gates when affected |
| FULL | Every unit/integration/DB/browser regression, production client, both containers with restart/shutdown, legacy Sites and unchanged golden lab |

The TypeScript import graph selects transitive test dependencies. DOM/HTTP browser
coverage uses explicit runtime domain roots plus their import closures. Shared
modules widen coverage. Deleted, unknown and central entrypoint changes use a
conservative broad fallback. CSS-only changes use FAST; a change in the large
`client/main.ts` necessarily runs broad browser checks. New domains should add
runtime roots and semantic browser coverage in `scripts/ci/select.mjs`.

No regression is deleted. Lobby/reconnection specs omitted by the old hand-written
browser list now also run in FULL. CI infrastructure changes automatically request
one FULL verification. Plan JSON and exact revision appear in the run summary and
artifacts; failures are never made successful by retries or `continue-on-error`.

Node dependencies use npm cache. Browser binaries use a lockfile-specific cache.
Selected browser scenarios use one worker; FULL distributes the same scenarios
across three isolated jobs, each with its own PostgreSQL and game server. The
aggregate requires every selected shard to succeed. Server integration/DB checks
run separately so browser installation does not delay them. Production browser
checks run once (shard 1), reusing the FAST build artifact. Docker builds run only
when their inputs change or FULL is selected. Legacy Sites and the frozen
multiplayer lab are not rebuilt for ordinary farm UI changes.

## Manual and scheduled FULL

`.github/workflows/farm-full.yml` must also exist on default branch `main`.
Only this dispatcher is installed on main; game code stays on the development
branch. It runs Tuesdays at 04:17 Asia/Seoul (GitHub scheduling can be delayed).

In Actions choose **Farm FULL (development branch)** → **Run workflow**. Leave
`ref` as `feature/v2.7-world-editor-2`, or enter an exact v2.8.4-or-newer commit.
The dispatcher resolves it once and passes the immutable SHA to every job.
It does **not** test main's old game code. The summary reports the actual SHA.

An unexpired successful FULL artifact for that exact SHA is reused unless
`force` is selected. Scheduled checks reuse evidence only within six days, so
weekly verification still runs. Changing only the dispatcher on main also checks
its wiring while reusing an already successful development revision.

## Railway policy

Existing project `jiwoos-farm-v2-5`, Frontend, Backend and PostgreSQL are retained.
The two reviewed staged changes would enable `source.checkSuites` on the app
services. Applying them was cancelled at the tool approval step; both remain
staged and live Check Suites stays false. Autodeploy can therefore start before
CI finishes. No alternate configuration path was used to bypass that decision.
If Wait for CI is approved and enabled, Railway waits for the complete GitHub Actions workflow
conclusion, not just the FAST job. Thus selected integration/data safety gates
also precede deployment. A FULL requested for a release also gates that push.
The PostgreSQL service/configuration/data are not changed by this work.

Before this change, actual live Check Suites was false despite the older
`deployment/auto-deploy-watch.json` declaring true. Verify platform configuration,
not just that descriptive file. GitHub/Railway evidence and timings are reported
at task completion; local browser checks are not a two-physical-phone test.

## Measured validation (2026-10-14)

The previous automatic farm run `38506708209` took 20m 07s. FULL run
`38519430575` on `b28ec1a905c7eb79cc49c41b301b7bb3f88f6638` passed in
8m 12s, including FAST (47s), 94 unit tests, 29 server integration tests,
2 real PostgreSQL tests, 30 browser scenarios, 2 built-client browser scenarios,
containers, legacy Sites and the byte-identical golden lab. The first v2.8.4
attempt correctly failed on browser checks; no failures were hidden or skipped.

Main commit `50c0f86192a75dea9c0509dfbcc46c8bb0987559` installs only the
dispatcher. Its bootstrap run `38520258929` passed in seven seconds, resolved
the development workflow at the same `b28ec1a` revision and reused its FULL
success rather than repeating the suite.

The final test-only refinement calls `scene().ready` before measuring eight
seconds of idle lobby time. Its mobile and desktop cases passed locally. This
change selects FAST plus the session-entry browser file, demonstrating targeted
coverage without rerunning the unchanged full game regression.
