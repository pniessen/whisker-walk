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
| Tests | `npm test` (`vitest run`) runs every test and takes minutes. `npm run test:quick` leaves out the slowest files (listed in `test/heavy.js`). While working, run single files, for example `npx vitest run test/redeem.test.js`. No counts in docs: the number of files and tests drifts. |
| Production build | `npm run build` (output in `dist/`) |
| iOS web bundle | `npm run build:ios` (Vite `ios` mode, output in `ios/web/`) |
| Refresh iPhone/iPad installs | `npm run ios:refresh`; `npm run ios:schedule` turns on the nightly 7 pm run (see `ios/README.md`) |

Deploy: every push to `main` runs `.github/workflows/deploy.yml` (the tests on
four machines side by side, each running a quarter with `vitest run --shard`,
then `npm run build`, GitHub Pages, and a check of the live site). It passes
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from repository secrets;
locally they go in a gitignored `.env.local`. `keepalive.yml` pings the
Supabase project twice a week so the free tier does not pause. The ping calls
the `profiles_by_ids` function with an empty list (it reads and writes
nothing, and keeps working after v8 Step B closes the tables); it has not yet
been confirmed against the live database, so run it once by hand from the
Actions tab after a change to it or to the SQL. Tests run on
Linux in CI, so float fixtures should compare with a tolerance.

## How work is done here

- **Feature work happens in git worktrees, never in the main checkout.** The
  main checkout stays on a clean `main`: the nightly iOS refresh builds from it
  (`ios/refresh-lib.mjs`: only `main`, as committed, in the main checkout
  reaches the devices).
- A worktree has no `node_modules` of its own; resolution walks up to the
  parent checkout's. Do not run `npm install` in a worktree.
- Vitest only collects tests from `test/` (`test.dir` in `vite.config.js`), so
  worktrees nested inside the checkout (`.claude/worktrees/`) are not picked
  up. Run the suite from inside the worktree you are working in.
- Larger changes go spec, then plan, then build, in `docs/superpowers/specs/`
  and `docs/superpowers/plans/`.
- **New tests check behaviour; they never read source files as text**: no
  `readFileSync` of `src/`, no "this line comes before that line" pins, no
  pins on comments. For the order of the walk's frame, extend
  `test/frameorder.test.js`, which runs main.js's real frame. The text pins
  already in the suite are being replaced, so a refactor that breaks one
  replaces it with a behaviour test rather than editing the text to match.

## Where the big pieces live

| Path | What |
|------|------|
| `src/main.js` | Boot and wiring: builds the systems, owns the live session, runs the render loop |
| `src/game/` | Walk lifecycle (`walk.js`), interactions, co-walk events (`netevents.js`), rooms and lobby, cloud and colony sync, photo mode, fights (`clanfight.js`, `borderfight.js`) |
| `src/ui/homebase.js` | The home screen (tabs, Settings, Sync); pure render helpers belong in `src/ui/hometabs.js` because `homebase.js` touches `document` at module scope. Also the dressing room, cat builder, HUD, minimap |
| `src/progression.js` | The save: state shape, `sanitizeState` (hostile-payload hardening), ranks. Saves are additive where possible |
| `src/cat/` | Procedural cat model, coat, limbs, accessories, animation |
| `src/render/` | Renderer rig, quality ladder and adaptive Auto, materials, sky, water, shadows, performance readout |
| `src/world/` | The areas (neighbourhood, park, seaside, docks, farm, fairground, woods, moor, river, pines and island, gorge) and the builder that assembles them |
| `src/cloud.js`, `src/net.js` | Supabase client: save/profile/friend RPCs and the realtime transport |
| `docs/*.sql` | The live Supabase contract: `supabase-setup.sql`, `supabase-colony.sql`, `supabase-v8-hardening.sql`, `supabase-v9-delete.sql` ("Delete my online data"; `supabase-v7-secret-fix.sql` is history; don't run it). The owner runs these in the Supabase SQL editor; do not change one without telling the owner to re-run it. `docs/COLONY-SETUP.md` explains it |
| `ios/` | The iPhone/iPad app (a WKWebView shell around the bundled web build, Xcode project, Swift tests) and the Node refresh scripts. `ios/README.md` is the guide |
| `test/` | Vitest suites; `test/fixtures/` holds pinned recordings (re-record only after finding out why one moved) |
| `docs/PRIVACY.md` | The draft privacy policy (not yet reviewed by a lawyer). It must stay true of the code: if a change alters what the game stores or sends, change this page with it. Its appendix lists the gaps the owner still has to decide on |
| `CREDITS.md` | Third-party libraries and where every asset comes from. Add a row when a library or an asset file is added. The project's own licence is all rights reserved: see `LICENSE` |
| `docs/family/` | Family keepsakes that are not part of the website (the old Clan Edition announcement page, without its gift codes). Nothing here is built or deployed; keep gift codes and personal details out of `public/` |
| `docs/VISUAL-PASS.md` | Running log of visual and performance passes |
| `docs/superpowers/` | Specs, plans and handoffs for every wave |

### Each place is its own download (F6)

- **Start-up** is `index.html`'s module script plus every chunk it imports
  statically. `npm run build` prints its gzipped size against
  `MAIN_GZIP_CEILING_KB = 720` (the owner's choice: 700 on 2026-11-20, raised to 720 on 2026-11-21 for the Market and the Old House) and each place
  against `AREA_GZIP_CEILING_KB = 100`, both in `scripts/buildjson.mjs`. Start-up
  was 896.3 kB before F6 and is about 667 kB after.
- **Every walk starts through `startWalkWhenReady`** (`walk.js`), which loads
  the place first (`src/game/areaload.js`, `src/world/areas.js`). `startWalk`
  stays synchronous and throws if the place isn't loaded. A first entry may
  show "Getting ready..."; a failed load stays home with a gentle line; the
  first failure online makes the line offer a fresh start and the next Explore
  reload the page (a failed import is remembered by the browser, so retrying
  cannot help). Offline failures never count and never reload. The home toast
  skips a line identical to one still showing.
- **Offline.** `public/sw.js` caches every file listed in `dist/precache.json`
  on install, tops up on every online page load, and keeps the newest three
  builds' files (`KEEP_BUILDS`). The website build stamps `sw.js` with the
  build id so each deploy installs a fresh worker.
- **Rooftops** (`?roofs=1`) loads through the same loader; `src/roofsflag.js`
  keeps only the switch.
- **iOS app**: every chunk is bundled under `ios/web/assets/`; there is no
  worker there.

### Adding an area

1. Build `src/world/<id>.js` (and its parts). Nothing outside it and
   `src/world/areas.js` may import it. Facts the rest of the game needs go in
   a small leaf module that both can import.
2. Add its line to `AREA_LOADERS` (a literal `import()`) and to
   `AREA_ENTRY_MODULES`, with any life module only it uses.
3. If it grows grass with its own tint or bare ground, export `GRASS_HOOKS`.
4. Add the catalog row and the `state.walks` key as before. `test/areas.test.js`
   and `test/lazybuild.test.js` fail if step 1 or 2 was missed.
5. `npm run build` prints the new place's download size (ceiling 100 kB).

Security notes that still hold: the backend is capability-based with no
accounts (a player secret and a save code), RLS denies direct table writes, and
all access goes through `SECURITY DEFINER` RPCs. Escape every server-derived
string at the render site, and never log or render secrets.
