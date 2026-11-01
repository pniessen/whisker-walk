# Clan Life, Part 1: the Clan, its Camp and Clanmates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Clan Edition, every territory with a camp has its own clan living in it: a leader, a deputy, elders and kits at a busy, marked camp, warriors and apprentices around the land, all named by rank and dressed in their clan's colours. The camp shows on the corner map and the territory map. Where you are at home you can touch noses, boop and patrol with them.

**This is Part 1 of 2.** The spec is too big for one plan. Part 2 (`docs/superpowers/plans/2026-10-31-clan-life-2-intruders-fights.md`) adds intruders, the fight and the fight's co-walk sync. Part 1 ships on its own: it adds a clan and a camp and takes nothing away. Part 2 builds on Part 1's interfaces.

**Architecture:**
- **The clan cast is data, derived, never stored.** `src/clancast.js` (pure) turns `(clan id, slot)` into a name, a rank and a coat from the clan's own palette. Spots come from the camp disc and the built map. Nothing reads `walkRng`, the strays' stream or the save. Both devices compute the same cast, as `clannames.js` and `rivalclans.js` already do.
- **Sixteen slots, ordered so the low tier is a prefix.** Slots 0–8 are the core clan (leader, elder, 2 kits, 3 warriors, 2 apprentices); slots 9–15 make the camp busier on HIGH (deputy, a second elder, 2 more kits, 2 more warriors, an apprentice). A device shows the first `clanCountFor(tierStrays, fedHere)` slots, so two devices on different tiers agree on every cat both show, exactly as strays already agree as a prefix.
- **Clan cats replace strays one for one.** In a territory with a camp, the walk spawns `lonersFor(areaId, tier.strays, fedHere)` ordinary strays: `tier.strays − clan count − 1` (the 1 is the intruder slot Part 2 fills). HIGH: 16 + 1 + 5 = 22. LOW: 9 + 1 + 4 = 14. Fewer strays from the same stream is a prefix of today's cast, so no existing draw moves. The old areas and the den call `createStrayCats` with exactly today's arguments.
- **Fed colony cats keep their places.** Colony cats already take the loner slots first (`createStrayCats` puts them at the head of the cast). On HIGH, when a territory holds more than 5 fed-but-untamed colony cats, the extra clan slots (9–15) give way one for one, down to the core 9, so up to 12 fed cats stay visible (see "The loner trade-off" below).
- **Edition-independent world, edition-dependent words.** Every device in a territory spawns the same clan cats in the same places. Legacy shows them as plain cats, with no tag, prompt or camp marker. Clan Edition adds tags, prompts and map marks.
- **"At home"** is `clanHomeFor(areaId, edition, picks)`: Clan Edition, and the territory's clan is your pick or your sibling's (decision 9, using the pick-your-clan plan's `picksOf`). At home there is no hostile camp patrol: intruders replace it (owner's decision 2026-10-31, superseding pick-your-clan's D7 for the clan-life era). Everywhere else today's patrol rules stand.
- **Clan cats are a separate list** (`session.clanCats`), never in `strayCats.strays`, and their names are never stray names. So the feed prompt, grudges and the colony can't see them. That is structural: two independent halves, as `isGrudgeableStray` documents.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4, plain ES modules.

**Spec:** `docs/superpowers/specs/2026-10-31-clan-life-design.md` (owner decisions 1–3, 8, 9; §1–§3; §5's table). Read it, and the "Depends on" section below, before Task 1.

## Depends on (must be on main before Task 1)

1. **Pick your clan**, `docs/superpowers/plans/2026-10-31-clan-edition-pick-your-clan.md`, **all of Tasks 1–8** (Task 8 gives the Moor its camp). This plan uses, by name:
   - `src/clanhomes.js`: `HOMES`, `TRUCE_AREAS`, `isClanId`, `clanName`, `picksOf(state)`;
   - `src/clanwords.js`: `HOMAGE_CHOICES` (the clanwords test keeps clan cat words apart from it);
   - `src/rivalclans.js`: `DISCS` with rows `woods` (2, −43) r 6, `river` (5, 1) r 6 and `moor` (Task 8's row); `rivalFor`, `isTrespassing`;
   - `src/edition.js`: `rivalForWalk(areaId, edition, picks)`;
   - `src/game/walk.js`: the line `const picks = picksOf(progression.state);` above the comment `// The rival's border and its patrol (v21 Stream 3a).`;
   - `state.clanPick` in the save.

   If any of these is missing, stop and report. Do not build a stand-in.
2. **The new cat body** (`src/cat/model.js`, `src/cat/animator.js`): merged. Ranks use its existing poses (`nap`, `requestPet`, `pounce`, `follow`, `sniff`); Part 2 adds the fight poses. Clan coats use its STYLE-row flags (`stripes`, `headStripes`, `patches`, `fluffy`, `whiteLegs`, `socks`, `chin`) and colours (`base`, `belly`, `accent`). Checked on 2026-10-31: every palette row below is expressible with those, with two gaps Task 3 closes: `buildCat` reads only `STYLE[breed]`, so it gains `opts.style` (a full STYLE row); and `coatFromStyle`'s `patches` paint a fixed `0x333333` second patch, so a row may give `patch2` (default `0x333333`, so the calico is unchanged). The cat builder's spec plans `opts.look` → `lookToStyle(look)`, which ends in the same row, so the two meet cleanly: when the builder lands, `look` is turned into a `style` and drawn the same way.
3. **Kittypets and the island (plans, not built).** Nothing here edits their files. If the kittypets plan has landed, its `territoryCastExcludes` still applies to the strays (loners), unchanged. If the island plan has landed, walk.js folds its keep-out into the `isWalkable` it hands `roamHomes` and `createClanCats` (Tasks 2–3), so clan cats keep out too.

## Global Constraints

- **No new draws on `walkRng` or `strayStream`.** The clan cast is derived from its own seeds: `seedFromCode(`${clanId}|cast|${slot}`)` for names and coats, `seedFromCode(`${areaId}|roam`)` for roaming homes, and a per-cat wander stream from `(roomSeed ?? one Math.random base) + seedFromCode(id)`, salted, exactly the `strayWanderRng` pattern. **The old areas' casts, the den's and Legacy's casts outside territories stay byte-identical.**
- **Co-walk agreement:** the same clan cats in the same places on both devices, whatever the edition or pick. Across quality tiers the cast agrees as a prefix: the core 9 (and so every raider Part 2 uses) are on every device; a HIGH device adds slots 9–15 in the same places. Loners agree as a prefix, as strays do today.
- **Budget:** a territory's cats ≤ today's `tier.strays` there (22 high, 14 low): clan + 1 intruder slot + loners = `tier.strays` (16 + 1 + 5 on HIGH, 9 + 1 + 4 on LOW). Extras (legendary, kittypet wanderer) and the rival patrol cat are unchanged from today.
- **SAVE_VERSION stays 4. No new stored field.** The new award type (`patrol`) becomes a `state.feats` key through the existing `FEAT_TYPES` path, which is already sanitised.
- **Clan cats are never stored, fed, tamed, grudged or sent as stray names.** `clancast.js` and `clancats.js` import nothing from `progression.js`, `colony.js`, `discoveries.js`, `enemies.js` or `net.js` (structural import tests).
- **Legacy shows no clan layer:** no names, tags, prompts, camp markers or allies wording. It still spawns the same cats and the same camp props.
- **Our own words.** New name parts live only in `src/clanwords.js` and pass `test/clanwords.test.js`. No `src/` string literal outside `clanwords.js` may contain a `RANK_WORDS`, `OUTSIDE_WORDS` or `PLACE_WORDS` value or the word `Clan` (whole word, any case). Compare ranks with `RANK_KEYS`, never `'kit'` or `'leader'` literals (that includes CSS class names and data attributes written in JS).
- **Reduced motion** (`settings.get('reducedMotion')`): kits sit instead of hopping; nothing else in Part 1 moves for show.
- **Phone first:** prompts use the existing tappable prompt pill; nothing new needs a keyboard.
- **Tests assert membership, never whole lists of areas or territories.**
- **Commits:** an explicit `git add <files>`, and messages ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Test command:** `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`

## Owner's decisions and rulings (2026-10-31)

**Owner's decisions** (answered in chat, relayed by the coordinator):
1. **Home patrol: intruders replace the neighbour patrol at your own camp.** At home (your clan's land or your sibling's) no patrol chases you off the camp. This **supersedes pick-your-clan's D7 for the clan-life era**; that plan's D7 carries a dated note pointing here.
2. **Name words:** the 36 words in Task 1, as listed. (The 28 extra words that the busier HIGH camp needs were added afterwards by the coordinator's ruling 4 below; they are the builder's picks and still want the 11-year-old's look.)
3. **Each clan has its own colours**, so a clan's cats read as one family at a glance and an intruder stands out. Each clan has a small palette of coats that suits its land (StormClan browns and tabbies, GaleClan light greys and creams, BrookClan grey-blues and silvers, DuskClan blacks and dark tortoiseshells; CliffClan later). A cat's coat is derived from its clan and slot, never stored, so both devices match; intruders wear their own clan's colours.
4. **A busier camp** than 1 leader, 1 elder, 2 kits, 3 warriors and 2 apprentices.

**Coordinator's rulings:**
- **The HIGH cast** (ruling on decision 4): 1 leader, 1 deputy (`RANK_KEYS.deputy`, named with a warrior suffix, tag "deputy of StormClan"), 2 elders, 4 kits, 5 warriors, 3 apprentices: **16 clan cats + 1 intruder slot + 5 loners = 22**. **LOW (14):** the core 9 + 1 + 4.
- An intruder from either kid's clan (own or sibling's) never starts a fight for anyone; it just walks through (Part 2).
- The fight's teach line shows in every fight (Part 2).
- No intruder dot on the corner map; spotting it is part of the fun.
- The personality edges and the award values stay as proposed.

**Coordinator's rulings after the plan review (2026-10-31):**
- **Names (owner question 2):** the owner's words stay; only slots move. Root (Rootpaw) and Toad (Toadkit) move to warrior slots within the owner's nine, and River's Trout (Troutkit) and Mint (Mintpaw) do the same, since both made book names. `Rootpaw`, `Toadkit`, `Troutkit`, `Mintpaw` and `Mintfur` join `DENIED_NAMES`, and the warrior suffix steps past any denied name.
- **Award caps per walk (owner question 3):** touch noses pays for the first 4 clan cats a walk, boop for the first 4, patrols for 2; intruders pay as they come (about 3 a walk, Part 2). **Per-walk maximum from clan life:** 4 × 6 + 4 × 5 + 2 × 8 = **60** in Part 1, plus about 3 × 12 = 36 from intruders, so about **96** in a 10-minute walk. The verbs keep working after a cap; they just stop paying.
- **Draw budget levers, in order (owner question 4):** (1) built from the start: camp-seated cats (leader, deputy, elders, kits) cast no shadow-map shadow (`userData.noCast`); (2) only if the Task 3 gate fails: merge each static-pose cat (the leader, each napping elder) into one mesh; (3) only if it still fails: 2 kits instead of 4 on HIGH (the freed slots go back to loners).
- **Co-fights (Part 2):** when both kids fight the same intruder and one wins, both get the award ("chased off together"), exactly once each.

**The loner trade-off, stated plainly.** Fewer loners means fewer fed colony cats can stand at their spots. How many is realistic: untamed colony cats are capped at `COLONY_MAX` 24 across all seven feeding areas, a cat leaves for the den after 6 feeds, and each cat can be fed once per walk per kid, so a territory the kids feed in holds about **2–6** fed-but-untamed cats at a time, rarely more. 5 loners covers most of that but not all, and a cat that silently vanishes from its spot breaks "go back and feed Pickles". **Fix (built in Task 3):** fed colony cats already take the loner slots first; on HIGH the extra clan slots (9–15) also give way, one per fed cat beyond 5: `clanCountFor(22, fedHere) = clamp(16 − max(0, fedHere − 5), 9, 16)`. So up to 12 fed cats stay visible on HIGH, the camp's core never thins, and the total stays 22. **On LOW this is a real cut: a territory now shows at most 4 fed colony cats, where today it shows up to 14.** A fed cat beyond the fourth isn't lost (it stays in the colony and is shown on HIGH or once the others are tamed), but it isn't at its spot on that walk. Partners on a colony walk share the colony, so they agree; a walk with a non-partner passes no colony cats (today's rule), so `fedHere` is 0 on both devices.

## Builder's defaults (the spec left these to the builder)

| Thing | Default | Why |
|---|---|---|
| Cast per clan | HIGH 16 (ruling above); LOW the core 9: 1 leader, 1 elder, 2 kits at the camp, 3 warriors and 2 apprentices roaming. | Core 9 + 1 intruder leaves 4 loners on LOW. |
| Slot order | 0 leader, 1 elder, 2–3 kits, 4–6 warriors, 7–8 apprentices; then 9 deputy, 10 elder, 11–12 kits, 13–14 warriors, 15 apprentice | Fixed. The first 9 are the LOW cast, so every tier is a prefix. Part 2's raiders are slots 4–6 of the neighbour clan, present on every tier. |
| Size | kit 0.5, apprentice 0.72, warrior and elder 0.85 (a stray's size), deputy 0.9, leader 0.95 | Reads at a glance on a phone. |
| Posture | leader sits (`requestPet`) on the leader's rock; the deputy stands beside the rock, looking out (`follow`, still); elders nap (`nap`) by the den; kits hop (`pounce`) between their spots in front of the den, or sit with reduced motion; warriors and apprentices wander 2–6 m round their home spot | Uses the new body's poses only. |
| Coats | five STYLE rows per clan (Task 1's `CLAN_COATS`); a cat's row is `seedFromCode(`${clanId}|coat|${slot}`) % 5` | Owner's decision 3. |
| Camp look | a bramble den mound (dark green half-dome, r 1.1, h 0.9, with a dark doorway disc) and a grey leader's rock (r 0.6, h 0.8), both colliders | 3 meshes (den, doorway, rock) in one top-level group. |
| Name tag | name on top; a smaller second line "`<rank word>` of `<ClanName>`" (e.g. "Thornfur" / "warrior of StormClan") | Spec "Thornfur of StormClan"; the rank word teaches the ranks (elder and warrior names look alike). |
| Awards | touch noses: the existing `friend` (6), key `clan-friend-<id>`; boop: the existing `boop` (5), key `clan-boop-<id>`; patrol together: new `patrol: 8`, key `patrol-<id>` | Once per cat per walk (`awardOnce`), and capped per walk (ruling above: 4 / 4 / 2). Touching noses counts for the "Greet 3 cats" goal, as greeting a stray does. |
| Patrol together | up to 60 s; pays only if together ≥ 30 s; ends at the camp disc, within 4 m of the map edge, if you get 12 m ahead, on "say goodbye", or at walk end | Spec "about a minute, or until you reach the border or the camp". |
| Camp marker colours | woods `#3f7d3a`, moor `#9a6aa8`, river `#2f7fa8`, pines `#35584a` | One per clan, readable on the map's land colours. |

## Still open (small; build the default unless told otherwise)

- The 28 extra name words (slots 9–15) and the palettes are the builder's picks; show them to the 11-year-old. Any word or colour she changes is one line.

## Review Focus

1. **A co-walk on different tiers or editions** (one device high, one low; one Legacy). Expected: the core 9 clan cats at the same spots on both, with the HIGH device's extra 7 in their own places; Legacy unlabelled but the same coats. Test: Task 3 "the cast agrees across tiers as a prefix, and across editions exactly".
2. **The colony in a territory** (6–12 fed loners on HIGH, a full colony, a low-tier device). Expected: every fed cat up to 12 (HIGH) or 4 (LOW) still stands at its spot; the camp's core 9 never thins; clan cats never offer a feed prompt. Tests: Task 1 "fed cats beyond 5 take the extra clan slots", Task 3 "fed colony cats stay visible", Task 5 "a clan cat never gets the feed prompt".
3. **A kid with no pick, or a stale sibling pick.** Expected: every territory is someone else's land: greet only, today's patrol. Test: Task 1 `clanHomeFor` with `[]` picks; Task 5 "no boop or patrol prompt away from home".
4. **A clan cat spot on a bad place** (water, a tree, the camp patrol ring, off the map). Expected: never. Test: Task 2's built-map checks for every spot and roaming circle.
5. **Hostile or unknown ids** (`'__proto__'`, `'island'`, `'den'`, a future `'gorge'` with no row). Expected: no cast, today's stray count, no throw. Test: Task 1 "unknown areas have no cast and keep today's strays".

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/clanwords.js` | append at the END | `CLAN_CAT_PREFIXES`: sixteen name halves per clan, in slot order |
| `src/clancast.js` | **create**, pure | ranks, names, `CLAN_COATS` palettes, `castFor`, `clanCountFor`, `lonersFor`, `clanHomeFor`, `roamHomes`, colours |
| `src/cat/model.js` | modify | `buildCat(breed, accessories, { style })`: draw a given STYLE row |
| `src/world/camp.js` | **create** | `campLayout(areaId)` (pure) and `addCamp(scene, area, areaId)` (meshes, colliders) |
| `src/world/woods.js`, `river.js`, `moor.js` | modify (one call each) | add the camp in `build` |
| `src/nametag.js` | modify | `makeNameTag(name, { sub })`: an optional small second line |
| `src/clancats.js` | **create**, THREE | spawn, pose, wander, greet/boop/buddy, dispose |
| `src/game/walk.js` | modify | loner count, clan cats, `clanHome`, no patrol at home, camp marker, dispose |
| `src/main.js` | modify | update clan cats each frame; `mapFrame.camp` |
| `src/ui/minimapmath.js`, `src/ui/minimap.js` | modify | the `camp` marker |
| `src/territories.js`, `src/ui/territorymap.js`, `src/style.css` | modify | camp icons on the territory map |
| `src/discoveries.js` | modify | `AWARDS.patrol = 8` |
| `src/game/interactions.js` | modify | clanmate prompts and E handling |
| `src/game/netevents.js` | modify | `clan-buddy` events |
| tests | see each task | |

---

### Task 1: The clan cast and its names (pure)

**Files:**
- Modify: `src/clanwords.js` (append at the very end)
- Create: `src/clancast.js`
- Test: `test/clanwords.test.js` (append), `test/clancast.test.js`

**Interfaces:**
- Consumes: `isClanId`, `clanName`, `HOMES`, `TRUCE_AREAS` (clanhomes); `DISCS` (rivalclans); `WARRIOR_SUFFIXES`, `RANK_SUFFIX`, `RANK_KEYS`, `RANK_WORDS` (clanwords); `seedFromCode` (rng); `isStrayName` (straynames).
- Produces:
  - `CLAN_CAT_PREFIXES: Readonly<Record<ClanId, readonly string[16]>>` in `clanwords.js`.
  - `CAST_RANKS: readonly RankKey[]` (as `RANK_KEYS` values) = `[leader, elder, kit, kit, warrior, warrior, warrior, apprentice, apprentice, deputy, elder, kit, kit, warrior, warrior, apprentice]`.
  - `CAST_CORE = 9`, `CAST_HIGH = 16`, `INTRUDER_SLOTS = 1`, `MIN_LONERS_HIGH = 5`, `RAIDER_SLOTS = [4, 5, 6]`.
  - `RANK_SCALE: Readonly<Record<RankKey, number>>` = leader 0.95, deputy 0.9, elder 0.85, warrior 0.85, apprentice 0.72, kit 0.5.
  - `CLAN_COLOURS: Readonly<Record<ClanId, string>>` (the camp-marker table above).
  - `CLAN_COATS: Readonly<Record<ClanId, readonly CoatRow[5]>>`, `CoatRow = { eyes: breed, base, belly, accent, patch2?, scale: 1, ...flags }` — a STYLE row plus the preset breed whose eye colour it borrows. The rows (hex `base/belly/accent`; flags in brackets). Checked 2026-10-31 with a throwaway script: every coat's base is ≥ 58 (RGB 0–255, Euclidean) from every other clan's coats; the closest pair is GaleClan `bcb6aa` against BrookClan `8ca6c8`.
    - **woods (StormClan, browns and tabbies):** brown tabby `8a6a45/d2b98e/5a4129` [stripes, headStripes]; dark brown tabby `6b4f33/b99a72/3e2c1c` [stripes]; ginger-brown tabby `a0703f/e0c49a/6d4622` [stripes, headStripes]; brown tabby-and-white `7a5b3a/f2efe8/4a3522` [stripes, whiteLegs]; chestnut `7b4a2a/c79a70/55311b` [chin]. Eyes `tabby`.
    - **moor (GaleClan, light greys and creams):** pale grey `c8c4bc/eeeceb/9a968e`; cream `e6d6b4/f6efdc/c8b58e`; pale grey tabby `c4bcac/ebe6dc/8a8274` [stripes]; cream tabby `dcc49a/f4ead2/b39468` [stripes]; oatmeal-and-white `bcb6aa/f5f5f2/8e887c` [whiteLegs, chin]. Eyes `tabby`.
    - **river (BrookClan, grey-blues and silvers):** blue-grey `6f7d8c/b7c0ca/4e5966`; silver-blue tabby `7c94b8/d6e0ec/4a5c78` [stripes, headStripes]; slate blue `5b6878/9aa6b4/3d4652`; blue-grey with white socks `7a8ca4/f2f4f6/55667c` [socks, chin]; pale blue longhair `8ca6c8/dbe5f0/647c9c` [fluffy]. Eyes `siamese` (blue).
    - **pines (DuskClan, blacks and dark tortoiseshells):** black `26262c/34343c/18181c`; dark tortoiseshell `2e2622/4a3a30/9c5a2c`, `patch2` `1a1410` [patches]; smoky black longhair `33333a/4a4a52/202026` [fluffy]; deep tortoiseshell `3a2c24/54443a/b0682e`, `patch2` `241a14` [patches]; black with white socks `222228/3a3a42/141418` [socks]. Eyes `black` (gold).
    - **gorge (CliffClan):** no row yet; it lands with the Gorge.
  - `clanCast(clanId) -> readonly Member[]`, where `Member = { id: `${clanId}-${slot}`, clan, slot, rank, name, breed, style }`. `style` is `CLAN_COATS[clanId][seedFromCode(`${clanId}|coat|${slot}`) % 5]` (frozen); `breed` is that row's `eyes`. Frozen and cached. `[]` for a clan with no `CLAN_CAT_PREFIXES` or `CLAN_COATS` row (gorge today) or a non-id.
  - `castFor(areaId) -> readonly Member[]`: all 16 of `clanCast(areaId)` when `isClanId(areaId)`, the area is not in `TRUCE_AREAS` and `Object.hasOwn(DISCS, areaId)`; otherwise `[]`. The walk shows a prefix of it (`clanCountFor`).
  - `clanCountFor(tierStrays, fedHere = 0) -> number`: `CAST_CORE` unless `tierStrays >= CAST_HIGH + INTRUDER_SLOTS + MIN_LONERS_HIGH` (22); then `clamp(CAST_HIGH − max(0, fedHere − MIN_LONERS_HIGH), CAST_CORE, CAST_HIGH)`. A non-finite `fedHere` reads as 0.
  - `lonersFor(areaId, tierStrays, fedHere = 0) -> number`: `tierStrays` exactly when `castFor(areaId)` is empty; otherwise `Math.max(0, tierStrays − clanCountFor(tierStrays, fedHere) − INTRUDER_SLOTS)`.
  - `clanHomeFor(areaId, edition, picks) -> boolean`: `edition !== 'legacy'` and `castFor(areaId).length > 0` and `picks` (an array) contains `areaId`.
  - `tagSubFor(member) -> string`: `` `${RANK_WORDS[member.rank]} of ${clanName(member.clan)}` ``.
- Names: kit `prefix + RANK_SUFFIX.kit`, apprentice `prefix + RANK_SUFFIX.apprentice`, leader `prefix + RANK_SUFFIX.leader`, warrior, deputy and elder `prefix + WARRIOR_SUFFIXES[i]` with `i = seedFromCode(`${clanId}|cast|${slot}`) % 14`, stepping `i` forward (mod 14) while the join doubles a letter (Peat + tail → Peatfur, say), the rule `CAT_PREFIXES` already keeps, or the name is in `DENIED_NAMES` (Mint + fur → Mintfur is a book name). Coat: from `CLAN_COATS`, never from the name (owner's decision 3).

- [ ] **Step 1: Write the failing tests**

In `test/clanwords.test.js`, import `CLAN_CAT_PREFIXES` and add:
- `CLAN_CAT_PREFIXES is frozen, sixteen distinct words per clan, distinct across clans`;
- `every clan cat word makes valid names at every rank`: for each word `w` and each `s` of `[...WARRIOR_SUFFIXES, RANK_SUFFIX.kit, RANK_SUFFIX.apprentice, RANK_SUFFIX.leader]`, `validPetName(w + s)` is true;
- `no clan cat wears a book name`: each word's fixed suffix for its slot (kit, paw or star) is not in `DENIED_NAMES`, and `DENIED_NAMES` holds `Rootpaw`, `Toadkit`, `Troutkit`, `Mintpaw` and `Mintfur` (the slot moves below exist because of them); Task 1's cast test checks every actual name;
- `no doubled join where it is fixed`: kit-slot words (slots 2, 3, 11, 12) don't end in `k`, apprentice-slot words (7, 8, 15) in `p`, leader words in `s` (the warrior suffix steps past a doubled join itself; Task 1's cast test checks the actual names);
- `no clan cat word is anyone else's word`: not in `PREFIXES`, `Object.values(CAT_PREFIXES)`, `Object.values(RIVAL_PREFIXES)`, `Object.values(HOMAGE_CHOICES).flat()`, `['Thorn', 'Hare', 'Kestrel', 'Eagle']` (the homage spares), or (lower-cased) `CAT_NAMES`, `KIT_NAMES`, `LEGENDARY_NAMES`; and the same CANON_CLAN_WORDS check the homage test uses.

`test/clancast.test.js`:

```js
test('each clan has sixteen cats, one per CAST_RANKS slot, named by rank', () => {
  for (const clan of ['woods', 'moor', 'river', 'pines']) {
    const cast = clanCast(clan);
    expect(cast.map((m) => m.rank)).toEqual([...CAST_RANKS]);
    expect(new Set(cast.map((m) => m.name)).size).toBe(CAST_HIGH);
    for (const m of cast) {
      expect(m.id).toBe(`${clan}-${m.slot}`);
      if (m.rank === RANK_KEYS.kit) expect(m.name.endsWith(RANK_SUFFIX.kit)).toBe(true);
      if (m.rank === RANK_KEYS.apprentice) expect(m.name.endsWith(RANK_SUFFIX.apprentice)).toBe(true);
      if (m.rank === RANK_KEYS.leader) expect(m.name.endsWith(RANK_SUFFIX.leader)).toBe(true);
      expect(isStrayName(m.name)).toBe(false); // never feedable, grudged or colony
      expect(CLAN_COATS[clan]).toContain(m.style); // the clan's own colours
      expect(m.breed).toBe(m.style.eyes);
      const word = CLAN_CAT_PREFIXES[clan][m.slot];
      expect(m.name.startsWith(word)).toBe(true);
      expect(m.name[word.length]).not.toBe(word.at(-1).toLowerCase()); // no doubled join
      expect(DENIED_NAMES.has(m.name)).toBe(false); // never a book name
    }
  }
});
test('the owner\'s words keep their places; only Root, Toad, Trout and Mint moved, to warrior slots', () => {
  const warriorSlots = (clan, w) => CAST_RANKS[CLAN_CAT_PREFIXES[clan].indexOf(w)] === RANK_KEYS.warrior;
  expect(warriorSlots('woods', 'Root')).toBe(true);
  expect(warriorSlots('pines', 'Toad')).toBe(true);
  expect(warriorSlots('river', 'Trout')).toBe(true);
  expect(warriorSlots('river', 'Mint')).toBe(true);
});
test('the first nine slots are the core clan, the same on every tier', () => {
  expect(CAST_RANKS.slice(0, CAST_CORE)).toEqual([RANK_KEYS.leader, RANK_KEYS.elder, RANK_KEYS.kit, RANK_KEYS.kit,
    RANK_KEYS.warrior, RANK_KEYS.warrior, RANK_KEYS.warrior, RANK_KEYS.apprentice, RANK_KEYS.apprentice]);
  for (const s of RAIDER_SLOTS) expect(s).toBeLessThan(CAST_CORE);
  expect(CAST_RANKS.filter((r) => r === RANK_KEYS.deputy)).toHaveLength(1);
});
test('each clan wears its own palette, and the palettes tell clans apart at a glance', () => {
  /* every CLAN_COATS row: base/belly/accent finite integers, scale 1, flags only from
     ['stripes','headStripes','patches','fluffy','whiteLegs','socks','chin'], `eyes` one of the six stray breeds;
     the four clans' mean base colours are pairwise ≥ 60 apart, and every coat's base is ≥ 40 from every
     coat of every other clan (RGB 0–255, Euclidean) */
});
test('the cast is fixed: the same every call', () => { expect(clanCast('woods')).toBe(clanCast('woods')); /* a fresh compute gives the same name and style per id */ });
test('no clan cat name is shared across clans', () => { /* the union of all four casts' names has 64 entries */ });
test('castFor needs a camp: woods, river and moor have one; truce places and old areas none', () => {
  for (const a of ['woods', 'river', 'moor']) expect(castFor(a).length).toBe(CAST_HIGH);
  for (const a of ['neighborhood', 'park', 'seaside', 'docks', 'den', 'island', 'gorge', '__proto__', 'constructor', undefined, 7]) expect(castFor(a)).toEqual([]);
});
test('unknown areas have no cast and keep today\'s strays', () => {
  for (const a of ['neighborhood', 'park', 'seaside', 'docks', 'den', 'island', '__proto__']) for (const n of [0, 14, 22]) for (const fed of [0, 9]) expect(lonersFor(a, n, fed)).toBe(n);
});
test('a territory with a camp trades strays for clan cats one for one', () => {
  expect(clanCountFor(22)).toBe(16);
  expect(lonersFor('woods', 22)).toBe(5);
  expect(clanCountFor(14)).toBe(9);
  expect(lonersFor('woods', 14)).toBe(4);
  expect(lonersFor('woods', 5)).toBe(0);
  for (const n of [14, 22]) for (const fed of [0, 3, 6, 12, 30]) {
    expect(lonersFor('river', n, fed) + clanCountFor(n, fed) + INTRUDER_SLOTS).toBe(n);
  }
});
test('fed cats beyond 5 take the extra clan slots, never the core', () => {
  expect(clanCountFor(22, 5)).toBe(16);
  expect(clanCountFor(22, 6)).toBe(15);
  expect(lonersFor('woods', 22, 8)).toBe(8);
  expect(clanCountFor(22, 12)).toBe(9);
  expect(clanCountFor(22, 40)).toBe(9);
  expect(clanCountFor(14, 12)).toBe(9); // LOW never drops below the core
  for (const bad of [NaN, -3, '7', undefined]) expect(clanCountFor(22, bad)).toBe(16);
});
test('clanHomeFor: your pick or your sibling\'s, Clan Edition only', () => {
  expect(clanHomeFor('woods', 'canon', ['woods'])).toBe(true);
  expect(clanHomeFor('woods', 'canon', ['moor', 'woods'])).toBe(true);
  expect(clanHomeFor('woods', 'canon', [])).toBe(false);
  expect(clanHomeFor('woods', 'legacy', ['woods'])).toBe(false);
  expect(clanHomeFor('park', 'canon', ['woods'])).toBe(false);
  expect(clanHomeFor('woods', 'canon', 'woods')).toBe(false); // not an array
});
test('tagSubFor names the rank and the clan', () => {
  const cast = clanCast('woods');
  expect(tagSubFor(cast[0])).toBe(`${RANK_WORDS.leader} of ${clanName('woods')}`);
  expect(tagSubFor(cast[9])).toBe(`${RANK_WORDS.deputy} of ${clanName('woods')}`);
});
test('clancast.js stays pure', () => { /* import specifiers ⊆ ['./clanhomes.js','./clanwords.js','./rivalclans.js','./rng.js','./straynames.js'] */ });
```

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/clanwords.test.js test/clancast.test.js`
Expected: FAIL. `CLAN_CAT_PREFIXES` is undefined and `src/clancast.js` isn't found.

- [ ] **Step 3: Add `CLAN_CAT_PREFIXES` to `src/clanwords.js`**

The values, in slot order (leader, elder, kit, kit, warrior ×3, apprentice ×2 | deputy, elder, kit, kit, warrior ×2, apprentice). The first nine of each list are the owner's 36 (decision 2); the last seven are the builder's picks for the busier HIGH camp. Within the owner's nine, Root, Toad, Trout and Mint sit in warrior slots and Glade, Slate, Shingle and Teal took their old places (review ruling: Rootpaw, Toadkit, Troutkit and Mintpaw are book names). Each list fits its land:

```js
woods: ['Badger', 'Bark', 'Bluejay', 'Burr', 'Conker', 'Fawn', 'Root', 'Glade', 'Bryony',
        'Thrush', 'Hollow', 'Nutmeg', 'Loam', 'Rook', 'Dormouse', 'Spindle'],
moor:  ['Curlew', 'Lapwing', 'Peat', 'Grouse', 'Cotton', 'Tor', 'Bilberry', 'Stoat', 'Pipit',
        'Cairn', 'Ling', 'Wisp', 'Snipe', 'Quill', 'Ridge', 'Whin'],
river: ['Minnow', 'Pike', 'Shingle', 'Newt', 'Vole', 'Trout', 'Mint', 'Dipper', 'Teal',
        'Caddis', 'Gudgeon', 'Mayfly', 'Silt', 'Roach', 'Wader', 'Marigold'],
pines: ['Cone', 'Bog', 'Slate', 'Resin', 'Needle', 'Beetle', 'Toad', 'Frog', 'Adder',
        'Sable', 'Mire', 'Gnat', 'Sloe', 'Fungus', 'Soot', 'Bat'],
```

Append `'Rootpaw', 'Toadkit', 'Troutkit', 'Mintpaw', 'Mintfur'` to `DENIED_NAMES` (in its RiverClan / "the rest" lines; a comment says why).

All 64 were checked on 2026-10-31 with a throwaway test: every word × every suffix passes `validPetName`, none contains a canon clan word, none is a `PREFIXES`, `CAT_PREFIXES`, `RIVAL_PREFIXES`, homage (or homage spare), stray, kit or legendary word, and the fixed-suffix slots have no doubled join. `CLAN_COATS` lives in `clancast.js` (colours aren't words); freeze every row. Freeze each list and the object. The header comment says: hand-picked, our own words; a word that fails a test is swapped for one that passes the same tests, never the rule weakened; once shipped, a value changes only if the 11-year-old asks, because nothing stores it. No gorge row yet: the Gorge adds one when its camp lands. Do not add these words to the scanner's `BORROWED` list.

The `DENIED_NAMES` list can't know every book name. Before committing, read the 64 words' kit, paw and star names once against a published character list (the builder's own check, as `DENIED_NAMES` was built); move any hit to a warrior slot within its own clan's list, as above, and add it to `DENIED_NAMES`.

- [ ] **Step 4: Implement `src/clancast.js`** with the interfaces above. Everything frozen; `clanCast` caches per clan in a `Map`; own-property reads only. A header comment says the cast is derived and never stored, draws from no shared stream, and why the slot order is fixed (Part 2's raiders are slots 4–6).

- [ ] **Step 5: Run them and check they pass**

Run: `npx vitest run test/clanwords.test.js test/clancast.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/clanwords.js src/clancast.js test/clanwords.test.js test/clancast.test.js
git commit -m "feat(clanlife): each territory's clan cast, named by rank

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The camp in the world, and where the clan stands

**Files:**
- Create: `src/world/camp.js`
- Modify: `src/clancast.js` (add `roamHomes`), `src/world/woods.js`, `src/world/river.js`, `src/world/moor.js` (one `addCamp` call each, just before `return`)
- Test: `test/camp.test.js` (new), `test/rivalworld.test.js` (extend), `test/woods.test.js`, `test/river.test.js`, `test/moor.test.js` (one case each)

**Interfaces:**
- Consumes: `DISCS` (rivalclans), `castFor` (Task 1), `isWalkableAt`, `CAT_RADIUS` (player.js, tests only).
- Produces:
  - `CAMP_TURN: Readonly<Record<ClanId, number>>` (radians), one hand-probed angle per camp.
  - `campLayout(areaId) -> { cx, cz, den: {x, z, r: 1.1, h: 0.9}, rock: {x, z, r: 0.6, h: 0.8}, seats: { leader: {x, z, y: 0.8}, deputy: {x, z}, elders: [{x, z}, {x, z}], kits: [{x, z} ×4] } } | null`. Pure, no THREE. `null` when `castFor(areaId)` is empty. Layout, with θ = `CAMP_TURN[areaId]` and `u(a) = (cos a, sin a)`:
    - den at centre + 2.0·u(θ); rock at centre + 2.2·u(θ + 2.3);
    - leader seat on the rock top (`y = rock.h`); deputy on the ground 1.0 m from the rock centre, towards the camp centre;
    - elders 1.5 m from the den centre, one at u(θ + 0.9) and one at u(θ − 0.9) from it (either side of the den);
    - kits in an arc in front of the den door (which faces the centre): centre + 1.4·u(θ + k) for k = −0.6, −0.2, 0.2, 0.6. Seats are in slot order: `elders[0]` and `kits[0..1]` are the core cats', so a LOW device fills the same seats a HIGH one does, minus the extras.
  - `addCamp(scene, area, areaId) -> void`: adds ONE `THREE.Group` as a direct child of the scene holding three meshes: the den mound, its doorway disc and the rock. `mergeStaticProps` merges only inside a top-level child (see its header), so this costs at most three main-pass draws plus their shadow draws (the doorway disc is `userData.noCast`), and the contact-shadow scan gives the camp one decal. It pushes `{ x, z, r }` colliders for both into `area.colliders`. A no-op when `campLayout` is `null`.
  - `roamHomes(areaId, area, isWalkable) -> {x, z}[]` in `clancast.js`: eight spots, for slots 4–8 then 13–15, in that order (so the first five are the same whether or not the extras are shown). Candidates are drawn from `mulberry32(seedFromCode(`${areaId}|roam`))` inside `bounds × 0.7`. A candidate is kept when it and 8 points on a 2 m circle round it are walkable (`isWalkable(x, z) === true`; any keep-out is the caller's to fold into `isWalkable`, so this module imports no `keepout.js`), it is ≥ `r + 3` from the camp centre, and ≥ 7 m from every spot already kept. At most 600 candidates. Deterministic for a given built map, so both devices agree.

- [ ] **Step 1: Write the failing tests**

`test/camp.test.js` (pure):
- `campLayout` is `null` for every non-camp area and the island; for woods, river and moor every piece is inside the disc by ≥ 1.5 m (`hypot(p - centre) + p.r ≤ r − 1.5`), every ground seat (deputy, elders, kits) is ≥ 0.6 m from the den and rock edges, and ground seats are pairwise ≥ 0.5 m apart;
- `addCamp` adds one group holding exactly three meshes (den, doorway, rock) and two colliders for a camp area, and nothing for `park`.

In `test/rivalworld.test.js` (which after pick-your-clan builds woods, river and moor in `BUILD`): add a `describe('the camp and the clan in the real territories')` over every `a` in `BUILD` with `castFor(a).length`:
- the den and rock colliders are in `built[a].colliders` and clear every OTHER collider (the camp tree included) by ≥ 0.4 m: `hypot ≥ c.r + other.r + 0.4`;
- every seat (`leader` excepted) is walkable with `isWalkableAt(built[a], x, z)`;
- the existing patrol-ring tests still pass with the camp colliders in (they run over the same `built`);
- `roamHomes(a, built[a], (x, z) => isWalkableAt(built[a], x, z))` returns exactly 8 spots, each with its 2 m circle walkable, each outside `r + 3` of the camp, pairwise ≥ 7 m apart;
- every roaming circle (radius 6 m, 16 samples) is checked for walkability: at least 12 of 16 points walkable (the wander skips the rest; see Task 3);
- nothing the player must reach (collectibles, scenics, golden mice, labelled perches) sits inside the den or rock collider.

In each of `test/woods.test.js`, `test/river.test.js`, `test/moor.test.js`: `build(...)` twice gives the same camp colliders (deterministic).

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/camp.test.js test/rivalworld.test.js`
Expected: FAIL. `src/world/camp.js` isn't found.

- [ ] **Step 3: Probe `CAMP_TURN` and implement**

Probe with a throwaway test (not committed): for each camp, step θ by 15° and keep the first θ whose layout passes every check above, preferring the den door facing the camp centre from the side away from the camp tree. Write the three angles into `CAMP_TURN` with a header comment naming each camp tree's position (woods (3.44, −45.4), river (7.62, 3.12), the Moor's from its Task 8 row) and the clearance measured. Then implement `campLayout`, `addCamp` and `roamHomes`. The den is a `SphereGeometry` half-dome (scaled y 0.8) in a bramble green with a small dark doorway disc on its centre-facing side; the rock a slightly squashed `DodecahedronGeometry` in the rock grey the territories already use. Reuse an existing material from `src/world/builder.js` where one matches.

- [ ] **Step 4: Wire it in** — call `addCamp(scene, area, '<id>')` at the end of `build` in `woods.js`, `river.js` and `moor.js`, before the returned object is built, so `mergeStaticProps` (walk.js) merges the meshes and every caller sees the colliders. World files read no edition or pick (pick-your-clan constraint).

- [ ] **Step 5: Run the territory tests**

Run: `npx vitest run test/camp.test.js test/rivalworld.test.js test/woods.test.js test/river.test.js test/moor.test.js test/clancast.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/world/camp.js src/clancast.js src/world/woods.js src/world/river.js src/world/moor.js test/camp.test.js test/rivalworld.test.js test/woods.test.js test/river.test.js test/moor.test.js
git commit -m "feat(clanlife): a den and a leader's rock at each camp, and where the clan stands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The clan in the walk

**Files:**
- Modify: `src/cat/model.js` (`opts.style`), `src/cat/coat.js` (`patch2`), `src/nametag.js` (the `sub` option)
- Create: `src/clancats.js`
- Modify: `src/game/walk.js`, `src/main.js`
- Test: `test/catmodel.test.js`, `test/catcoat.test.js`, `test/nametag.test.js`, `test/clancats.test.js` (new), `test/straycats.test.js` (one case), `test/walk.edition.test.js` (source pins). **`test/catgolden.test.js` and `test/fixtures/catgolden.json` must not change**: never run with `UPDATE_GOLDEN`.

**Interfaces:**
- Consumes: `castFor`, `clanCountFor`, `lonersFor`, `RANK_SCALE`, `tagSubFor`, `roamHomes`, `CLAN_COATS` (Tasks 1–2); `campLayout` (Task 2); `buildCat`, `animateCat`; `makeNameTag`; `mulberry32`, `seedFromCode`.
- Produces:
  - `buildCat(breed, accessories, { simple, style })`: with a `style` (a STYLE-shaped row), `const s = style ?? STYLE[breed]`; everything downstream (coat painting, points, paws, tail, markings, `g.scale` from `s.scale`) reads `s` unchanged, and `breed` still picks the eye colour. With a style, `STYLE[breed]` is never read. Without `style` every cat is byte-identical to today: the golden test and its fixture stay untouched, and no `userData` key is added when no style is given. `coatColor` is unchanged. This is the same seam the cat builder's spec puts `lookToStyle(look)` through, so the builder later only adds `look → style` in front of it.
  - `coatFromStyle(s)`: the second `patches` patch is `s.patch2 ?? 0x333333`, so the calico (no `patch2`) is unchanged and a clan tortoiseshell paints in its own palette.
  - `makeNameTag(name, { cross, legend, sub })`: with a non-empty `sub`, the canvas is taller (256×96) and the sprite's y scale grows by the same ratio (0.35 → 0.525), with `name` on the top line and `sub` below it at about 60% of the name's font size, both shrink-to-fit. `sub` is kept on the sprite's `userData` and `setNameTagMood` repaints both lines. Without `sub` the tag is pixel-identical to today's (test).
  - `createClanCats(scene, area, cast, { campLayout, roamHomes, isWalkable, roomSeed, showNames, reducedMotion, onBuddyEnd }) -> ClanCats`:
    - `cast` is the prefix the walk shows (`castFor(areaId).slice(0, clanCountFor(...))`). `list: ClanCat[]`, one per member, in slot order. `ClanCat = { id, name, rank, clan, slot, group, tag, home: Vector3, state, greeted: false, booped: false, patrolled: false, buddy: null }`.
    - Coat: `buildCat(member.breed, undefined, { simple: true, style: member.style })` — the clan's palette, never the name's breed.
    - Placement by slot: leader at `seats.leader` (group `y` = 0.8), deputy at `seats.deputy`, elders at `seats.elders[0]` (slot 1) and `[1]` (slot 10), kits at `seats.kits[0..1]` (slots 2–3) and `[2..3]` (slots 11–12), roamers at `roamHomes[i]` for slots 4–8 then 13–15. Facing: toward the camp centre for camp cats; for roamers a fixed angle from `seedFromCode(id)`. Nothing random at spawn.
    - Scale `RANK_SCALE[rank]` (the coat row's own `scale` is 1). Tag only when `showNames`: `makeNameTag(name, { sub: tagSubFor(member) })`, visible within `NAME_TAG_RANGE` as strays' tags are; the tag is counter-scaled by `1 / RANK_SCALE[rank]` so a kit's tag reads as big as a warrior's.
    - **Shadows (review ruling, lever 1):** every camp-seated cat (leader, deputy, elders, kits) gets `userData.noCast = true` on each of its meshes before walk.js's `assignShadowCasters` sweep (walk.js:1006), so they never draw into the shadow map. Roamers cast as strays do.
    - `nearest(pos, maxDist, { where } = {})` as `straycats.nearest`'s `where`.
    - `greet(cat, fromPos)`: faces `fromPos`, `requestPet` for 3 s, sets `greeted`. `boop(cat, fromPos)`: faces, `requestPet` 1.5 s, sets `booped`.
    - `update(dt, t, catPos)`: camp cats keep their posts (leader `requestPet`; deputy `follow` standing still, turning slowly to look out over the camp; elders `nap`; each kit hops to the neighbouring kit seat and back with a `pounce` pose every 2–4 s from its wander stream, or sits in `requestPet` with reduced motion). Roamers run a small idle/wander loop round `home`: targets 2–6 m away from the per-cat stream; a target or the next step that `isWalkable` rejects ends the leg (the cat idles); `follow` while moving at 1.2 m/s, `sniff`/`follow` idle. Leader, deputy, elders and kits never leave the camp.
    - `dispose()` removes every group.
  - `NO_CLAN_CATS = { list: [], nearest: () => null, greet() {}, boop() {}, update() {}, dispose() {} }` in walk.js.
  - `walk.js` (**`session` does not exist yet here**: it is a `const` built around line 1061, so everything below is a local, joined to the session object there):
    - just before the stray call: `const fedHere = colonyCats.length;` (the colony cats already read for this area: empty off a colony walk, so a non-partner co-walk gets 0 on both devices);
    - the stray call becomes `createStrayCats(scene, areaData, isDen ? 0 : lonersFor(areaId, tier.strays, fedHere), strayStream(roomSeed), { ...unchanged })`;
    - right after it, the map as built, frozen before anything is added to it: `const clanArea = { ...areaData, colliders: Object.freeze(areaData.colliders.map((c) => ({ ...c }))) };` and `const clanWalkable = (x, z) => isWalkableAt(clanArea, x, z);`. The live `areaData.colliders` later gains each device's own scratch posts (walk.js:949) and gate frames, which differ between devices; the clan must not see them, or co-walkers' cats would wander apart;
    - then `const clanCast = isDen ? [] : castFor(areaId).slice(0, clanCountFor(tier.strays, fedHere));` and `const clanCats = clanCast.length ? createClanCats(scene, areaData, clanCast, { campLayout: campLayout(areaId), roamHomes: roamHomes(areaId, clanArea, clanWalkable), isWalkable: clanWalkable, roomSeed, showNames: isClanEdition(state), reducedMotion, onBuddyEnd: (cat, reason, secs) => onClanBuddyEnd(cat, reason, secs) }) : NO_CLAN_CATS;` (`onClanBuddyEnd` is a `let` set in Task 6; until then a no-op);
    - `clanCats` joins the `session` object literal (around line 1061) as a shorthand property, beside `strayCats`;
    - in the decals block (around walk.js:988, `decals.follow(stray.group)`), every clan cat's group is followed too: `for (const c of clanCats.list) decals.follow(c.group);`;
    - `endWalk` calls `session.clanCats.dispose()` beside the strays' dispose.
  - `main.js`: `session.clanCats.update(wdt, t, session.cat.position)` right after `session.strayCats.update(...)`.

- [ ] **Step 1: Write the failing tests**

`test/catmodel.test.js`:
- `buildCat('tabby', undefined, { simple: true, style: CLAN_COATS.river[0] })` paints the torso's base vertex colours from the row, not the tabby's;
- **with a style, the breed's own row is never read**: `buildCat('not-a-breed', undefined, { simple: true, style: CLAN_COATS.woods[0] })` builds (default eyes), where without a style it would fail;
- every `CLAN_COATS` row builds without throwing in both `simple` and full mode;
- **mesh ceiling:** every `CLAN_COATS` row built `simple` has at most 25 meshes (the calico's count today; tabby, persian and black are 24, measured 2026-10-31), so no clan coat costs more draws than a stray;
- with no style, the built group's `userData` has exactly today's keys.

`test/catcoat.test.js`: `coatFromStyle` with `patches` and no `patch2` gives today's two patches (calico unchanged); with `patch2` the second patch takes it.

**The golden test (`test/catgolden.test.js`) runs unchanged and passes against the unchanged `test/fixtures/catgolden.json`.**

`test/nametag.test.js`: with the file's canvas stub, `makeNameTag('Thornfur', { sub: 'x of Y' })` uses a 256×96 canvas, paints two `fillText` calls with the sub's font smaller, and its sprite is taller in y; `setNameTagMood` on it repaints both lines; `makeNameTag('Thornfur')` paints exactly what it painted before (the same calls in the same order, 256×64).

`test/clancats.test.js` (headless THREE, as `test/straycats.test.js` sets up):

```js
test('the cast agrees across tiers as a prefix, and across editions exactly', () => {
  const pose = (c) => [c.id, c.group.position.x, c.group.position.z, c.group.rotation.y];
  const high = spawn({ count: 16, showNames: true, roomSeed: 42 });
  const low = spawn({ count: 9, showNames: true, roomSeed: 42 });
  const legacy = spawn({ count: 16, showNames: false, roomSeed: 42 });
  expect(high.list.slice(0, 9).map(pose)).toEqual(low.list.map(pose));
  expect(legacy.list.map(pose)).toEqual(high.list.map(pose));
  expect(legacy.list.every((c) => c.tag === null)).toBe(true); // Legacy: no tag at all
});
test('a clan reads as one family: every cat wears a row of its own clan\'s palette', () => {});
test('fed colony cats stay visible: 8 fed cats on HIGH give 8 loners and 13 clan cats', () => {
  /* through walk-level helpers: lonersFor('woods', 22, 8) === 8, castFor('woods').slice(0, clanCountFor(22, 8)).length === 13;
     createStrayCats with 8 colony cats and count 8 places all 8 at their spots */
});
test('co-walkers on one roomSeed stay in step for 60 s of wander', () => { /* two spawns, 1800 updates at 1/30: every position equal */ });
test('spawning draws nothing from Math.random when a roomSeed is given', () => { /* vi.spyOn(Math, 'random') not called */ });
test('camp cats keep their posts; roamers stay within 6.5 m of home and on walkable ground', () => { /* 120 s of update with a fake isWalkable that blocks x > 3 */ });
test('kits are small, the leader tall, and kits sit still under reduced motion', () => {});
test('tags read the same size on every rank (counter-scaled by 1 / RANK_SCALE)', () => {});
test('camp-seated cats are noCast; roamers are not', () => {});
test('the wander asks only the isWalkable it was given', () => { /* a later push to area.colliders changes nothing */ });
test('clancats.js imports nothing that stores progress', () => {
  /* import specifiers ⊆ ['three', './cat/model.js', './cat/animator.js', './nametag.js', './rng.js', './clancast.js'] */
});
```

`test/straycats.test.js`, one case: `'fewer strays from the same stream are a prefix of today\'s cast'`: with `strayStream(7)`, the first 5 strays of `count = 22` and all 5 of `count = 5` have equal names, positions, facings and personalities; the same for 12 against 22 and 4 against 14.

`test/walk.edition.test.js`, source pins:
- `createStrayCats(scene, areaData, isDen ? 0 : lonersFor(areaId, tier.strays, fedHere), strayStream(roomSeed)` is in the source;
- `castFor(areaId).slice(0, clanCountFor(tier.strays, fedHere))` is in the source, and `const fedHere = colonyCats.length;` comes before both;
- `showNames: isClanEdition(` is in the clan cats call;
- `lonersFor(` appears once, and `tier.strays` appears nowhere else in a `createStrayCats(` call;
- **no `session.clanCats =` assignment anywhere before `const session = {`**, and the session literal holds `clanCats,` (the harness stops inside the area build, so this source pin is what catches a `session` used before it exists);
- `roamHomes(areaId, clanArea, clanWalkable)` and `Object.freeze(areaData.colliders.map(` both come before `for (const p of playerMarks.posts) areaData.colliders.push(` (the scratch posts, walk.js:949);
- the decals block follows `clanCats.list`.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/catmodel.test.js test/catcoat.test.js test/nametag.test.js test/clancats.test.js test/straycats.test.js test/walk.edition.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the interfaces above. `clancats.js` builds each cat with `buildCat(member.breed, undefined, { simple: true, style: member.style })`: simple, as strays are built, in its clan's coat. Its header comment states: derived, never stored; its own per-cat streams (`(roomSeed ?? one Math.random base) + seedFromCode(id)`, XOR `CLAN_WANDER_SALT = 0xc1a9ca75`); never in the strays' list, so no feed, grudge or colony path can reach it. In walk.js, put a comment above the stray call explaining why the loner count is a prefix and can't shift any cast.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Check it in the app** (`npm run dev`): a Woods walk (HIGH) shows the leader on the rock, the deputy beside it, two elders napping, four kits hopping, eight cats about the woods with two-line tags, all in StormClan browns; the River's cats are grey-blue. On LOW: the core nine. Switch to Legacy and co-walk into the Woods from a second browser: the same cats and coats, no tags.

- [ ] **Step 6: The draw gate, now (not at Task 7).** On the iPhone 18: Settings → Performance readout, **HIGH, Auto off**. At the Woods, River **and** Moor camps, stand at the camp's edge with the whole camp in view, let it warm up, then take the **10-second average** of fps and draws; do the same at one roaming spot per map. Record all six readings beside each map's reading from its own build commit.
  - **What to expect.** A simple-built cat is 24 meshes (calico 25), and a cat at scale ≥ 0.72 is swept into the shadow pass like a stray, so before lever 1 the camp view would cost about **+290 draws** (the review's count). Lever 1 (camp-seated cats `noCast`, built above) takes their shadow draws away, leaving roughly **+190** (8 camp cats × 24) plus whoever wanders by, plus up to 3 for the camp props. A roaming spot should read within ±5 of before.
  - **Gate:** 60 fps held over the 10 s average at all three camps. If it fails, apply the next lever and read again, in this order (review ruling): (2) merge each static-pose cat (the leader, each napping elder) into one mesh after its first pose; (3) 2 kits instead of 4 on HIGH (`CAST_RANKS` loses slots 11–12, the freed 2 go to loners). If it still fails, stop and report with the numbers.
  - Put the readings in Step 7's commit body.

- [ ] **Step 7: Commit**

```bash
git add src/cat/model.js src/cat/coat.js src/nametag.js src/clancats.js src/game/walk.js src/main.js test/catmodel.test.js test/catcoat.test.js test/nametag.test.js test/clancats.test.js test/straycats.test.js test/walk.edition.test.js
git commit -m "feat(clanlife): the territory's clan lives there, in place of some strays

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The camp on the corner map and the territory map

**Files:**
- Modify: `src/ui/minimapmath.js`, `src/ui/minimap.js`, `src/main.js` (`mapFrame.camp`), `src/game/walk.js` (`session.campMarker`), `src/territories.js`, `src/ui/territorymap.js`, `src/style.css`
- Test: `test/minimapmath.test.js`, `test/minimap.test.js`, `test/territories.test.js`, `test/dressingroom.test.js`

**Interfaces:**
- Consumes: `campLayout`, `castFor`, `CLAN_COLOURS` (Tasks 1–2); `picksOf`, `clanName` (clanhomes); `isClanEdition`.
- Produces:
  - `mapMarkers(frame)` adds `{ kind: 'camp', x, z, color }` when `frame.camp` is set. It is pushed **first**, so every other marker draws over it.
  - `minimap.js` draws `camp` as a small dome with a dark door in `color` with a white outline, and pins it to the rim when off the map (the kid can always find the way back to camp).
  - `walk.js`: a local beside `clanCats` (Task 3), `const campMarker = !isDen && isClanEdition(state) && clanCast.length ? { x: cx, z: cz, color: CLAN_COLOURS[areaId] } : null` (centre from `campLayout`), joined to the `session` literal (around line 1061) as `campMarker,`; `main.js` sets `mapFrame.camp = session.campMarker`. Pin in `test/walk.edition.test.js`: no `session.campMarker =` before `const session = {`, and the literal holds `campMarker,`.
  - `CAMP_AT: Readonly<Record<ClanId, [number, number]>>` in `territories.js`, SVG board points inside each built region: woods `[575, 400]` (the north glade, facing the Moor), river `[244, 470]`; the Moor's point is read off its camp row the same way (its place in the region relative to the Moor map's centre). `territoryMapModel(state, catalog)` gives each region a `camp: { x, y, color, mine, ally } | null`: set only in Clan Edition, for a region whose `id` has a camp (`castFor(id).length`); `mine` when `state.clanPick.mine === id`; `ally` when the sibling's current pick (via `picksOf`) is `id` and it isn't `mine`.
  - `renderTerritoryMapHtml` draws, for a region with `camp`, `<g class="tm-camp[ mine][ ally]"><title>…</title>` + a small dome icon at `(x, y)` in `color`. `mine` adds a gold ring and a slightly larger icon; `ally` a thin white ring. The `<title>` reads `` `${clanName(id)} camp` ``. Camp icons sit inside the region's `<g>` but after its tap target, with `pointer-events: none`, so a tap still selects the place.

- [ ] **Step 1: Write the failing tests**
- `minimapmath`: `mapMarkers({ ..., camp: { x: 1, z: 2, color: '#000' } })[0]` is the camp; with `camp: null` no camp marker; the camp is pinned to the rim like the other off-map markers (`pinToRim`).
- `minimap`: painting a frame with a camp off the map draws at the rim (using the file's existing canvas spy).
- `territories`: Clan Edition with `clanPick.mine = 'woods'` gives the woods region `camp.mine === true` and the river region `camp.mine === false`; Legacy gives every region `camp: null`; the `pines` region has `camp: null` until its camp row exists (membership, not a whole list).
- `dressingroom`: the Where-to pill's map holds `tm-camp mine` in Clan Edition with a woods pick, and no `tm-camp` in Legacy.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/minimapmath.test.js test/minimap.test.js test/territories.test.js test/dressingroom.test.js test/walk.edition.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.** The `<title>` text and any class names must pass the borrowed-word scan: compose with `clanName`, and don't spell rank words.

- [ ] **Step 4: Run them and check they pass**, then the whole suite.

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/minimapmath.js src/ui/minimap.js src/main.js src/game/walk.js src/territories.js src/ui/territorymap.js src/style.css test/minimapmath.test.js test/minimap.test.js test/territories.test.js test/dressingroom.test.js test/walk.edition.test.js
git commit -m "feat(clanlife): camps marked on the corner map and the territory map

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Touch noses and boop; at home there is no hostile patrol

**Files:**
- Modify: `src/game/walk.js` (`clanHome`, the rival gate), `src/game/interactions.js`, `test/rivalcats.test.js` (the branch strip)
- Test: `test/interactions.test.js` (or `test/clanmates.test.js` beside it, using the same session fakes), `test/walk.edition.test.js`

**Interfaces:**
- Consumes: `clanHomeFor`, `clanName` (Task 1, clanhomes); `session.clanCats` (Task 3); `RANK_WORDS`.
- Produces:
  - `walk.js`: `const clanHome = clanHomeFor(areaId, progression.state.edition, picks);` on its own line directly after `const picks = picksOf(progression.state);` (so, outside the rival slice). `session.clanHome = clanHome; session.clanEdition = isClanEdition(state);`. The rival condition becomes `if (isDen || clanHome || !rivalForWalk(areaId, progression.state.edition, picks))`. A comment says: at home, your clan's camp has no hostile patrol; intruders take its place (owner's decision 2026-10-31, superseding pick-your-clan's D7 for the clan-life era).
  - `test/rivalcats.test.js` (the "chase branch writes nothing" test): the strip stays `rivalForWalk(areaId, progression.state.edition, picks)`; `clanHome` is a plain local and needs no strip.
  - **The clanmate prompt slot** in `updateInteractions`, directly after the v21 Stream 2 feed block and before the ghost block, only when `s.clanEdition` and `s.clanCats.list.length`. One scan for the nearest clan cat within `STRAY_PROMPT_RANGE` that still has an offer:
    - not `greeted` → `{ kind: 'clan-greet' }`, `` `E — touch noses with ${cat.name}` ``;
    - at home (`s.clanHome`), `greeted`, not `booped` → `{ kind: 'clan-boop' }`, `` `E — boop ${cat.name} 💕` ``;
    - at home, `booped`, not `patrolled`, `rank` is warrior or apprentice, no buddy active → `{ kind: 'clan-patrol' }` (Task 6 fills in the E branch; until then this offer is not produced).
  - `handleInteract`:
    - **Per-walk pay caps** (review ruling): `CLAN_PAY_CAP = { friend: 4, boop: 4, patrol: 2 }` in interactions.js, counted in `s.clanPaid = { friend: 0, boop: 0, patrol: 0 }` (set in walk.js's session literal). A verb past its cap still happens (pose, sound, toast); it just calls no `awardOnce`. The count goes up only when `awardOnce` actually paid (> 0).
    - `clan-greet`: `s.clanCats.greet(cat, s.cat.position)`, `audio.trill()`, and, under the cap, `log.awardOnce('friend', `clan-friend-${cat.id}`, `a nose touch with ${cat.name}`)`. No `recordGreet`, no colony call.
    - `clan-boop`: `s.clanCats.boop(cat, s.cat.position)`, `audio.purr()`, `hud.toast(`💕 boop with ${cat.name}!`)`, and, under the cap, `log.awardOnce('boop', `clan-boop-${cat.id}`, `a nose boop with ${cat.name} 💕`)`. It does **not** call `completeBoop` (that is the player-to-player handshake: it sends events and a server greet).
  - The stray feed scan already can't see clan cats (they aren't in `strayCats.strays`); no change there.

- [ ] **Step 1: Write the failing tests** (with the interactions test file's existing fake session, plus a fake `clanCats` holding two cats from `clanCast('woods')`):
- `away from home, a clanmate offers touch noses only`: `clanHome: false` → `clan-greet`; after greeting, no `clan-boop`.
- `at home: touch noses, then boop, each paying once per cat per walk`: two presses pay `friend` then `boop`, a third press pays nothing; `log.awardOnce` keys are `clan-friend-woods-4` and `clan-boop-woods-4`.
- `touch noses and boop pay for the first 4 cats a walk, then keep working without pay`: six clanmates greeted and booped → exactly 4 `friend` and 4 `boop` awards; the fifth and sixth still pose and purr.
- `Legacy: no clanmate prompt at all` (`clanEdition: false`).
- `a clan cat never gets the feed prompt`: a session with a colony and a clan cat in range, greeted: no `stray-feed` / `stray-wait`.
- `a stray standing nearer still gets its greet first` (the stray slot is above the clan slot; documents the order).
- `the clan branches touch no colony, recordGreet or grudge`: source slice of `handleInteract` from `'clan-greet'` to the next `} else if (s.prompt.kind ===` not in the clan family holds none of `colony`, `recordGreet`, `Grudge`, `completeBoop`, `sendEvent`.

`test/walk.edition.test.js`: the source has `const clanHome = clanHomeFor(areaId, progression.state.edition, picks);` before `The rival's border and its patrol`, and `if (isDen || clanHome || !rivalForWalk(`.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/interactions.test.js test/walk.edition.test.js test/rivalcats.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the interfaces above.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/walk.js src/game/interactions.js test/interactions.test.js test/walk.edition.test.js test/rivalcats.test.js
git commit -m "feat(clanlife): touch noses and boop with your clanmates; no hostile patrol at home

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Patrol together

**Files:**
- Modify: `src/clancats.js` (buddy follow), `src/discoveries.js` (`AWARDS.patrol`), `src/game/interactions.js` (prompt + E + mark echo), `src/game/netevents.js` (`clan-buddy`), `src/game/walk.js` (end at walk end)
- Test: `test/clancats.test.js`, `test/interactions.test.js`, `test/netevents.test.js`, `test/discoveries.test.js`, `test/progression.test.js`

**Interfaces:**
- Consumes: Tasks 1–5; `isTrespassing(areaId, x, z)` (the camp disc); `s.net.sendEvent`.
- Produces:
  - `AWARDS.patrol = 8`. Through `FEAT_TYPES`, `state.feats.patrol` is now a sanitised tally (test: a cloud payload `feats: { patrol: 3, __proto__: 1 }` loads as `{ patrol: 3 }`).
  - In `clancats.js`: `BUDDY_TIME = 60`, `PATROL_MIN = 30`, `BUDDY_GIVE_UP = 12`, `BUDDY_EDGE = 4`.
    - `startBuddy(cat, target: Object3D) -> boolean`: only a warrior or apprentice with no buddy; it walks beside `target` (1.2 m to its right, matching its speed up to 4 m/s, `follow` pose).
    - `endBuddy(cat) -> { seconds }`: it says goodbye (faces the target, `requestPet` 1.5 s) and walks back home.
    - `buddyEnded(cat, { areaId, bounds }) -> null | 'time' | 'camp' | 'edge' | 'far'`: checked in `update`; `'camp'` when the target is inside the camp disc, `'edge'` within `BUDDY_EDGE` of the bounds, `'far'` beyond `BUDDY_GIVE_UP`. `update` calls an `onBuddyEnd(cat, reason, seconds)` callback passed to `createClanCats`.
    - `markBeside(cat)`: plays `stretch` for 1 s where it stands (the paw-on-the-post look). Display only.
  - `interactions.js`:
    - `clan-patrol` prompt (Task 5's third offer), `` `E — patrol with ${cat.name}` ``; E calls `startBuddy(cat, s.cat)`, sets `cat.patrolled = true`, toasts `` `${cat.name} walks the border with you 🐾` `` and sends `{ v: 1, id: s.playerId, type: 'clan-buddy', catId: cat.id, on: true }`.
    - While a buddy is active, the prompt slot offers `` `E — say goodbye to ${cat.name}` `` (`clan-bye`) for that cat.
    - **How a buddy's end reaches `log` and `hud`:** `createInteractions` gains and returns `endClanPatrol(s, cat, reason, seconds)`, which closes over its own `log`, `hud` and `audio` like every other verb there. In walk.js, after `session` exists, Task 3's `onClanBuddyEnd` is set to `(cat, reason, secs) => interactions.endClanPatrol(session, cat, reason, secs)` (the clan cats only call it from `update`, which first runs after `session` is built). `endClanPatrol` toasts a goodbye line (`'time'`/`'camp'`/`'edge'`/bye: `` `${name} heads back to camp. Good patrol!` ``; `'far'`: `` `${name} couldn't keep up!` ``), pays `log.awardOnce('patrol', `patrol-${cat.id}`, `a patrol with ${name}`)` only when `seconds >= PATROL_MIN` and `s.clanPaid.patrol < 2`, and sends `clan-buddy` with `on: false`.
    - `leaveMark(s, mark)` gains one line: if a buddy is active, `markBeside(buddy)` and toast `` `${buddy.name} marks it too 🐾` ``. No save write, no award.
  - `netevents.js` `applyRemoteEvent`, `type === 'clan-buddy'`: the sender must be a remote in this walk; `catId` a string naming a cat in `s.clanCats.list` (found with `list.find`); `on: true` → `startBuddy(cat, remote.group)` (no prompt, no award, no toast); `on: false` → `endBuddy(cat)`. Anything else is ignored. A cat already following my own cat ignores a remote `on: true` (first one wins on each screen; at worst the two screens disagree about one cat for a minute, and nothing is paid on mine).
  - `endWalk`: no award for an unfinished patrol.

- [ ] **Step 1: Write the failing tests**
- `clancats`: a buddy follows a moving target within 2 m for 50 s; ends with `'time'` at 60 s; `'camp'` when the target steps into the disc; `'far'` when the target teleports 15 m; only warriors and apprentices can be buddies; `endBuddy` walks it home.
- `interactions`: at home after a boop, `clan-patrol` appears for a warrior and not for a kit, elder, the deputy or the leader (they keep the camp); E sends one `clan-buddy` `on: true`; an end after 35 s pays `patrol` once; an end after 10 s pays nothing; a second patrol with the same cat isn't offered that walk; a third full patrol with another cat pays nothing (cap 2); `endClanPatrol` is returned by `createInteractions` and walk.js's `onClanBuddyEnd` calls it (source pin); scratching a mark with a buddy toasts the echo and calls no `progression.` method beyond the mark's own.
- `netevents`: a valid `clan-buddy` from a remote starts the buddy on that remote's group; an unknown `catId`, `'__proto__'`, a non-remote sender or a missing `clanCats` is a no-op; nothing awards.
- `discoveries`: `AWARDS.patrol === 8`. `progression`: the feats sanitising case above.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/clancats.test.js test/interactions.test.js test/netevents.test.js test/discoveries.test.js test/progression.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the interfaces above.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/clancats.js src/discoveries.js src/game/interactions.js src/game/netevents.js src/game/walk.js test/clancats.test.js test/interactions.test.js test/netevents.test.js test/discoveries.test.js test/progression.test.js
git commit -m "feat(clanlife): patrol the border with a warrior or apprentice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Live check, draw reading and the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-10-31-clan-life-design.md` (the readings, under its 2026-10-31 answers note)

- [ ] **Step 1: Two browsers, one co-walk** (`npm run dev`; two profiles paired as siblings, picks StormClan and BrookClan):
  - Walk the Woods together, both on HIGH. Both screens show the same 16 clan cats in the same places, in StormClan browns, and the same loners. Then one device on LOW: it shows the core 9 in the same places. Both kids get boop and patrol offers (the Woods is home to one and ally land to the other). No patrol circles the camp.
  - Start a patrol on one screen: on the other, that warrior walks beside the sister's cat.
  - Flip one device to Legacy and repeat: the same cats, no tags, no prompts, no camp marker.
  - Walk the Moor (nobody's clan): touch noses only; GaleClan's patrol chases you off the camp.
  - The corner map shows the camp (pinned to the rim when far); the territory map shows each camp, yours ringed in gold.
- [ ] **Step 2: iPhone 18 draw reading, again, with the verbs in.** The same protocol as Task 3 Step 6: HIGH, Auto off, 10 s average after warm-up, draws recorded, at the **Woods, River and Moor** camps and one roaming spot each, this time with a patrol buddy walking beside you once. Compare with Task 3's readings; the same gate (60 fps) and the same lever order apply. If a lever beyond the ones already applied is needed, stop and report.
- [ ] **Step 3: Update the spec:** under its "Owner's answers (2026-10-31)" note, add one line with the camp-view and roaming draw readings and the fps.
- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Commit** (readings in the body)

```bash
git add docs/superpowers/specs/2026-10-31-clan-life-design.md
git commit -m "docs(clanlife): Part 1 live check and draw readings

Woods camp view: <draws> draws, <fps> fps (was <draws>, <fps>)
River camp view: <draws> draws, <fps> fps (was <draws>, <fps>)
Moor camp view: <draws> draws, <fps> fps (was <draws>, <fps>)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Later territories (recipe, nothing to build now)

The Pines (and later the Gorge) get clan life by:
1. its `DISCS` row (pick-your-clan Task 8's recipe);
2. a `CLAN_CAT_PREFIXES` row (16 words) and a `CLAN_COATS` palette if it has none (the Pines has both; the Gorge's CliffClan needs both);
3. a `CAMP_TURN` angle probed as in Task 2, and an `addCamp` call in its `build`;
4. its `CAMP_AT` point on the territory map;
5. a `rivalworld` `BUILD` entry, so Task 2's checks run on it. **The Pines' spots, roaming circles and camp must also clear the island keep-out** (`keepOutPoint`), and the camp must stay off the truce path to the bridge.

## Overlaps

- **Pick your clan:** this plan edits `walk.js` lines it added (the picks line stays; `clanHome` goes on the next line) and `test/rivalcats.test.js`'s strip (unchanged call). It adds no field to `clanPick`.
- **Kittypets:** its walk.js hunk is the `excludeNames`/extras block and a toast after `hud.setArea`. This plan changes only the `count` argument of the stray call and adds lines after it; the merge is adjacent at worst. Kittypet names stay out of the loners via its `territoryCastExcludes`; clan cat names are never stray names, so they need no exclusion.
- **Island:** `roamHomes` and the clan wander only ever ask the `isWalkable` they're given; walk.js folds `keepOutPoint` (or whatever the island plan ships) into it for an area with `keepOut`. Today no built territory has one.
