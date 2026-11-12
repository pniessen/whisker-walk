# Whisker Walk — Session Handoff

> A one-page map of the project as it stands. It deliberately holds no
> per-wave history and no counts that go stale: the specs and plans in
> `docs/superpowers/` are the record of what each wave built, and
> `docs/GLOSSARY.md` decodes the task and decision ids (CF-7, Task 6.2,
> Polish 3, Stream 4 ...) that code comments use. An older, longer version of
> this file (waves v1 to v20, 2026-08-27) is in git history.

## What the game is

**Whisker Walk 2** is a third-person "be the cat" 3D walking game: vanilla ES
modules, Three.js and Vite, no framework, no model files (every cat and prop is
built in code). You walk neighbourhoods and wild territories (Clan Edition and
Legacy Edition share one save), meet stray cats, feed a colony, dress up and
build cats, and can co-walk with a partner over Supabase Realtime. Worlds are
seeded, so the same seed builds the same world; never call bare `Math.random()`
inside seeded generation, thread the injected RNG (`src/rng.js`) through.

- **Live site:** https://pniessen.github.io/whisker-walk/ (GitHub Pages, base path `/whisker-walk/`)
- **README.md** covers playing, the editions, multiplayer setup and the design docs.

## Run, test, build, deploy

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (Vite; `.claude/launch.json` pins ports 5174 and 5175 with `--strictPort`) |
| Tests | `npm test` (`vitest run`). The suite is about 300 files and 9,000+ tests and takes minutes; run single files while working, for example `npx vitest run test/redeem.test.js`. |
| Production build | `npm run build` (output in `dist/`) |
| iOS web bundle | `npm run build:ios` (Vite `ios` mode, output in `ios/web/`) |
| Refresh iPhone/iPad installs | `npm run ios:refresh`; `npm run ios:schedule` turns on the nightly 7 pm run (see `ios/README.md`) |

Deploy: every push to `main` runs `.github/workflows/deploy.yml` (`npm ci`,
`npm test`, `npm run build`, then GitHub Pages). It passes
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from repository secrets;
locally they go in a gitignored `.env.local`. `keepalive.yml` pings the
Supabase project twice a week so the free tier does not pause. Tests run on
Linux in CI, so float fixtures should compare with a tolerance.

## How work is done here

- **Feature work happens in git worktrees, never in the main checkout.** The
  main checkout stays on a clean `main`: the nightly iOS refresh builds from it
  (`ios/refresh-lib.mjs`: only `main`, as committed, in the main checkout
  reaches the devices).
- A worktree has no `node_modules` of its own; resolution walks up to the
  parent checkout's. Do not run `npm install` in a worktree.
- Worktrees nested inside the checkout (`.claude/worktrees/`) are picked up by a
  bare `vitest run` in the main checkout, which multiplies the suite. Run the
  suite from inside the worktree you are working in.
- Larger changes go spec, then plan, then build, in `docs/superpowers/specs/`
  and `docs/superpowers/plans/`.

## Where the big pieces live

| Path | What |
|------|------|
| `src/main.js` | Boot and wiring: builds the systems, owns the live session, runs the render loop |
| `src/game/` | Walk lifecycle (`walk.js`), interactions, co-walk events (`netevents.js`), rooms and lobby, cloud and colony sync, photo mode, fights (`clanfight.js`, `borderfight.js`) |
| `src/ui/homebase.js` | The home screen (tabs, Settings, Sync); pure render helpers belong in `src/ui/hometabs.js` because `homebase.js` touches `document` at module scope. Also the dressing room, cat builder, HUD, minimap |
| `src/progression.js` | The save: state shape, `sanitizeState` (hostile-payload hardening), ranks. Saves are additive where possible |
| `src/cat/` | Procedural cat model, coat, limbs, accessories, animation |
| `src/render/` | Renderer rig, quality ladder and adaptive Auto, materials, sky, water, shadows, performance readout |
| `src/world/` | The areas (neighbourhood, park, seaside, docks, woods, moor, river, pines and island, gorge) and the builder that assembles them |
| `src/cloud.js`, `src/net.js` | Supabase client: save/profile/friend RPCs and the realtime transport |
| `docs/*.sql` | The live Supabase contract: `supabase-setup.sql`, `supabase-colony.sql`, `supabase-v8-hardening.sql`, `supabase-v9-delete.sql` ("Delete my online data"; `supabase-v7-secret-fix.sql` is history; don't run it). The owner runs these in the Supabase SQL editor; do not change one without telling the owner to re-run it. `docs/COLONY-SETUP.md` explains it |
| `ios/` | The iPhone/iPad app (a WKWebView shell around the bundled web build, Xcode project, Swift tests) and the Node refresh scripts. `ios/README.md` is the guide |
| `test/` | Vitest suites, about 300 files; `test/fixtures/` holds pinned recordings (re-record only after finding out why one moved) |
| `docs/VISUAL-PASS.md` | Running log of visual and performance passes |
| `docs/superpowers/` | Specs, plans and handoffs for every wave |

Security notes that still hold: the backend is capability-based with no
accounts (a player secret and a save code), RLS denies direct table writes, and
all access goes through `SECURITY DEFINER` RPCs. Escape every server-derived
string at the render site, and never log or render secrets.
