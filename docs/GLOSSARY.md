# Glossary of task and decision ids

Comments in `src/` cite ids such as `CF-7`, `Task 6.2`, `Polish 3`, `R18`, `K6`,
`v18 Task 1.4` and `Stream 4`. They were written while building from the specs
and plans in `docs/superpowers/`, and most of them only make sense there. This
page says what each family of ids was and which file defines it. The comments
themselves are left as written.

Two things hold for every family. Ids are **local**: `Task 5` and `R7` mean
something different in each plan, so read the id together with whatever sits
next to it in the comment (a version, a stream, a feature name) and open the
matching plan. And a plan is the source for its own ids, so a search such as
`git grep -n "R18" docs/superpowers` usually lands on the definition.

Paths below are relative to `docs/superpowers/`. Where the source could not be
found it says **origin not found**; those ids were most likely handed out in
working notes that were never committed. `git log -S"<id>" -- <file>` on the
file that cites it will at least show the commit that introduced it.

## Versions, waves and streams

| Id as it appears in `src/` | What it was | Defined in |
|---|---|---|
| `v1` to `v17` (`v7-online`, `v3(L` ...) | Feature waves of the original game: core, Spice, Cat Life, Real Game, Co-Walks, Mobile, Always Online (cloud saves, friends, ghosts), Say Hi (chat), Home Base tabs, Talk to the Cats, Cat Couture (accessory slots), and the v11 to v17 programme (Juice and Polish, Alive World, Cat Athletics, Collector's Journal, Together, Cozy Den) | `specs/2026-07-31-whisker-walk-design.md` and the other `specs/2026-0[78]-*` files; plans in `plans/2026-0[78]-*`; v11 to v17 together in `plans/2026-08-13-whisker-walk-v11-v17-master.md` |
| `v18`, `v18 Task N.N`, `v18 final review` | Cat Skills: earned abilities, the Old Docks, extended ranks, gifts. `Task N.N` is that plan's numbering | `specs/2026-08-17-whisker-walk-v18-cat-skills.md`, `plans/2026-08-18-whisker-walk-v18-cat-skills.md` |
| `CF-1` to `CF-12`, `CF-9b` | "Carry-forward items": issues raised mid-way through v18 that had to be assigned to a later task so they would not be lost. CF-9 is Spring Paws and Sure Claws, CF-12 is the descoped swimming ability | "Carry-forward items" in `plans/2026-08-18-whisker-walk-v18-cat-skills.md`; CF-12 is also cited in the v18 spec and `specs/2026-10-31-swimming-design.md` |
| `v19` | Water as data (`waters` records) and the collider wave. No spec of its own | **origin not found** (the v20 spec builds on it) |
| `v20`, `v20 "Ruffled Fur"`, `D1` to `D7` cited with v20 | The enemy and grudge system; D1 to D7 are its locked decisions (D2 is "strays only") | `specs/2026-08-27-whisker-walk-v20-ruffled-fur.md` |
| `v21`, `v21 spec`, `Stream 1` to `Stream 5` | "Reason to come back": Stream 1 legibility, 2 colony, 3 the clan (3a clan, 3b verbs), 4 performance (measure, then adaptive Auto), 5 the dressing room | Spec `specs/2026-10-24-whisker-walk-v21-reason-to-come-back-design.md`; plans `plans/2026-10-24-whisker-walk-v21-stream1-legibility.md`, `...stream2-colony.md`, `plans/2026-10-25-whisker-walk-v21-stream3a-clan.md`, `...stream3b-verbs.md`, `...stream4-measure.md`, `...stream4-adaptive.md`, `...stream5-dressing-room.md`; clan spec `specs/2026-10-25-whisker-walk-v21-the-clan-design.md`; handoffs in `handoffs/` |
| `Stream 4 round two/three/four` | Visual passes on grass, the Docks, the Seaside, paw prints, clouds and ambient life | `docs/VISUAL-PASS.md` (headings of that name) |
| `Part 1`, `Part 2`, `Clan Life Part 1` | Clan Life: Part 1 cast, camps and verbs; Part 2 intruders and fights | `specs/2026-10-31-clan-life-design.md`; `plans/2026-10-31-clan-life-1-cast-camp-verbs.md`, `plans/2026-10-31-clan-life-2-intruders-fights.md` |
| `Gorge part 1` to `Gorge part 4` | The Gorge territory, built in four plans: 1 ground height, 2 map, 3 caves, 4 CliffClan | `specs/2026-11-01-gorge-design.md`; `plans/2026-11-01-gorge-1-ground-height.md`, `gorge-2-map.md`, `gorge-3-caves.md`, `gorge-4-cliffclan.md` |
| `Wave 1` to `Wave 6` | The waves of the original visual-realism pass (free wins, grounding and contact shadows, draw-call budget, silhouette, material depth, the cat) | `docs/VISUAL-PASS.md`, section 3 "The waves" |
| `Phase 4`, `Phase N` | Phases inside one plan (for example the clan plan's Phase 4) | The plan named next to it in the comment, mainly `plans/2026-10-25-whisker-walk-v21-stream3a-clan.md` |

## Polish passes and surveys

| Id as it appears in `src/` | What it was | Defined in |
|---|---|---|
| `Polish 1a` (`Polish 1a, Task 5`) | The first polish pass, "every walk looks right", part a | `plans/2026-11-02-polish-5.md` |
| `Polish 2`, `Polish 3` | Later rounds of the same polish series | **origin not found** (`plans/2026-11-02-polish-*.md` are the builds of that period) |
| `Pass 8`, `Pass 10`, `Pass 11` (`polish-catlight (Pass 10)`) | Numbered polish passes, each driven by a survey of live screenshots and made of named builds such as `polish-daylight`, `polish-catlight`, `polish-moorlook`, `polish-fountainglow` | One plan per build, `plans/2026-11-0[2-9]-polish-*.md`, named after the build; the item number is in its title, for example `plans/2026-11-09-polish-catlight.md` is "Pass 10, item 10-2" |
| `Survey 9`, `Survey 11` | The ranked lists of visual defects that each pass worked from | **origin not found** (the survey files were never committed; the plans quote the rows they took) |
| `polish-<name>` | One build in a pass, with its own plan file | `plans/2026-11-0*-polish-<name>.md` |
| `rung`, `rung 0` to `rung 5` | The graphics ladder used by adaptive Auto and the "below LOW" degrade path (not a task id) | `docs/VISUAL-PASS.md`, "Adaptive Auto" and "Below LOW" |

## Rulings and decisions

These are numbered inside one plan or spec each, then cited by number in code
comments. The prefix usually tells you the family.

| Id | What it was | Defined in |
|---|---|---|
| `Task N`, `Task N.N` with no version | A numbered task in the plan for the feature the comment names (for example "Swimming (Task 6)"; "Docks, Task 4.0") | The plan for that feature in `plans/`; `Task 6.2` (pounce-tag, mutual grooming) is in `plans/2026-08-13-whisker-walk-v11-v17-master.md` |
| `R1` to `R21` | "Rulings": numbered design decisions at the head of a plan, often settled during review. Numbering restarts per plan | The plan for the feature: cat body and body refinement (`plans/2026-10-31-cat-body.md`, `plans/2026-11-01-body-refinement.md`), border crossings (`plans/2026-11-01-border-crossings.md`), fight moves and scars (`plans/2026-11-01-fight-moves-and-scars.md`, R18 to R21), the Gorge ground height (`plans/2026-11-01-gorge-1-ground-height.md`), and several `polish-*` plans |
| `R22` and above (`R24`, `R25`, `R26`, `R27`, `R36`, `R38`, `R40`, `R41`) | Later rulings, many added in fix rounds. `R42` appears in `plans/2026-10-31-clan-edition-island.md` | **origin not found** for all but R42 |
| `D1` to `D7` | Decisions in a spec or plan. D1 to D7 with a v20 mention are the Ruffled Fur decisions; `D2` also names the family pet D2 in game code, which is a cat, not a decision | v20 spec above; the family-cats plan `plans/2026-10-25-whisker-walk-family-cats.md`; `plans/2026-10-31-clan-edition-pick-your-clan.md` (D6, D7) |
| `P0`, `P1`, `P2`, `P8` | Rulings in a plan, mostly clan marks and rests. `P0` to `P2` also appear as variable names for geometry points | **origin not found** for the marks and rests rulings; `plans/2026-11-02-polish-pose.md` and `plans/2026-10-31-clan-edition-pines.md` use a P1 of their own |
| `G1` to `G7` (`Gorge part 2, G7`) | Decisions in the Gorge map plan; G7 keeps strays and random spots on walkable ground | `plans/2026-11-01-gorge-2-map.md` (G5 also in `plans/2026-11-02-gorge-rock.md`) |
| `C1` to `C8` (`Gorge part 3, C6`) | Decisions in the Gorge caves plan; C6 keeps rain outside caves. A bare `final review C1` in `src/colony.js` is a different thing: a finding from the stream 2 final review | `plans/2026-11-01-gorge-3-caves.md`; `plans/2026-10-24-whisker-walk-v21-stream2-colony.md` |
| `K1` to `K8` (`part 4 K8`) | Decisions in the CliffClan plan (K6 the cast's names, K7 and K8 coat colours) | `plans/2026-11-01-gorge-4-cliffclan.md` |
| `B1` to `B7` (`ruling B1`) | Decisions for the border patrol fight (2026-11-04) | `plans/2026-11-04-border-patrol-fight.md` |
| `Step 6a`, `Step 6b`, `Step N` | A numbered step inside a plan task, or a step in a comment's own algorithm | The plan named by the comment; otherwise local to the comment |

## Other recurring terms

| Term | Meaning | Where to read |
|---|---|---|
| Canon / Clan Edition, Legacy Edition | The two editions that share one save | `specs/2026-10-31-editions-and-territories-design.md` |
| Visit milestones | The visit counter and its celebrations | `specs/2026-10-25-whisker-walk-visit-milestones-design.md` |
| Redeem codes | Code table and cooldown rules | `specs/2026-10-25-whisker-walk-redeem-codes-design.md` |
| Cat builder, cat body | Custom cats and the wrap-around-stripe body | `specs/2026-10-31-cat-builder-design.md`, `specs/2026-10-31-cat-body-design.md` |
| Launch screen | The home screen redesign | `specs/2026-11-05-launch-screen-design.md` |
| iOS app | The home-screen app and nightly refresh | `specs/2026-11-09-ios-app-design.md`, `ios/README.md` |
