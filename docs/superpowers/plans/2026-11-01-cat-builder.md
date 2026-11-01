# Make Your Own Cat (the cat builder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each kid can make up to three cats of their own (coat, markings, pattern, fur, eyes, size, a name and one of the six personalities), walk them, dress them in the dressing room, change them any time, and show them to the other kid on a co-walk.

**Architecture:** One new DOM-free module, `src/customcats.js`, holds the palette, the sanitisers, `lookToStyle` and `activeCat`. A custom cat is drawn through `buildCat`'s existing `opts.style` seam (Clan Life Part 1 added it) and plays as one of six preset rows, unchanged, because the walk builds it with the preset's breed. The save gains two additive fields (`customCats`, `equipped.custom`). The wire gains one optional key, `accessories.look`, inside the profile object older builds already ignore. The builder is a pure model and renderer (`src/ui/catbuilder.js`) driven by the existing dressing-room controller, on the one WebGL stage.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4, plain ES modules and DOM. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-cat-builder-design.md` (with "Owner's answers (2026-10-31)" and "Fixes from the builder check", commit 1104fa2). The sketch the kids saw: https://claude.ai/artifact/VExoqvvRPUgVSwdYSEF1Lt (its rows, row order, size slider, "Done, now dress it up →" button and placeholder swatches).

Built from main at 92a4d1b (the new cat body, Clan Edition, clan picks, clan cast, kittypets, swimming and co-walks are all merged).

## Global Constraints

- **SAVE_VERSION stays 4.** Two additive fields only, `state.customCats` and `state.equipped.custom`, each sanitised on its own with defaults.
- **`equipped.cat` is always a ready-made cat id**, never a custom id. Every existing reader keeps working, and `sanitizeState`'s "equipped cat must be unlocked" rule stands.
- **A custom cat is never stronger than a ready-made one.** Its numbers are one of six `PERSONALITIES` rows, unchanged: keenNose → `tabby`, chaser → `siamese`, napper → `persian`, fearless → `black`, pouncer → `calico`, steady → `mainecoon`. Family rows (Zeetoo, Robbie, D2, Digit, Hagrid) can never be picked.
- **All six personalities are open from the start** (owner). No locked state, no buy path.
- **Up to 3 custom cats per kid. No delete, no removal API, no id reuse, no confirm UI** (owner). Ids are `'mine1'`, `'mine2'`, `'mine3'`, handed out in that order.
- **Her brother sees her usual pet name** (owner). `petName` on the room profile, the cloud profile (`pet_name`), ghosts, the friend list, the walk log, reply seeds and the roster never changes when she switches cats. The custom cat's name shows only on her own screen: the builder, the dressing-room hero and strip, the visit celebration, **the name tag over her own cat on her walks**, and her pouncer perk toast (owner, 2026-11-01). Nothing carries it to another player (it travels only inside her own cloud save).
- **Names use `validPetName` (`src/net.js`)**: 2–16 characters, starts with a letter, letters/spaces/hyphens only, no `NAME_BLOCKLIST` substring. The hint is the pet-name sheet's exact words: `Pet names are 2–16 letters, spaces, or hyphens.`
- **Mesh ceilings for every custom pattern × fur:** 31 full, 25 `simple` (the body patterns are painted, so the spec's 33/27 dropped to 31/25 after the cat body). Triangles: 8000 full, 5500 simple. Colours never change the count.
- **Ready-made cats stay byte-identical.** `test/fixtures/catgolden.json` and `test/fixtures/hagrid-golden.json` must keep passing **unchanged**. Never run `UPDATE_GOLDEN=1` in this plan (it rewrites `catgolden.json`). `catpose-baseline.json` and `accessory-mesh-delta.json` are untouched too.
- **No server change.** Nothing new in Supabase tables or functions; `accessories` is already free-form jsonb.
- **Both editions get the same builder, save and wire.** `src/edition.js` is not touched. No borrowed word (`test/clanwords.test.js` scan) appears in builder copy; the star-name picker stays on the pet-name sheet.
- **Never a second WebGL canvas** for the builder: it reuses the dressing room's `createCatStage`.
- **Strays, colony cats, clan cats, rivals, den cats, intruders and Mochi never use custom looks.** No family-cat coat flags (`cow`, `whiteLegs`, `band`, `ears`, `legLen`, `body`, `tagCollar`) and no chicken.
- **Accessories belong to the kid, not to a cat** (`state.equipped` holds one outfit). Making, editing or switching cats never touches an accessory slot.
- **Copy (exact):** row titles `Coat colour`, `Markings colour`, `Pattern`, `Fur`, `Eyes`, `Size`, `Personality`, `Name`; tile `＋ Make a cat`; full tile `3 of 3 — change one of yours for a new look`; hero button `✏️ Change my cat`; `Done, now dress it up →`; `✕ Not now`; `Leave without saving?`; markings notes `Solid cats have no markings` and `Socks are always white`.
- Test command (from the worktree root): `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`. `src/ui/homebase.js` cannot be imported by tests (module-scope `document`); keep logic out of it.
- Commit each task with an explicit `git add <files>`; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never merge or push.

## Rulings on the builder-check problems (and others found while planning)

1. **Golden fingerprints for the presets: already in place; reuse, never regenerate.** The cat body build added `test/catgolden.test.js` with `fingerprintCat` goldens for every preset (`full`, `simple`, `dressed`) and the write-once Hagrid file. Task 2 changes `model.js` and must leave both files passing unchanged. Custom looks get a determinism test (same look twice → equal `fingerprintCat`, across every pattern × fur and every swatch), **not** a golden file, because the swatch hexes are still to be tuned with her on the iPhone (spec §6).
2. **Other direct readers of `equipped.cat`:** `src/ui/dressingroom.js` (selected portrait and hero) is rewritten in Task 8 to know about `equipped.custom`. `walk.js` (build at line 503, pace at line 516) and `rooms.js` (lines 69 and 102) switch to `activeCat` (Tasks 4, 5). **The retired-cat farewell keeps reading `equipped.cat`, by design:** the farewell names the preset that takes over from Rosa. A save that still owes Rosa's farewell predates the builder, so it cannot have custom cats; for a hand-made save that has both, `adopt` clears `equipped.custom` when it queues a farewell, so the line ("…Tabby will walk with you today") is true. A source-scan test (Task 4) pins the list: outside `progression.js`, `customcats.js` and `ui/dressingroom.js`, nothing in `src/` reads `equipped.cat`.
3. **`sanitizeState` rebuilds `equipped`:** Task 3 adds `custom` to that rebuild explicitly (it survives only if it names a cat that survived), adds `customCats: sanitizeCustomCats(parsed.customCats)`, and adds `customCats: []` to `defaultState()` and `custom: null` to `defaultState().equipped`. The four `toEqual` expectations of `equipped` in `test/progression.test.js` (lines 33, 703, 722, 923) gain `custom: null`, and the full-state `toEqual` after `replaceFromPayload({ version: 3 })` (line 651) gains `customCats: []` and `custom: null` in its `equipped` (line 655); `test/editions.invariants.test.js`'s top-level key list gains `'customCats'`. Hostile input is clamped: own-property reads only (`Object.hasOwn`), at most the first 32 raw entries scanned, at most 3 kept.
4. **Cloud restore is manual-only** (`src/game/cloudsync.js`: Load from cloud → preview → confirm). What that means for custom cats:
   - Custom cats ride every automatic push (`runSync` clones `progression.state`), so the cloud copy has them with no code change.
   - Nothing ever pulls them back automatically. A restore happens only when a kid taps Load from cloud and confirms.
   - `replaceFromPayload`: a payload with **no own `customCats` key** was written by an older build, so this phone's custom cats are kept (the restored save's own cat choice stands: `equipped.custom` comes back `null`). A payload with the key is a normal restore and replaces them, even with `[]`.
   - **What is not covered:** a stale build running on the phone itself (the service worker can briefly serve one) loads and rewrites `localStorage` without the fields, and its next automatic push can overwrite the cloud copy. That is the same risk `colony` and `edition` accept. The plan does not try to fix it; the owner keeps both phones updated.
5. **`opts.look` vs `opts.style`:** `buildCat` gains `opts.look`; it is sugar for `opts.style = lookToStyle(opts.look)` when no style is given. Every caller passes the look, so the wire, the stage and the walk share one conversion.
6. **The eye colour field is `eyeColor` (a hex), not `eyes`:** `CLAN_COATS` rows already use `eyes` to name the preset whose eye colour they borrow (`buildCat(row.eyes, …, { style: row })`). `buildCat` reads `s.eyeColor ?? EYE_COLORS[breed] ?? 0x4e9440`.
7. **The bib is free:** `coat.js` already paints the chest `WHITE_FUR` when a row sets `bib: true` (no preset sets it today). White socks = `socks` + `chin` + `bib`. Patches = `patches` + `patch2: accent` (body, painted) + a new `headPatch` colour (the skull patch, default `0xd88030` so the Calico is unchanged).
8. **Re-tracking the room profile:** `net.js` gains `updateProfile(profile)` (Supabase: `channel.track(profile)` again; fake hub: replace and re-broadcast the roster). The dressing room calls `rooms.retrackProfile()` after Done and after any cat or accessory change while a room is open, which also fixes today's gap where a cat changed in a room was only seen at the next join.
9. **Thumbnails:** custom portraits are snapped by `customThumbnails(entries)` in `src/thumbnails.js`: one throwaway WebGL context per batch (released with `forceContextLoss`, as `menuThumbnails` does), cached in memory by `lookKey`, never saved. On failure the tile shows a coat-coloured circle with the name's first letter. The stage's WebGL fallback image for a custom cat is its preset's thumbnail (already true: `placeFallback` reads `thumbs.cats[breed]`).
10. **The builder hides the Start dock** while open. If a room partner starts a walk mid-build, `clearPreview()` (already called on hide and before Start) also closes the builder: a new cat is not saved, an edit keeps the old version.
11. **The builder stage always shows the cat bare** (new and edit), so the coat is easy to see; Done returns to the Wearing panel with the outfit on.
12. **The pouncer perk line (owner, 2026-11-01):** every ready-made cat keeps its line exactly (`a Calico masterclass`, Robbie included). Only a custom pouncer changes, and it uses her cat's own name: `Ember's masterclass` (toast: "You spotted Ember's masterclass"; the name is shown exactly as she typed it, lower-case first letter included). It reads well because `validPetName` allows only letters, spaces and hyphens; a name that fails it (impossible after the save is sanitised, but the helper is total) reads `a pouncer's masterclass`. `cat.userData.custom` tells a custom pouncer from the Calico (both have `userData.breed === 'calico'`); the name is on `cat.userData.customName`. The toast is local (`hud.js` writes it with `textContent`), never sent.
13. **A look on the wire that is not a plain object** (a string, an array) means the plain preset, the same as a missing look. A plain object is repaired field by field. Both co-walkers run the same `wireLook`, so they agree.
14. **Her own walk tag (owner, 2026-11-01):** while she walks a custom cat, her own cat wears a plain one-line name tag with that cat's name, always visible, on her screen only. It is the existing `makeNameTag(name)` with no options (no rank sub-label, no cross mood, no star), hung on her cat at the standard `TAG_Y` like a co-walker's tag. A ready-made cat still wears no tag (unchanged). The name comes from `ownTagName(state)`: the active custom cat's name, re-checked with `validPetName` and clamped to 16 characters, else `FALLBACK_NAME`. Canvas text is drawn with `fillText`, so nothing is parsed as HTML, and `paintTag` already shrinks long names to fit the pill (floor 24 px). In Clan Edition nothing changes about it: the rank sub-label is only for the clan cast (`clancats.js`), and the borrowed-word scan reads `src/` literals, not kid-typed names, so a name like "Warrior" in her save trips nothing. The tag is a child of her cat, so it scales with her cat's size and sways with the swim shake, as a co-walker's tag does. It also appears in her album photos (`snapPhoto` renders the chase frame), exactly as a co-walker's tag does today: her own data, seen by no one else, and her cat's name in her album is a feature.
15. **What a co-walker sees over her cat: her usual pet name, unchanged.** The wire does not carry the custom name, and this plan keeps it that way: the owner's first answer put her pet name on everything that leaves her phone; `petName` is also the cloud `pet_name` (ghosts, friend list, walk log, reply seeds), so reusing it would change all of those; and an older-build partner already shows `petName`, so both builds agree. Adding a second name field would be wire growth for no owner-requested benefit.

## Review Focus

1. **A kid making a cat in under a minute on a phone.** The defaults are a complete cat (ginger tabby, chocolate markings, green eyes, size 1.0, Keen nose); only the name is missing. Typing a valid name enables Done at once, without a re-render that would drop the keyboard. Test: Task 8, "typing a valid name enables Done without a render".
2. **Phone-first touch.** Every choice is a real `<button>` with `aria-pressed` (swatches also carry `aria-label`), at least 44 px; the stage stays visible above the rows; a colony poll re-rendering mid-typing keeps the draft name and the focus. Tests: Task 7 "every choice is a button with aria-pressed", Task 8 "a re-render keeps the draft name"; the 44 px and sticky stage are checked in Task 9 at 390×844.
3. **Co-walk agreement.** Two new builds given the same streamed profile draw byte-identical cats; an older build draws the mapped preset in the same outfit, labelled with her pet name; a junk or newer-build look never throws. Tests: Task 5, "two receivers agree", "an old build ignores look", "a junk look falls back".
4. **Malformed saves and cloud payloads.** Junk, 4+ cats, duplicate ids, prototype tricks, huge arrays, a bad field repaired rather than the cat dropped, a dangling `equipped.custom`, an older-build cloud payload. Tests: Task 1 (sanitisers), Task 3 (load and `replaceFromPayload`).
5. **Legacy vs Clan wording.** The builder renders byte-identically in both editions and contains no borrowed word. Test: Task 7, "the builder is the same in both editions".

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/customcats.js` | Create | Palette tables, personality→preset map, `sanitizeLook`, `sanitizeCustomCats`, `lookToStyle`, `lookKey`, `activeCat`, `wireLook`, `catProfileFields`, `ownTagName` (Task 4). DOM-free, no THREE. |
| `src/cat/model.js` | Modify | `opts.look`, `eyeColor`, `headPatch`, `tailFluff`; `coatColor(breed, look)`. |
| `src/progression.js` | Modify | Save fields, `createCustomCat`, `updateCustomCat`, `equipCustom`, `equipCat` clears custom, `replaceFromPayload`, farewell guard. |
| `src/game/walk.js`, `src/game/avatar.js` | Modify | Build and pace from `activeCat`; `userData.custom`/`customName`; her own name tag; the masterclass line. |
| `src/game/rooms.js`, `src/net.js` | Modify | Profiles from `catProfileFields`; `updateProfile` / `retrackProfile`. |
| `src/remotecats.js`, `src/ghosts.js`, `src/main.js` | Modify | Receive and draw `look`; map dot colour. |
| `src/ui/catstage.js`, `src/thumbnails.js` | Modify | `show(breed, accessories, look)`; `customThumbnails`. |
| `src/ui/catbuilder.js` | Create | Builder draft reducer, model and HTML. DOM-free. |
| `src/ui/dressingroom.js`, `src/ui/dressingroomview.js` | Modify | Her cats in the strip, ＋ tile, custom hero, builder mode, clicks and inputs. |
| `src/ui/homebase.js`, `src/style.css` | Modify | Input/focus wiring, celebration name, retrack hook; builder layout. |
| `test/customcats.test.js`, `test/catcustom.test.js`, `test/progression.customcats.test.js`, `test/catbuilder.test.js` | Create | New tests. |
| `test/progression.test.js`, `test/editions.invariants.test.js`, `test/remotecats.test.js`, `test/ghosts.test.js`, `test/net.test.js`, `test/rooms.test.js`, `test/catstage.test.js`, `test/dressingroom.test.js`, `test/dressingroomcontroller.test.js` | Modify | Additive expectations and new cases. |

## Overlap with `.worktrees/clan-life-2` (being built in parallel; do not touch it)

- `src/game/walk.js`: it adds intruders and the clan fight near lines 87 and 1273 and 1828; this plan changes lines 503–516. Different hunks. Its `playerSpecial: PERSONALITIES[cat.userData.breed]?.special` works for a custom cat unchanged (the mapped preset's special).
- `src/game/avatar.js`: it edits `speedFactor`, the gait speed, idle and pose hunks (lines 72–190); this plan edits only the masterclass line (289).
- `src/cat/animator.js`: it adds the `swipe` and `backUp` poses. This plan does not touch the animator; a custom cat animates through the same rig, so it gets those poses for free. **After both land**, add one assertion to `test/animator.test.js`: a long-haired, patched custom cat (`buildCat('calico', undefined, { look })`) runs `swipe` and `backUp` without throwing and keeps its paws out of the ground, like the presets.
- `src/main.js`: it edits hunks around 554, 605, 706 and 756; this plan edits 901 (the map dot). Its walk.js hunks also include 1539 and 1724. Its `intruders.js` builds rivals through `opts.style`, unaffected by `opts.look`, and adds no `equipped.cat` reader, so the Task 4 scan stays green after both merge.
- `src/ui/homebase.js`: it changes the journal sheet line (around 795); this plan changes the dressing room, celebration and input listener. `src/style.css`: both append; expect a trivial end-of-file conflict, keep both blocks.

---

### Task 1: The palette and the sanitisers (`src/customcats.js`)

**Files:**
- Create: `src/customcats.js`
- Test: `test/customcats.test.js`

**Interfaces:**
- Consumes: `validPetName(name) → bool` from `src/net.js`; `PERSONALITIES` from `src/cat/brain.js` (own-key check for a preset breed).
- Produces (all exported):
  - `CUSTOM_IDS = ['mine1','mine2','mine3']` (frozen), `CUSTOM_MAX = 3`, `FALLBACK_NAME = 'My Cat'`, `DEFAULT_PERSONALITY = 'keenNose'`.
  - `COATS`, `MARKS`, `EYES`: frozen `{ id: { hex, label } }` (`COATS` entries also `belly`), in display order.
  - `PATTERNS = [['solid','Solid'],['stripes','Tabby stripes'],['points','Pointed'],['patches','Patches'],['socks','White socks']]`, `FURS = [['short','Short'],['fluffy','Fluffy'],['long','Long-haired']]`, `PERSONALITY_CHOICES = [['keenNose','Keen nose'],['chaser','Chaser'],['pouncer','Pouncer'],['napper','Napper'],['fearless','Fearless'],['steady','Steady']]` (all frozen).
  - `CUSTOM_PERSONALITIES = { keenNose:'tabby', chaser:'siamese', napper:'persian', fearless:'black', pouncer:'calico', steady:'mainecoon' }` (frozen).
  - `SIZE = { MIN: 0.85, MAX: 1.15, STEP: 0.05 }`, `TAIL_FLUFF = 1.3`.
  - `DEFAULT_LOOK = { coat:'ginger', marks:'chocolate', pattern:'stripes', fur:'short', eyes:'green', size:1 }` (frozen).
  - `type Look = { coat, marks, pattern, fur, eyes, size }`; `type CustomCat = { id, name, personality, look }`.
  - `sanitizeLook(raw: any) → Look` (always a fresh, complete, valid look).
  - `sanitizeCustomCats(raw: any) → CustomCat[]` (0–3 entries).
  - `presetFor(personality: string) → string` (mapped breed; unknown → `'tabby'`).
  - `lookToStyle(look: any) → StyleRow` (frozen; sanitises first).
  - `lookKey(look: any) → string` (`JSON.stringify` of the sanitised look, fields in `DEFAULT_LOOK` order).
  - `activeCat(state) → { breed: string, look: Look|null, name: string, custom: string|null }`.
  - `wireLook(accessories: any) → Look|null`.
  - `catProfileFields(state) → { breed: string, accessories: { collar, head, face, neck, body, back, feet, look? } }`.

The palette (hexes from the spec and the sketch; final values are tuned with her in Task 9):

| table | id → hex (belly) | label |
|---|---|---|
| COATS | ginger `0xc8743a` (`0xeac39a`), black `0x2a2a30` (`0x3a3a42`), cream `0xf0ead8` (`0xf8f4e8`), brown `0x9c7a4f` (`0xd8c39a`), silver `0xcfcfd4` (`0xe8e8ec`), seal `0xe8dcc8` (`0xf2ead9`), bluegrey `0x6b6f7a` (`0xa9adb6`), apricot `0xe3a86b` (`0xf4d4ac`) | Ginger, Black, Cream, Brown tabby, Silver, Seal cream, Blue-grey, Apricot |
| MARKS | chocolate `0x7a3f1c`, black `0x1c1c22`, white `0xf8f4e8`, seal `0x4a3b32`, orange `0xd88030`, grey `0x8a8f9a` | Chocolate, Black, White, Seal, Orange, Grey |
| EYES | green `0x4e9440`, gold `0xd8b830`, blue `0x68a8d8`, copper `0xc97a2a` | Green, Gold, Blue, Copper |

`lookToStyle` builds `{ base: COATS[coat].hex, belly: COATS[coat].belly, accent: MARKS[marks].hex, scale: size, eyeColor: EYES[eyes].hex }` plus:

| pattern / fur | flags |
|---|---|
| solid | none |
| stripes | `stripes: true, headStripes: true` |
| points | `points: true` |
| patches | `patches: true, patch2: accent, headPatch: accent` |
| socks | `socks: true, chin: true, bib: true` |
| short | none |
| fluffy | `fluffy: true` |
| long | `fluffy: true, tufts: true, tailFluff: TAIL_FLUFF` |

- [ ] **Step 1: Write the failing tests** in `test/customcats.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { sanitizeLook, sanitizeCustomCats, lookToStyle, lookKey, activeCat, wireLook, catProfileFields, presetFor,
  DEFAULT_LOOK, CUSTOM_PERSONALITIES, COATS, MARKS, EYES, PATTERNS, FURS, SIZE } from '../src/customcats.js';
import { PERSONALITIES } from '../src/cat/brain.js';

const cat = (over = {}) => ({ id: 'mine1', name: 'Ember', personality: 'keenNose', look: { ...DEFAULT_LOOK }, ...over });

describe('sanitizeLook', () => {
  it('junk becomes the default look', () => {
    for (const junk of [null, 'x', 5, [], undefined]) expect(sanitizeLook(junk)).toEqual(DEFAULT_LOOK);
  });
  it('repairs each bad field on its own', () => {
    expect(sanitizeLook({ ...DEFAULT_LOOK, coat: 'plaid', eyes: 'blue' })).toEqual({ ...DEFAULT_LOOK, eyes: 'blue' });
    expect(sanitizeLook({ ...DEFAULT_LOOK, coat: 'toString', marks: '__proto__' })).toEqual(DEFAULT_LOOK);
  });
  it('clamps and snaps size', () => {
    expect(sanitizeLook({ size: 9 }).size).toBe(1.15);
    expect(sanitizeLook({ size: -1 }).size).toBe(0.85);
    expect(sanitizeLook({ size: 0.93 }).size).toBe(0.95);
    for (const s of [NaN, '1.1', Infinity, null]) expect(sanitizeLook({ size: s }).size).toBe(1);
  });
  it('ignores inherited fields', () => {
    expect(sanitizeLook(Object.create({ coat: 'black' })).coat).toBe('ginger');
  });
});

describe('sanitizeCustomCats', () => {
  it('junk becomes []', () => {
    for (const junk of [null, 'x', {}, 7]) expect(sanitizeCustomCats(junk)).toEqual([]);
    expect(sanitizeCustomCats([null, 5, 'a', []])).toEqual([]);
  });
  it('keeps at most three, in order', () => {
    const many = ['mine1', 'mine2', 'mine3'].map((id) => cat({ id }));
    expect(sanitizeCustomCats([...many, cat({ id: 'mine1', name: 'Extra' })]).map((c) => c.id)).toEqual(['mine1', 'mine2', 'mine3']);
  });
  it('drops duplicate and unknown ids, keeping the first', () => {
    const out = sanitizeCustomCats([cat(), cat({ name: 'Dupe' }), cat({ id: 'mine4' }), cat({ id: '__proto__' }), cat({ id: 'mine2' })]);
    expect(out.map((c) => [c.id, c.name])).toEqual([['mine1', 'Ember'], ['mine2', 'Ember']]);
  });
  it('repairs a bad field rather than dropping the cat', () => {
    const [c] = sanitizeCustomCats([{ id: 'mine1', name: 'A', personality: 'bird', look: { coat: 'plaid' }, extra: 1 }]);
    expect(c).toEqual({ id: 'mine1', name: 'My Cat', personality: 'keenNose', look: DEFAULT_LOOK });
    expect(sanitizeCustomCats([cat({ personality: 'zeetoo' })])[0].personality).toBe('keenNose');
    expect(sanitizeCustomCats([cat({ name: 'shitcat' })])[0].name).toBe('My Cat');
  });
  it('scans a huge array quickly and keeps three', () => {
    const huge = Array.from({ length: 100000 }, (_, i) => cat({ id: `mine${(i % 3) + 1}` }));
    expect(sanitizeCustomCats(huge)).toHaveLength(3);
  });
});

describe('lookToStyle', () => {
  it('maps every pattern and fur to the agreed flags, and never a family-cat flag', () => {
    const banned = ['cow', 'whiteLegs', 'band', 'ears', 'legLen', 'body', 'tagCollar', 'eyes'];
    for (const [pattern] of PATTERNS) for (const [fur] of FURS) {
      const s = lookToStyle({ ...DEFAULT_LOOK, pattern, fur });
      for (const k of banned) expect(Object.hasOwn(s, k), `${pattern}/${fur} ${k}`).toBe(false);
    }
    expect(lookToStyle({ ...DEFAULT_LOOK, pattern: 'patches' })).toMatchObject({ patches: true, patch2: MARKS.chocolate.hex, headPatch: MARKS.chocolate.hex });
    expect(lookToStyle({ ...DEFAULT_LOOK, pattern: 'socks' })).toMatchObject({ socks: true, chin: true, bib: true });
    expect(lookToStyle({ ...DEFAULT_LOOK, fur: 'long' })).toMatchObject({ fluffy: true, tufts: true, tailFluff: 1.3 });
  });
  it('takes coat, belly, accent, eyes and size from the tables', () => {
    const s = lookToStyle({ coat: 'bluegrey', marks: 'white', pattern: 'solid', fur: 'short', eyes: 'copper', size: 0.85 });
    expect(s).toMatchObject({ base: COATS.bluegrey.hex, belly: COATS.bluegrey.belly, accent: MARKS.white.hex, eyeColor: EYES.copper.hex, scale: 0.85 });
  });
});

describe('activeCat', () => {
  const base = { petName: 'Willow', equipped: { cat: 'siamese', custom: null }, customCats: [cat({ personality: 'fearless' })] };
  it('a ready-made cat walks with the pet name and no look', () => {
    expect(activeCat(base)).toEqual({ breed: 'siamese', look: null, name: 'Willow', custom: null });
  });
  it('a custom cat walks as its preset, with its look and name', () => {
    expect(activeCat({ ...base, equipped: { cat: 'siamese', custom: 'mine1' } }))
      .toEqual({ breed: 'black', look: DEFAULT_LOOK, name: 'Ember', custom: 'mine1' });
  });
  it('a dangling custom id falls back to the preset', () => {
    expect(activeCat({ ...base, equipped: { cat: 'siamese', custom: 'mine3' } }).custom).toBe(null);
  });
  it('every personality plays exactly as its preset row', () => {
    for (const [p, breed] of Object.entries(CUSTOM_PERSONALITIES)) {
      const a = activeCat({ ...base, equipped: { cat: 'tabby', custom: 'mine1' }, customCats: [cat({ personality: p })] });
      expect(PERSONALITIES[a.breed]).toBe(PERSONALITIES[breed]);
      expect(presetFor(p)).toBe(breed);
    }
  });
});

describe('the wire', () => {
  it('wireLook: missing or non-object means the plain preset; an object is repaired', () => {
    expect(wireLook({})).toBe(null);
    expect(wireLook({ look: 'x' })).toBe(null);
    expect(wireLook({ look: [] })).toBe(null);
    expect(wireLook(null)).toBe(null);
    expect(wireLook({ look: { coat: 'newcolour', eyes: 'gold' } })).toEqual({ ...DEFAULT_LOOK, eyes: 'gold' });
  });
  it('catProfileFields sends look only for a custom cat, and keeps it small', () => {
    const st = { equipped: { cat: 'tabby', collar: 'bell', head: null, face: null, neck: null, body: null, back: null, feet: null, custom: 'mine1' },
      customCats: [cat({ personality: 'chaser', look: { coat: 'bluegrey', marks: 'chocolate', pattern: 'patches', fur: 'fluffy', eyes: 'copper', size: 1.15 } })] };
    const f = catProfileFields(st);
    expect(f.breed).toBe('siamese');
    expect(f.accessories.collar).toBe('bell');
    expect(JSON.stringify(f.accessories.look).length).toBeLessThanOrEqual(120);
    expect(Object.hasOwn(catProfileFields({ ...st, equipped: { ...st.equipped, custom: null } }).accessories, 'look')).toBe(false);
  });
  it('lookKey is stable over field order', () => {
    expect(lookKey({ size: 1, eyes: 'green', fur: 'short', pattern: 'stripes', marks: 'chocolate', coat: 'ginger' })).toBe(lookKey(DEFAULT_LOOK));
  });
});
```

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**' test/customcats.test.js`. Expected: FAIL, cannot resolve `../src/customcats.js`.

- [ ] **Step 3: Implement `src/customcats.js`** with the Interfaces above. Every table read is `Object.hasOwn(TABLE, id)`. `sanitizeCustomCats` walks at most the first 32 raw entries and stops at 3 kept; it keeps only `id`, `name`, `personality`, `look`. Size: non-finite or non-number → 1; else clamp to [0.85, 1.15] and `Math.round(x * 20) / 20`. `activeCat` reads `state?.equipped?.custom` against `sanitizeCustomCats(state?.customCats)` (the save is already sanitised; this keeps the function total for the UI's defensive reads); a preset `equipped.cat` that is not an own key of `PERSONALITIES` reads as `'tabby'`; `name` for a preset is `state.petName ?? ''`. `catProfileFields` copies the seven slots from `state.equipped` and adds `look` only when `activeCat` returns one. No import of THREE, `model.js` or `progression.js`.

- [ ] **Step 4: Run the tests.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/customcats.js test/customcats.test.js
git commit -m "feat(builder): the custom-cat palette, sanitisers and activeCat"
```

---

### Task 2: Drawing a look (`src/cat/model.js`)

**Files:**
- Modify: `src/cat/model.js` (`buildCat` at 742; eyes at 843; tail links at 933–941; the calico skull patch at 998–1000; `coatColor` at 737)
- Test: `test/catcustom.test.js` (new); `test/catgolden.test.js` and `test/catmodel.test.js` run unchanged

**Interfaces:**
- Consumes: `lookToStyle`, `sanitizeLook`, `PATTERNS`, `FURS`, `COATS`, `MARKS`, `EYES` from Task 1.
- Produces:
  - `buildCat(breed, accessories?, opts?)`: `opts.look` (any) is used when `opts.style` is absent: `const s = opts.style ?? (opts.look != null ? lookToStyle(opts.look) : STYLE[breed])`. `breed` stays `userData.breed`.
  - Style-row fields read by `buildCat`: `eyeColor` (hex; `s.eyeColor ?? EYE_COLORS[breed] ?? 0x4e9440`), `headPatch` (hex; the skull patch colour when `s.patches`, default `0xd88030`), `tailFluff` (factor on every tail link and joint radius, default 1; the root ball `TAIL.ROOT_BALL` is unchanged).
  - `coatColor(breed, look = null) → hex`: with a look, `COATS[sanitizeLook(look).coat].hex`; otherwise today's behaviour.

- [ ] **Step 1: Write the failing tests** in `test/catcustom.test.js`:

```js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat, coatColor } from '../src/cat/model.js';
import { DEFAULT_LOOK, PATTERNS, FURS, COATS, MARKS, EYES } from '../src/customcats.js';
import { fingerprintCat, meshCount, triangles, PRESETS } from './helpers/catfingerprint.js';

const looks = () => PATTERNS.flatMap(([pattern]) => FURS.map(([fur]) => ({ ...DEFAULT_LOOK, pattern, fur, size: 1.15 })));

describe('custom looks', () => {
  it('every pattern × fur stays under 31 meshes full and 25 simple, and under the triangle caps', () => {
    for (const look of looks()) for (const breed of ['tabby', 'mainecoon']) {
      expect(meshCount(buildCat(breed, undefined, { look })), JSON.stringify(look)).toBeLessThanOrEqual(31);
      expect(meshCount(buildCat(breed, undefined, { look, simple: true }))).toBeLessThanOrEqual(25);
      expect(triangles(buildCat(breed, undefined, { look }))).toBeLessThanOrEqual(8000);
      expect(triangles(buildCat(breed, undefined, { look, simple: true }))).toBeLessThanOrEqual(5500);
    }
  });
  it('colours never change the mesh count', () => {
    const n = meshCount(buildCat('tabby', undefined, { look: DEFAULT_LOOK }));
    for (const coat of Object.keys(COATS)) for (const marks of Object.keys(MARKS)) {
      expect(meshCount(buildCat('tabby', undefined, { look: { ...DEFAULT_LOOK, coat, marks } }))).toBe(n);
    }
  });
  it('the same look builds byte-identically, full and simple', () => {
    for (const look of looks()) for (const simple of [false, true]) {
      expect(fingerprintCat(buildCat('calico', undefined, { look, simple }))).toEqual(fingerprintCat(buildCat('calico', undefined, { look, simple })));
    }
  });
  it('a look draws its eyes, and a preset keeps its own', () => {
    const eyeHex = (cat) => cat.userData.parts.head.children.find((m) => m.isMesh && m.geometry.parameters?.radius === 0.036).material.color.getHex();
    expect(eyeHex(buildCat('siamese', undefined, { look: { ...DEFAULT_LOOK, eyes: 'copper' } }))).toBe(EYES.copper.hex);
    expect(eyeHex(buildCat('siamese'))).toBe(0x68a8d8);
  });
  it('patches use the markings colour alone, head patch included', () => {
    const cat = buildCat('calico', undefined, { look: { ...DEFAULT_LOOK, pattern: 'patches', marks: 'grey' } });
    const skullMarks = [];
    cat.userData.parts.head.traverse((o) => { if (o.isMesh && o.parent?.isMesh) skullMarks.push(o.material.color.getHex()); });
    expect(skullMarks).toContain(MARKS.grey.hex);
    expect(skullMarks).not.toContain(0xd88030);
  });
  it('long-haired thickens the tail without adding meshes', () => {
    const r = (fur) => new THREE.Box3().setFromObject(buildCat('tabby', undefined, { look: { ...DEFAULT_LOOK, fur } }).userData.parts.tail).getSize(new THREE.Vector3()).x;
    expect(r('long')).toBeGreaterThan(r('short') * 1.2);
    expect(meshCount(buildCat('tabby', undefined, { look: { ...DEFAULT_LOOK, fur: 'long' } }).userData.parts.tail)).toBe(5);
  });
  it('size is the group scale', () => {
    expect(buildCat('tabby', undefined, { look: { ...DEFAULT_LOOK, size: 0.85 } }).scale.x).toBe(0.85);
  });
  it('coatColor reads the look', () => {
    expect(coatColor('tabby', { ...DEFAULT_LOOK, coat: 'apricot' })).toBe(COATS.apricot.hex);
    expect(coatColor('tabby')).toBe(0x9c7a4f);
  });
  it('a breed given with a look never reads its own row', () => {
    for (const b of PRESETS) expect(() => buildCat(b, undefined, { look: DEFAULT_LOOK })).not.toThrow();
  });
});
```

(Adjust the two head-child finders to the head's real structure if needed; what they assert is fixed: the eye colour, and that the skull patch is the markings colour and never `0xd88030`.)

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**' test/catcustom.test.js`. Expected: FAIL (look ignored: eyes, patch colour, tail and scale assertions fail).

- [ ] **Step 3: Implement** the Interfaces in `src/cat/model.js`. The calico's skull patch becomes `onSkull(s.headPatch ?? 0xd88030, …)`; the tail's `tailR(…)` calls are multiplied by `s.tailFluff ?? 1`. Update the `opts.style` comment block (742–749) to describe `opts.look`, and the coat-flag comment block (33–55) to list `eyeColor`, `headPatch`, `tailFluff` and `bib`.

- [ ] **Step 4: Run the new tests and the preset pins.** Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**' test/catcustom.test.js test/catgolden.test.js test/catmodel.test.js test/catpose.test.js test/catcoat.test.js`. Expected: PASS, with `test/fixtures/*.json` unmodified (`git status --short test/fixtures` prints nothing).

- [ ] **Step 5: Commit.**

```bash
git add src/cat/model.js test/catcustom.test.js
git commit -m "feat(builder): buildCat draws a custom look through the style seam"
```

---

### Task 3: The save and the progression API (`src/progression.js`)

**Files:**
- Modify: `src/progression.js` (`defaultState` 384; `sanitizeState` 807–886; `adopt` 977–981; `equipCat` 1147; `replaceFromPayload` 1881; the trade loop at 1800)
- Test: `test/progression.customcats.test.js` (new); `test/progression.test.js` (lines 33, 703, 722, 923: add `custom: null`; line 651's full-state `toEqual`: add `customCats: []`, and `custom: null` in its `equipped` at line 655); `test/editions.invariants.test.js` (line 97–98: the key list gains `'customCats'`, and the test title becomes "edition, clanPick and customCats are the only new top-level keys")

**Interfaces:**
- Consumes: `sanitizeCustomCats`, `sanitizeLook`, `CUSTOM_IDS`, `CUSTOM_MAX`, `CUSTOM_PERSONALITIES` from Task 1; `validPetName` from `src/net.js`.
- Produces (on the progression api):
  - `state.customCats: CustomCat[]` (default `[]`); `state.equipped.custom: 'mine1'|'mine2'|'mine3'|null` (default `null`).
  - `createCustomCat({ name, personality, look }) → string|null`: refuses (null, no save) when she has 3, when the name fails `validPetName`, or when the personality is not an own key of `CUSTOM_PERSONALITIES`. Takes the first unused id in `CUSTOM_IDS` order, stores `sanitizeLook(look)`, saves once. Does not equip.
  - `updateCustomCat(id, { name, personality, look }) → bool`: same refusals (unknown id → false); replaces the three fields in place; saves once. Never touches `equipped`.
  - `equipCustom(id) → bool`: sets `equipped.custom` when `id` is one of her cats; saves once.
  - `equipCat(id)`: as today, and also sets `equipped.custom = null` (only when it equips).
  - `replaceFromPayload(raw)`: keeps the local `customCats` when `raw` has no own `customCats` key.

- [ ] **Step 1: Write the failing tests** in `test/progression.customcats.test.js` (copy `fakeStorage` from `test/progression.test.js`):

```js
import { describe, it, expect } from 'vitest';
import { createProgression } from '../src/progression.js';
// fakeStorage: copied from test/progression.test.js
const SAVE_KEY = 'whisker-walk-save';
const look = { coat: 'black', marks: 'white', pattern: 'socks', fur: 'long', eyes: 'gold', size: 0.9 };
const withSave = (patch) => createProgression(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...createProgression(fakeStorage()).state, ...patch }) }));

describe('custom cats in the save', () => {
  it('a new save has none and walks a ready-made cat', () => {
    const p = createProgression(fakeStorage());
    expect(p.state.customCats).toEqual([]);
    expect(p.state.equipped.custom).toBe(null);
  });
  it('make, equip, reload: the cat and the choice survive', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    const id = p.createCustomCat({ name: 'Ember', personality: 'pouncer', look });
    expect(id).toBe('mine1');
    expect(p.equipCustom(id)).toBe(true);
    const again = createProgression(storage);
    expect(again.state.customCats).toEqual([{ id: 'mine1', name: 'Ember', personality: 'pouncer', look }]);
    expect(again.state.equipped.custom).toBe('mine1');
    expect(again.state.equipped.cat).toBe('tabby');
  });
  it('refuses a fourth cat, a bad name and a family personality', () => {
    const p = createProgression(fakeStorage());
    for (const n of ['Ember', 'Ash', 'Fern']) expect(p.createCustomCat({ name: n, personality: 'steady', look })).not.toBe(null);
    expect(p.createCustomCat({ name: 'Moss', personality: 'steady', look })).toBe(null);
    const q = createProgression(fakeStorage());
    expect(q.createCustomCat({ name: '1x', personality: 'steady', look })).toBe(null);
    expect(q.createCustomCat({ name: 'Moss', personality: 'bird', look })).toBe(null);
    expect(q.state.customCats).toEqual([]);
  });
  it('editing changes looks, name and personality but never the outfit', () => {
    const p = createProgression(fakeStorage());
    p.equipAccessory('bell');
    const id = p.createCustomCat({ name: 'Ember', personality: 'keenNose', look });
    p.equipCustom(id);
    const before = { ...p.state.equipped };
    expect(p.updateCustomCat(id, { name: 'Ember Star', personality: 'napper', look: { ...look, coat: 'cream' } })).toBe(true);
    expect(p.state.customCats[0]).toMatchObject({ name: 'Ember Star', personality: 'napper' });
    expect(p.state.equipped).toEqual(before);
    expect(p.updateCustomCat('mine2', { name: 'Ash', personality: 'napper', look })).toBe(false);
  });
  it('choosing a ready-made cat clears the custom choice and keeps equipped.cat a preset', () => {
    const p = createProgression(fakeStorage());
    p.equipCustom(p.createCustomCat({ name: 'Ember', personality: 'keenNose', look }));
    p.equipCat('tabby');
    expect(p.state.equipped.custom).toBe(null);
    expect(p.equipCustom('mine3')).toBe(false);
  });
});

describe('malformed saves', () => {
  it('a dangling or junk equipped.custom loads as null', () => {
    expect(withSave({ customCats: [], equipped: { cat: 'tabby', custom: 'mine2' } }).state.equipped.custom).toBe(null);
    expect(withSave({ customCats: 'x', equipped: { cat: 'tabby', custom: { a: 1 } } }).state.equipped.custom).toBe(null);
  });
  it('a custom id is never accepted as equipped.cat', () => {
    expect(withSave({ customCats: [{ id: 'mine1', name: 'Ember', personality: 'chaser', look }], equipped: { cat: 'mine1' } }).state.equipped.cat).toBe('tabby');
  });
  it('a bad field is repaired, the cat kept', () => {
    const s = withSave({ customCats: [{ id: 'mine1', name: '!!', personality: 'zeetoo', look: { size: 40 } }] }).state;
    expect(s.customCats[0]).toMatchObject({ name: 'My Cat', personality: 'keenNose' });
    expect(s.customCats[0].look.size).toBe(1.15);
  });
  it('the Rosa farewell with a custom cat equipped falls back to the named preset', () => {
    const raw = { ...createProgression(fakeStorage()).state, retired: [], unlocked: { cats: ['tabby', 'rosa'], accessories: [], areas: ['neighborhood'] },
      equipped: { cat: 'rosa', custom: 'mine1' }, customCats: [{ id: 'mine1', name: 'Ember', personality: 'chaser', look }] };
    const p = createProgression(fakeStorage({ [SAVE_KEY]: JSON.stringify(raw) }));
    expect(p.takeFarewell()).toContain('Tabby will walk with you');
    expect(p.state.equipped.custom).toBe(null);
    expect(p.state.customCats).toHaveLength(1);
  });
});

describe('cloud restore', () => {
  const mine = [{ id: 'mine1', name: 'Ember', personality: 'chaser', look }];
  it('an older-build payload (no customCats key) keeps this phone\'s cats', () => {
    const p = createProgression(fakeStorage());
    p.equipCustom(p.createCustomCat({ name: 'Ember', personality: 'chaser', look }));
    const { customCats, ...older } = { ...p.state, points: 77 };
    p.replaceFromPayload(older);
    expect(p.state.points).toBe(77);
    expect(p.state.customCats).toEqual(mine);
    expect(p.state.equipped.custom).toBe(null);
  });
  it('a payload with the key is a normal restore', () => {
    const p = createProgression(fakeStorage());
    p.createCustomCat({ name: 'Ember', personality: 'chaser', look });
    p.replaceFromPayload({ ...p.state, customCats: [] });
    expect(p.state.customCats).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**' test/progression.customcats.test.js`. Expected: FAIL (`createCustomCat is not a function`, `customCats` undefined).

- [ ] **Step 3: Implement** the Interfaces. In `defaultState()`: add `customCats: []` and `equipped.custom: null`. In `sanitizeState`: `const customCats = sanitizeCustomCats(parsed.customCats)`; `custom` is `parsed.equipped?.custom` only if `customCats.some((c) => c.id === it)` (a string compare against own data), else `null`; return `equipped: { cat, collar, ...slots, custom }` and `customCats` (with a comment "Additive, so SAVE_VERSION stays 4", like its neighbours). In `adopt`, when `loaded.farewell` is set, also set `state.equipped.custom = null` before building the line, and call `save()` even when `loaded.changed` is false. In the trade loop at 1800 skip `'custom'` as well as `'cat'`. `replaceFromPayload` captures `state.customCats` before `adopt` and restores it after when `!(isPlainObject(raw) && Object.hasOwn(raw, 'customCats'))`; the existing `save()` at the end persists it.

- [ ] **Step 4: Update the additive expectations** in `test/progression.test.js` (four `equipped` objects gain `custom: null`; the line-651 full state gains `customCats: []` and `equipped.custom: null`) and `test/editions.invariants.test.js` (key list and title). Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**' test/progression.customcats.test.js test/progression.test.js test/progression.visits.test.js test/progression.redeem.test.js test/editions.invariants.test.js`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/progression.js test/progression.customcats.test.js test/progression.test.js test/editions.invariants.test.js
git commit -m "feat(builder): custom cats in the save, repaired field by field, kept on an older cloud restore"
```

---

### Task 4: The walk uses `activeCat`

**Files:**
- Modify: `src/game/walk.js:503-516`, `src/game/avatar.js:289`, `src/customcats.js` (`ownTagName`), `src/ui/homebase.js:691-695` (celebration name)
- Test: `test/customcats.test.js` (append the source scan and `ownTagName`), `test/pounce.test.js` (the perk line; no test covers it today), `test/nametag.test.js` (a kid-typed name on the plain tag)

**Interfaces:**
- Consumes: `activeCat(state)`, `FALLBACK_NAME` (Task 1); `buildCat(breed, accessories, { look })` (Task 2); `makeNameTag(name)` from `src/nametag.js`.
- Produces:
  - `ownTagName(state) → string|null` exported from `src/customcats.js`: null for a ready-made cat; for a custom cat its name if `validPetName`, else `FALLBACK_NAME`, always `.slice(0, 16)`.
  - `pounceCatchLine(cat) → string` exported from `src/game/avatar.js` (pure; used at line 289): no `cat.userData.custom` → `'a Calico masterclass'` (today's line, for every ready-made pouncer); a custom cat → `` `${cat.userData.customName}'s masterclass` `` when `validPetName(customName)`, else `"a pouncer's masterclass"`.
  - The walk's cat has `userData.breed = activeCat.breed` (a preset), and, only for a custom cat, `userData.custom = activeCat.custom`, `userData.customName = ownTagName(state)` and one child tag `makeNameTag(ownTagName(state))` with `visible = true` (skipped when `makeNameTag` returns null); pace `2.2 + PERSONALITIES[activeCat(state).breed].speed * 0.8`.

- [ ] **Step 1: Write the failing tests.** Append to `test/customcats.test.js`:

```js
import { readFileSync, globSync } from 'node:fs';
it('nothing outside progression, customcats and the dressing room reads equipped.cat', () => {
  const allowed = new Set(['src/progression.js', 'src/customcats.js', 'src/ui/dressingroom.js']);
  const hits = globSync('src/**/*.js').filter((f) => !allowed.has(f))
    .filter((f) => /equipped(\?)?\.cat\b/.test(readFileSync(f, 'utf8')));
  expect(hits).toEqual([]);
});
```

And in `test/pounce.test.js`:

```js
import { pounceCatchLine } from '../src/game/avatar.js';
it('ready-made pouncers keep their line; a custom pouncer uses its own name', () => {
  expect(pounceCatchLine({ userData: { breed: 'calico' } })).toBe('a Calico masterclass');
  expect(pounceCatchLine({ userData: { breed: 'robbie' } })).toBe('a Calico masterclass');
  expect(pounceCatchLine({ userData: { breed: 'calico', custom: 'mine1', customName: 'Ember' } })).toBe("Ember's masterclass");
  expect(pounceCatchLine({ userData: { breed: 'calico', custom: 'mine1', customName: '<b>' } })).toBe("a pouncer's masterclass");
});
```

Append to `test/customcats.test.js` (add `ownTagName` to the file's import from `../src/customcats.js`):

```js
it('ownTagName: only a custom cat gets a tag, its name re-checked and clamped', () => {
  const st = (name, custom = 'mine1') => ({ petName: 'Willow', equipped: { cat: 'tabby', custom }, customCats: [{ id: 'mine1', name, personality: 'chaser', look: DEFAULT_LOOK }] });
  expect(ownTagName(st('Ember', null))).toBe(null);
  expect(ownTagName(st('Ember'))).toBe('Ember');
  expect(ownTagName(st('Warrior Star'))).toBe('Warrior Star');      // a kid may type a borrowed word; it is data, not a literal
  expect(ownTagName(st('<img src=x>'))).toBe('My Cat');
  expect(ownTagName(st('x'.repeat(40)))).toBe('My Cat');
  for (const n of ['Ember', 'Abcdefghijklmnop']) expect(ownTagName(st(n)).length).toBeLessThanOrEqual(16);
});
```

Append to `test/nametag.test.js` (with its existing fake document): `makeNameTag('Abcdefghijklmnop')` returns a one-line tag (`userData.sub` undefined, canvas height 64) whose painted font never drops below 24 px, read the same way the file's existing "shrinks a long name to fit on BOTH moods" test reads it.

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**' test/customcats.test.js test/pounce.test.js test/nametag.test.js`. Expected: FAIL listing `src/game/walk.js` and `src/game/rooms.js`; `pounceCatchLine` and `ownTagName` are not exported. (The nametag cases may already pass: they pin today's behaviour for kid-typed names.)

- [ ] **Step 3: Implement.** `walk.js`: `const active = activeCat(state)`; `buildCat(active.breed, {seven slots}, { look: active.look })`; for a custom cat set `userData.custom`, `userData.customName` and add the visible tag as in Interfaces; pace from `active.breed`. `customcats.js`: `ownTagName`. `avatar.js`: `export function pounceCatchLine(cat)` as in Interfaces (import `validPetName` from `../net.js`); line 289 awards `pounceCatchLine(cat)`. `homebase.js` `showVisit`: `petName: activeCat(progression.state).name || ''` (her own screen only). (`rooms.js` is Task 5; the scan stays red for it until then; that is expected, note it in the commit.)

- [ ] **Step 4: Run.** The perk, `ownTagName` and nametag tests pass, plus `test/clanwords.test.js` and `test/clancats.test.js`; the scan lists only `src/game/rooms.js`.

- [ ] **Step 5: Commit.**

```bash
git add src/game/walk.js src/game/avatar.js src/customcats.js src/ui/homebase.js test/customcats.test.js test/pounce.test.js test/nametag.test.js
git commit -m "feat(builder): walks build and pace the active cat; her cat's name on her own tag and pounce line"
```

---

### Task 5: The wire: profiles, remote cats, ghosts and re-tracking

**Files:**
- Modify: `src/game/rooms.js:64-115` (+ `retrackProfile` on the `rooms` object), `src/net.js` (`createNet`, `createFakeHub`, `createSupabaseTransport`), `src/remotecats.js:66-114`, `src/ghosts.js:41-48, 78-79`, `src/main.js:901`
- Test: `test/remotecats.test.js`, `test/ghosts.test.js`, `test/net.test.js`, `test/rooms.test.js`

**Interfaces:**
- Consumes: `catProfileFields(state)`, `wireLook(accessories)` (Task 1); `buildCat(..., { look })`, `coatColor(breed, look)` (Task 2).
- Produces:
  - `roomProfile()` → `{ playerId, petName: st.petName, ...catProfileFields(st) }`; `pushProfileNow` sends `breed` and `accessories: { ...fields.accessories, home }` with `petName: st.petName` unchanged.
  - `net.updateProfile(profile) → Promise<void>`: no-op unless joined; transport method `updateProfile(profile)`. Supabase: `await channel.track(profile)` when a channel exists. Fake hub: replace that player's `profile` and `broadcastRoster`.
  - `rooms.retrackProfile() → Promise<void>`: returns `pendingRoom ? pendingRoom.net.updateProfile(roomProfile()).catch(log) : Promise.resolve()` (callers fire and forget; tests await it), like `pushProfileNow`.
  - `createNet.updateProfile` guards on `selfId` (joined) and calls `transport.updateProfile?.(profile)`.
  - Remote entry gains `look: Look|null`; `sanitizeProfile` returns `{ ...profile, breed, petName, accessories, look: wireLook(accessories) }`; the group is `buildCat(breed, accessories, { simple: true, look })`. Ghosts the same.
  - The map dot: `coatColor(r.breed, r.look)`.

- [ ] **Step 1: Write the failing tests.**

`test/remotecats.test.js`:

```js
import { fingerprintCat } from './helpers/catfingerprint.js';
import { buildCat } from '../src/cat/model.js';
const LOOK = { coat: 'apricot', marks: 'black', pattern: 'patches', fur: 'long', eyes: 'blue', size: 0.9 };
const SLOTS = { collar: 'bell', head: null, face: null, neck: null, body: null, back: null, feet: null };
const CUSTOM = { playerId: 'bbb', petName: 'Willow', breed: 'calico', accessories: { ...SLOTS, look: LOOK, home: 'woods' } };

it('two receivers of the same profile draw byte-identical cats', () => {
  withFakeDocument(() => {
    const a = createRemoteCats(fakeScene()).upsert(CUSTOM);
    const b = createRemoteCats(fakeScene()).upsert(JSON.parse(JSON.stringify(CUSTOM)));
    const strip = (g) => { g.remove(...g.children.filter((c) => c.isSprite)); return g; }; // the name tag
    expect(fingerprintCat(strip(a.group))).toEqual(fingerprintCat(strip(b.group)));
    expect(a.look).toEqual(LOOK);
    expect(a.petName).toBe('Willow');
  });
});
it('an old build ignores look: the extra key changes nothing it draws', () => {
  const withLook = buildCat('calico', { ...SLOTS, look: LOOK, home: 'woods' }, { simple: true });
  expect(fingerprintCat(withLook)).toEqual(fingerprintCat(buildCat('calico', SLOTS, { simple: true })));
});
it('a junk or newer look falls back without throwing', () => {
  withFakeDocument(() => {
    const r = createRemoteCats(fakeScene());
    expect(r.upsert({ ...CUSTOM, accessories: { ...SLOTS, look: 'x' } }).look).toBe(null);
    expect(r.upsert({ ...CUSTOM, playerId: 'ccc', accessories: { ...SLOTS, look: { coat: 'galaxy', size: 'big' } } }).look.coat).toBe('ginger');
  });
});
it('a changed look rebuilds the cat', () => {
  withFakeDocument(() => {
    const r = createRemoteCats(fakeScene());
    const first = r.upsert(CUSTOM).group;
    expect(r.upsert({ ...CUSTOM, accessories: { ...CUSTOM.accessories, look: { ...LOOK, coat: 'cream' } } }).group).not.toBe(first);
  });
});
```

(Use the file's own name-tag handling if the tag is not a Sprite; the assertion is that the cat geometry matches.)

`test/ghosts.test.js`: a ghost profile with `accessories.look` builds with that look (its torso's first vertex colour differs from the plain calico's) and with `look: 5` builds the plain calico.

`test/net.test.js`:

```js
it('updateProfile re-tracks: the partner sees the new profile in the roster', async () => {
  const hub = createFakeHub();
  const a = createNet(hub.transport()); const b = createNet(hub.transport());
  await a.join('ROOM', { playerId: 'aaa', petName: 'Willow', breed: 'tabby', accessories: {} });
  await b.join('ROOM', { playerId: 'bbb', petName: 'Rowan', breed: 'tabby', accessories: {} });
  let seen = null; b.onRoster((r) => { seen = r; });
  await a.updateProfile({ playerId: 'aaa', petName: 'Willow', breed: 'black', accessories: { look: { coat: 'cream' } } });
  expect(seen.find((p) => p.playerId === 'aaa').breed).toBe('black');
});
it('updateProfile before join does nothing', async () => {
  await expect(createNet(createFakeHub().transport()).updateProfile({ playerId: 'x' })).resolves.toBeUndefined();
});
```

`test/rooms.test.js` (in the `pushProfileNow` describe, reusing `pushing()`): after `createCustomCat` + `equipCustom` with personality `fearless`, the pushed profile has `breed: 'black'`, `petName: 'Mittens'` (not the cat's name) and `accessories.look` equal to the saved look, and the key order is the seven slots, `look`, `home`; `made.roomProfile()` has the same `breed`, `petName` and `look`. A second case, with the file's `pair(hub)` helper (one shared `createFakeHub()`): both sides `walkWithPartner()`; the host runs `createCustomCat` + `equipCustom` (personality `fearless`), then `await host.rooms.retrackProfile()`; assert `kid.rooms.getState().roster.find((p) => p.playerId === HOST)` has `breed: 'black'` and `petName: 'Mittens'` (`pushing()` cannot be used: it makes a new hub per transport).

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**' test/remotecats.test.js test/ghosts.test.js test/net.test.js test/rooms.test.js`. Expected: FAIL (`look` undefined, `updateProfile` missing, preset breed sent).

- [ ] **Step 3: Implement** the Interfaces. Keep the `profileUnchanged` comparison as it is (it already compares the whole `accessories`, so a changed look rebuilds). Add the `updateProfile` line to the comment block in `createSupabaseTransport` that lists transport methods.

- [ ] **Step 4: Run.** Same command plus `test/customcats.test.js` (the scan is now green) and `test/cowalkstreams.test.js test/netevents.test.js test/lobby.test.js`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/game/rooms.js src/net.js src/remotecats.js src/ghosts.js src/main.js test/remotecats.test.js test/ghosts.test.js test/net.test.js test/rooms.test.js
git commit -m "feat(builder): a custom look rides the profile; co-walkers and ghosts draw it; rooms re-track"
```

---

### Task 6: The stage and the portraits

**Files:**
- Modify: `src/ui/catstage.js:326` (`show`), `src/thumbnails.js`
- Test: `test/catstage.test.js`

**Interfaces:**
- Consumes: `buildCat(breed, accessories, { look })`, `lookKey` (Task 1).
- Produces:
  - `stage.show(breed, accessories = {}, look = null)`: builds `buildCat(breed, accessories, look ? { look } : undefined)` (the injected `buildCat` is called with two arguments for a preset, so existing fakes still match). The fallback image stays `thumbs.cats[breed]`.
  - `customThumbnails(entries: Array<{ key: string, breed: string, look: Look }>) → Record<string, string>`: data URLs for every entry's `key`, rendering only keys not yet in the module cache, in one throwaway renderer per call (`forceContextLoss` after). On failure, logs once and returns what the cache has (missing keys absent).

- [ ] **Step 1: Write the failing test** in `test/catstage.test.js` (reusing `setup`): `stage.show('calico', { collar: 'bell' }, LOOK)` calls the injected `buildCat` with `('calico', { collar: 'bell' }, { look: LOOK })`; `stage.show('tabby', {})` calls it with exactly two arguments; with `failed` set, a custom show places `thumbs.cats.calico`.

- [ ] **Step 2: Run it to see it fail.** Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**' test/catstage.test.js`. Expected: FAIL (look not passed).

- [ ] **Step 3: Implement** `show`'s third parameter and `customThumbnails` (sharing `snap` with `renderAllUnsafe` by lifting it into a `makeSnapper(renderer, scene, camera)` helper; `menuThumbnails` output is unchanged). `customThumbnails` is not unit-tested (WebGL); Task 9 checks it.

- [ ] **Step 4: Run.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/catstage.js src/thumbnails.js test/catstage.test.js
git commit -m "feat(builder): the stage shows a look; custom portraits snapped on demand"
```

---

### Task 7: The builder's model and HTML (`src/ui/catbuilder.js`)

**Files:**
- Create: `src/ui/catbuilder.js`
- Test: `test/catbuilder.test.js`

**Interfaces:**
- Consumes: Task 1's tables, `sanitizeLook`, `presetFor`, `DEFAULT_LOOK`, `DEFAULT_PERSONALITY`; `validPetName`; `CAT_BLURBS` from `src/ui/catblurbs.js`.
- Produces:
  - `type Builder = { mode: 'new'|'edit', id: string|null, start: Fields, draft: Fields, confirmLeave: boolean }`, `type Fields = { name: string, personality: string, look: Look }`.
  - `newBuilder() → Builder` (draft = start = `{ name: '', personality: 'keenNose', look: DEFAULT_LOOK }`).
  - `editBuilder(cat: CustomCat) → Builder` (draft = start = the cat's fields).
  - `reduceBuilder(b, action) → Builder` (same object when nothing changes). Actions: `{ type: 'pick', field: 'coat'|'marks'|'pattern'|'fur'|'eyes', value }` (own key of that table, else ignored); `{ type: 'personality', value }` (own key of `CUSTOM_PERSONALITIES`); `{ type: 'size', value }` (snapped via `sanitizeLook`); `{ type: 'name', value }` (string, `slice(0, 16)`); `{ type: 'ask-leave' }`; `{ type: 'stay' }`.
  - `isDirty(b) → bool` (draft differs from start, by `lookKey` + name + personality).
  - `buildBuilderModel(b) → { title, rows, marksDimmed, marksNote, blurb, name, nameValid, canDone, confirmLeave, breed, look }`. `title`: `'Make your own cat'` (new) or `` `Change ${start.name}` `` (edit). `marksDimmed` for `solid` (`marksNote` `Solid cats have no markings`) and `socks` (`Socks are always white`). `blurb`: `CAT_BLURBS[presetFor(personality)]`. `canDone = validPetName(name)`. `breed = presetFor(personality)`, `look = draft.look`.
  - `renderBuilderHtml(model) → string` (escaped). Markup contract the controller relies on: swatches `<button class="cb-sw" data-cb-pick="coat" data-cb-value="ginger" aria-pressed aria-label="Ginger" style="--sw:#c8743a">`; pills `<button class="cb-pill" data-cb-pick="pattern" …>` and `data-cb-personality="…"`; `<input type="range" data-cb-size min="0.85" max="1.15" step="0.05">` with `Small` / `Big`; `<input type="text" data-cb-name value="${escaped draft.name}" maxlength="16" autocomplete="off" autocapitalize="words" enterkeyhint="done" aria-label="Cat name">`; `<p class="cb-hint">Pet names are 2–16 letters, spaces, or hyphens.</p>`; `<button data-cb-cancel>✕ Not now</button>`; `<button class="cb-done" data-cb-done disabled?>Done, now dress it up →</button>`; when `confirmLeave`, `<div class="cb-leave" role="alertdialog">Leave without saving? <button data-cb-leave>Leave</button> <button data-cb-stay>Keep going</button></div>`. Rows in the sketch's order: Coat colour, Markings colour, Pattern, Fur, Eyes, Size, Personality, Name.

- [ ] **Step 1: Write the failing tests** in `test/catbuilder.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { newBuilder, editBuilder, reduceBuilder, isDirty, buildBuilderModel, renderBuilderHtml } from '../src/ui/catbuilder.js';
import { DEFAULT_LOOK } from '../src/customcats.js';
import { RANK_WORDS, OUTSIDE_WORDS, PLACE_WORDS, CLAN_SUFFIX } from '../src/clanwords.js';

const html = (b) => renderBuilderHtml(buildBuilderModel(b));

describe('the builder', () => {
  it('starts as a ginger tabby, green eyes, size 1, Keen nose, no name, Done greyed', () => {
    const m = buildBuilderModel(newBuilder());
    expect(m.look).toEqual(DEFAULT_LOOK);
    expect(m.breed).toBe('tabby');
    expect(m.canDone).toBe(false);
    expect(html(newBuilder())).toMatch(/data-cb-done[^>]*disabled/);
  });
  it('a valid name is all it takes', () => {
    const b = reduceBuilder(newBuilder(), { type: 'name', value: 'Ember' });
    expect(buildBuilderModel(b).canDone).toBe(true);
    expect(html(b)).not.toMatch(/data-cb-done[^>]*disabled/);
  });
  it('rows come in the sketch order', () => {
    const order = ['Coat colour', 'Markings colour', 'Pattern', 'Fur', 'Eyes', 'Size', 'Personality', 'Name'];
    const h = html(newBuilder());
    expect(order.map((t) => h.indexOf(t))).toEqual([...order.map((t) => h.indexOf(t))].sort((a, b) => a - b));
  });
  it('markings dim for Solid and White socks, and the choice is remembered', () => {
    let b = reduceBuilder(newBuilder(), { type: 'pick', field: 'marks', value: 'grey' });
    b = reduceBuilder(b, { type: 'pick', field: 'pattern', value: 'solid' });
    expect(buildBuilderModel(b)).toMatchObject({ marksDimmed: true, marksNote: 'Solid cats have no markings' });
    expect(buildBuilderModel(reduceBuilder(b, { type: 'pick', field: 'pattern', value: 'socks' })).marksNote).toBe('Socks are always white');
    expect(reduceBuilder(b, { type: 'pick', field: 'pattern', value: 'stripes' }).draft.look.marks).toBe('grey');
  });
  it('the personality shows its ready-made cat\'s blurb, and all six are open', () => {
    const b = reduceBuilder(newBuilder(), { type: 'personality', value: 'fearless' });
    expect(buildBuilderModel(b).blurb).toBe('Brave — nothing spooks this cat');
    expect((html(b).match(/data-cb-personality=/g) || []).length).toBe(6);
    expect(html(b)).not.toMatch(/locked|🔒|🐾/);
  });
  it('ignores junk actions', () => {
    const b = newBuilder();
    for (const a of [{ type: 'pick', field: 'coat', value: 'toString' }, { type: 'pick', field: 'size', value: 'x' }, { type: 'personality', value: 'bird' }, null]) {
      expect(reduceBuilder(b, a)).toBe(b);
    }
  });
  it('every choice is a button with aria-pressed; swatches are labelled', () => {
    const h = html(newBuilder());
    for (const tag of h.match(/<[^>]*data-cb-(pick|personality)=[^>]*>/g)) {
      expect(tag.startsWith('<button')).toBe(true);
      expect(tag).toMatch(/aria-pressed="(true|false)"/);
    }
    for (const tag of h.match(/<[^>]*class="cb-sw[^>]*>/g)) expect(tag).toMatch(/aria-label="[A-Z]/);
  });
  it('escapes the name and keeps it in the field', () => {
    expect(html(reduceBuilder(newBuilder(), { type: 'name', value: '<b>"x' }))).not.toContain('<b>"x');
    expect(html(reduceBuilder(newBuilder(), { type: 'name', value: 'Ember' }))).toMatch(/data-cb-name[^>]*value="Ember"/);
  });
  it('dirty tracking and the leave question', () => {
    const cat = { id: 'mine2', name: 'Ash', personality: 'steady', look: DEFAULT_LOOK };
    const e = editBuilder(cat);
    expect(isDirty(e)).toBe(false);
    expect(buildBuilderModel(e).title).toBe('Change Ash');
    const changed = reduceBuilder(e, { type: 'size', value: 1.1 });
    expect(isDirty(changed)).toBe(true);
    expect(html(reduceBuilder(changed, { type: 'ask-leave' }))).toContain('Leave without saving?');
  });
  it('the builder is the same in both editions and has no borrowed word', () => {
    const src = readFileSync('src/ui/catbuilder.js', 'utf8');
    expect(src).not.toMatch(/edition/);
    const h = html(reduceBuilder(newBuilder(), { type: 'ask-leave' })).toLowerCase();
    for (const w of [...Object.values(RANK_WORDS), ...Object.values(OUTSIDE_WORDS), ...Object.values(PLACE_WORDS), CLAN_SUFFIX]) {
      expect(h).not.toMatch(new RegExp(`\\b${w.toLowerCase()}\\b`));
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**' test/catbuilder.test.js`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `src/ui/catbuilder.js` with the Interfaces. DOM-free; no import of `edition.js`, `progression.js` or THREE. The file must not contain the word "edition" at all, comments included (the Task 7 source test reads it).

- [ ] **Step 4: Run.** Same command, plus `test/clanwords.test.js`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/catbuilder.js test/catbuilder.test.js
git commit -m "feat(builder): the builder's rows, draft and markup"
```

---

### Task 8: The dressing room: her cats, the ＋ tile, the builder and Done

**Files:**
- Modify: `src/ui/dressingroom.js` (`buildDressingModel` 68–90, `portraitHtml` 158, `renderDressingRoomHtml` 186–231), `src/ui/dressingroomview.js` (reducer, `DR_SELECTOR`, `afterRender`, `handleClick`, new `handleInput`, `onCat`, `clearPreview`), `src/ui/homebase.js` (`ensureDressing` 716, `render` 883–888, the `input` listener 1278), `src/style.css`
- Test: `test/dressingroom.test.js`, `test/dressingroomcontroller.test.js`

**Interfaces:**
- Consumes: Task 1 (`sanitizeCustomCats`, `presetFor`, `lookKey`, `COATS`, `CUSTOM_MAX`), Task 3 (`createCustomCat`, `updateCustomCat`, `equipCustom`, `equipCat`), Task 5 (`rooms.retrackProfile`), Task 6 (`stage.show(breed, acc, look)`, `customThumbnails`), Task 7 (all of it).
- Produces:
  - `buildDressingModel(state, catalog, { previewCat, tryOn })` gains: `mine: [{ id, name, selected, key, coatHex }]`, `canMake: bool` (`mine.length < 3`), and `hero` for a custom cat `{ id, custom: true, name, blurb: CAT_BLURBS[preset], owned: true, price: 0, canBuy: false, breed: preset, look }`; preset heroes gain `breed: id, look: null`. A preset portrait is `selected` only when `equipped.custom` is null. A `previewCat` (locked preset) still takes the hero.
  - `renderDressingRoomHtml({ …, ui: { …, builderHtml, heroName, heroBlurb } })`: with `builderHtml`, the stage section stays and its hero text is `heroName` (the draft name, or `Your cat` when empty) and `heroBlurb` (the draft personality's blurb), with **no** Unlock and no ✏️ button and `builderHtml` replaces the strip, pills, every panel, the extras and the dock. Without it, the strip ends with her tiles (`<button class="dr-portrait dr-mine" data-dr-mine="mine1" aria-pressed title="Ember">` holding `thumbs.mine[key]` or `<span class="dr-mine-dot" style="--sw:#…">E</span>`), then `<button class="dr-portrait dr-make" data-dr-make>＋ Make a cat</button>` or, at 3, `<div class="dr-portrait dr-make full" aria-disabled="true">3 of 3 — change one of yours for a new look</div>`. A custom hero shows `<button class="dr-hero-edit" data-dr-edit="mine1">✏️ Change my cat</button>` where a preset shows Unlock.
  - Controller UI state gains `builder: Builder|null`; `INITIAL_DRESSING_UI.builder = null`; `clear-preview` also sets `builder: null`.
  - `createDressingRoom({ …, onProfileChange = () => {}, snapCustom = customThumbnails })`: `snapCustom` is injectable so tests (no WebGL, no `document`) pass `() => ({})`. `onProfileChange` is called after every successful cat, custom or accessory change (`equipCat`, `equipCustom`, `equipAccessory`, `unequip`, buys that equip, Done).
  - `handleClick(e)`: new selectors `[data-dr-mine],[data-dr-make],[data-dr-edit],[data-cb-pick],[data-cb-personality],[data-cb-cancel],[data-cb-done],[data-cb-leave],[data-cb-stay]`. `data-dr-mine` → `equipCustom` + clear preview. `data-dr-make` → `newBuilder()` (ignored at 3). `data-dr-edit` → `editBuilder(cat)`. `data-cb-cancel` → close when clean, else `ask-leave`. `data-cb-leave` → close. `data-cb-done` → see Step 3.
  - `handleInput(e) → bool`: `data-cb-name` → reduce `name`, then patch in place (no `onChange`): the Done button's `disabled`, and `.dr-hero-name`'s text; `data-cb-size` → reduce `{ type: 'size', value: Number(e.target.value) }` (a range input's value is a string, which `sanitizeLook` would read as 1), then `stage.show(breed, {}, look)` directly and update `lastShown` to that key. Returns false for any other target.
  - `captureFocus(root) → { start, end }|null` and `restoreFocus(root, saved)`: read `root.ownerDocument?.activeElement` (tests have no `document`); when it carries `dataset.cbName`, remember `selectionStart/End`; after the render, find `[data-cb-name]` in `root`, `focus()` it and `setSelectionRange(start, end)`. (iOS may not reopen the keyboard for a `focus()` outside a user gesture; Task 9 checks how it feels.)
  - `afterRender`: in builder mode shows `stage.show(model.breed, {}, model.look)`; otherwise `stage.show(hero.breed, accessories, hero.look)`. `lastShown`'s key includes the look.

- [ ] **Step 1: Write the failing tests.**

`test/dressingroom.test.js` (pure model and HTML):

```js
const LOOK = { coat: 'cream', marks: 'grey', pattern: 'patches', fur: 'fluffy', eyes: 'blue', size: 1 };
const BASE_STATE = defaultishState();
const withMine = (n, custom = null) => ({ ...BASE_STATE, customCats: ['mine1', 'mine2', 'mine3'].slice(0, n).map((id, i) => ({ id, name: ['Ember', 'Ash', 'Fern'][i], personality: 'fearless', look: LOOK })), equipped: { ...BASE_STATE.equipped, custom } });

it('her cats follow the ready-made portraits, then the ＋ tile', () => {
  const h = renderDressingRoomHtml({ model: buildDressingModel(withMine(1), CATALOG) });
  expect(h.indexOf('data-dr-cat="hagrid"')).toBeLessThan(h.indexOf('data-dr-mine="mine1"'));
  expect(h.indexOf('data-dr-mine="mine1"')).toBeLessThan(h.indexOf('data-dr-make'));
  expect(h).toContain('＋ Make a cat');
});
it('at three cats the tile is greyed with the agreed words and nothing deletes', () => {
  const h = renderDressingRoomHtml({ model: buildDressingModel(withMine(3), CATALOG) });
  expect(h).toContain('3 of 3 — change one of yours for a new look');
  expect(h).not.toMatch(/<button[^>]*data-dr-make/);
  expect(h).not.toMatch(/delete|remove|let this cat go/i);
});
it('walking a custom cat: her tile is selected, no preset is, the hero is hers with Change my cat', () => {
  const m = buildDressingModel(withMine(2, 'mine2'), CATALOG);
  expect(m.cats.some((c) => c.selected)).toBe(false);
  expect(m.mine.find((c) => c.id === 'mine2').selected).toBe(true);
  expect(m.hero).toMatchObject({ custom: true, name: 'Ash', breed: 'black', blurb: 'Brave — nothing spooks this cat', look: LOOK });
  expect(renderDressingRoomHtml({ model: m })).toContain('data-dr-edit="mine2"');
});
it('builder mode replaces the strip, panels and dock but keeps the one stage', () => {
  const h = renderDressingRoomHtml({ model: buildDressingModel(withMine(0), CATALOG), startHtml: '<button id="btn-start">', ui: { builderHtml: '<section class="cb">B</section>' } });
  expect(h).toContain('id="dr-stage"');
  expect(h).toContain('<section class="cb">B</section>');
  expect(h).not.toContain('dr-strip');
  expect(h).not.toContain('btn-start');
});
it('builder mode shows the draft name and no buy or edit button', () => {
  const h = renderDressingRoomHtml({ model: buildDressingModel(withMine(1, 'mine1'), CATALOG), ui: { builderHtml: '<section class="cb"></section>', heroName: 'Ember', heroBlurb: 'x' } });
  expect(h).toContain('Ember');
  expect(h).not.toContain('data-dr-edit');
  expect(h).not.toContain('data-dr-buy-cat');
});
it('the hero name and builder hero name are escaped', () => {
  const h = renderDressingRoomHtml({ model: buildDressingModel(withMine(0), CATALOG), ui: { builderHtml: '<i></i>', heroName: '<img src=x>' } });
  expect(h).not.toContain('<img src=x>');
});
it('the same in both editions apart from the places', () => {
  const strip = (h) => h.slice(h.indexOf('dr-strip'), h.indexOf('dr-pills'));
  const a = renderDressingRoomHtml({ model: buildDressingModel({ ...withMine(1), edition: 'legacy' }, CATALOG) });
  const b = renderDressingRoomHtml({ model: buildDressingModel({ ...withMine(1), edition: 'canon' }, CATALOG) });
  expect(strip(a)).toBe(strip(b));
});
```

(`BASE_STATE` is `defaultishState()`, the file's existing fixture: write `const BASE_STATE = defaultishState();` above these cases.)

`test/dressingroomcontroller.test.js` (extend `setup()` with the real `createProgression(fakeStorage())` for these cases, a fake `stage = { mount() {}, show: vi.fn(), failed: false }`, `onProfileChange: vi.fn()`, `snapCustom: () => ({})`, and `thumbs: { cats: {}, accessories: {}, mine: {} }`):

```js
const doneBtn = { disabled: true };
const heroName = { textContent: '' };
const fakeRoot = { querySelector: (sel) => (sel.includes('cb-done') ? doneBtn : sel.includes('dr-hero-name') ? heroName : null) };
const input = (dataset, value) => ({ target: { dataset, value, closest: () => fakeRoot } });

it('＋ opens the builder; typing a valid name enables Done without a render', () => {
  const { dr, onChange } = real();
  dr.handleClick(click({ drMake: '' }));
  onChange.mockClear();
  expect(dr.handleInput(input({ cbName: '' }, 'Ember'))).toBe(true);
  expect(doneBtn.disabled).toBe(false);
  expect(heroName.textContent).toBe('Ember');
  expect(onChange).not.toHaveBeenCalled();
});
it('Done saves, walks and dresses the new cat, and re-tracks the room', () => {
  const { dr, progression, onProfileChange, sync } = real();
  progression.equipAccessory('bell');
  dr.handleClick(click({ drMake: '' }));
  dr.handleClick(click({ cbPick: 'pattern', cbValue: 'socks' }));
  dr.handleInput(input({ cbName: '' }, 'Ember'));
  dr.handleClick(click({ cbDone: '' }));
  expect(progression.state.customCats[0]).toMatchObject({ id: 'mine1', name: 'Ember' });
  expect(progression.state.equipped).toMatchObject({ custom: 'mine1', collar: 'bell' });
  expect(dr.ui).toMatchObject({ builder: null, pill: 'wearing' });
  expect(onProfileChange).toHaveBeenCalled();
  expect(sync.autoSync).toHaveBeenCalled();
});
it('Done with an invalid name does nothing', () => {
  const { dr, progression } = real();
  dr.handleClick(click({ drMake: '' }));
  dr.handleInput(input({ cbName: '' }, 'x'));
  dr.handleClick(click({ cbDone: '' }));
  expect(progression.state.customCats).toEqual([]);
  expect(dr.ui.builder).not.toBe(null);
});
it('Not now: clean closes at once; changed asks once; Leave keeps the old version', () => {
  const { dr, progression } = real();
  progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK });
  dr.handleClick(click({ drEdit: 'mine1' }));
  dr.handleClick(click({ cbCancel: '' }));
  expect(dr.ui.builder).toBe(null);
  dr.handleClick(click({ drEdit: 'mine1' }));
  dr.handleClick(click({ cbPick: 'coat', cbValue: 'black' }));
  dr.handleClick(click({ cbCancel: '' }));
  expect(dr.ui.builder.confirmLeave).toBe(true);
  dr.handleClick(click({ cbLeave: '' }));
  expect(progression.state.customCats[0].look.coat).toBe('ginger');
});
it('editing saves over the cat and keeps every accessory', () => {
  const { dr, progression } = real();
  progression.equipAccessory('bell');
  progression.equipCustom(progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK }));
  const outfit = { ...progression.state.equipped };
  dr.handleClick(click({ drEdit: 'mine1' }));
  dr.handleClick(click({ cbPersonality: 'napper' }));
  dr.handleClick(click({ cbDone: '' }));
  expect(progression.state.customCats).toHaveLength(1);
  expect(progression.state.customCats[0].personality).toBe('napper');
  expect(progression.state.equipped).toEqual(outfit);
});
it('at three, ＋ does nothing', () => {
  const { dr, progression } = real();
  for (const n of ['Ash', 'Fern', 'Moss']) progression.createCustomCat({ name: n, personality: 'steady', look: DEFAULT_LOOK });
  dr.handleClick(click({ drMake: '' }));
  expect(dr.ui.builder).toBe(null);
});
it('a ready-made portrait clears the custom choice; her tile sets it; both re-track', () => {
  const { dr, progression, onProfileChange } = real();
  progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK });
  dr.handleClick(click({ drMine: 'mine1' }));
  expect(progression.state.equipped.custom).toBe('mine1');
  dr.handleClick(click({ drCat: 'tabby' }));
  expect(progression.state.equipped.custom).toBe(null);
  expect(onProfileChange).toHaveBeenCalledTimes(2);
});
it('the builder stage shows the draft bare; the dressing room shows her cat dressed', () => {
  const { dr, progression, stage } = real();
  progression.equipAccessory('bell');
  dr.handleClick(click({ drMake: '' }));
  dr.afterRender({ id: 'dr-stage' });
  expect(stage.show).toHaveBeenLastCalledWith('tabby', {}, DEFAULT_LOOK);
});
it('the size slider sets the size and redraws the stage without a render', () => {
  const { dr, stage, onChange } = real();
  dr.handleClick(click({ drMake: '' }));
  onChange.mockClear();
  expect(dr.handleInput(input({ cbSize: '' }, '1.1'))).toBe(true);
  expect(dr.ui.builder.draft.look.size).toBe(1.1);
  expect(stage.show).toHaveBeenLastCalledWith('tabby', {}, { ...DEFAULT_LOOK, size: 1.1 });
  expect(onChange).not.toHaveBeenCalled();
});
it('a re-render keeps the draft name', () => {
  const { dr } = real();
  dr.handleClick(click({ drMake: '' }));
  dr.handleInput(input({ cbName: '' }, 'Ember'));
  expect(dr.html()).toContain('value="Ember"');
});
it('focus and caret survive a render (a colony poll or a partner re-track)', () => {
  const { dr } = real();
  const fresh = { focus: vi.fn(), setSelectionRange: vi.fn() };
  const root = { ownerDocument: { activeElement: { dataset: { cbName: '' }, selectionStart: 3, selectionEnd: 3 } }, querySelector: () => fresh };
  const saved = dr.captureFocus(root);
  dr.restoreFocus(root, saved);
  expect(fresh.focus).toHaveBeenCalled();
  expect(fresh.setSelectionRange).toHaveBeenCalledWith(3, 3);
  expect(dr.captureFocus({ ownerDocument: { activeElement: { dataset: {} } } })).toBe(null);
});
it('clearPreview (a walk starting) closes the builder unsaved', () => {
  const { dr, progression } = real();
  dr.handleClick(click({ drMake: '' }));
  dr.handleInput(input({ cbName: '' }, 'Ember'));
  dr.clearPreview();
  expect(dr.ui.builder).toBe(null);
  expect(progression.state.customCats).toEqual([]);
});
```

(`real()` is a new helper beside `setup()` that also resets `doneBtn.disabled = true` and `heroName.textContent = ''`; `click(dataset)` is the file's existing helper. The controller creates `thumbs.mine = {}` itself when the thumbs it is given (from `menuThumbnails()`, or `{}` in `setup()`) have none.)

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**' test/dressingroom.test.js test/dressingroomcontroller.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces. Done: `canDone` false → return. New: `id = createCustomCat(draft)`; null → close the builder and change nothing. Edit: `updateCustomCat(b.id, draft)`. Then `equipCustom(id)`, close the builder, `pill: 'wearing'`, `openSlot: null`, `previewCat: null`, `sync.autoSync()`, `onProfileChange()`. Custom thumbnails: in `html()`, collect `model.mine` keys missing from the controller's `thumbs.mine` and call `customThumbnails` for them once each (keys that failed are remembered so a failing WebGL is not retried every render). `homebase.js`: pass `onProfileChange: () => rooms?.retrackProfile?.()`; in the `input` listener call `if (dressing && dressing.handleInput(e)) return;` first; in `render()`, `const f = dressing?.captureFocus(root)` before `root.innerHTML = …` and `dressing.restoreFocus(root, f)` after `afterRender`.

  `src/style.css` (phone first, at 390 px): the builder's `.dr-hero` is `position: sticky; top: 0` with the stage at `38vh` (`max-height: 300px`), rows scroll under it; every `.cb-sw`, `.cb-pill`, `[data-cb-cancel]`, `.cb-done` and the range thumb are at least 44 px; `.cb-sw` gets its colour from `--sw`; the Done/Not now row is `position: sticky; bottom: 0` with `env(safe-area-inset-bottom)` padding; the name input uses `font-size: 16px` (no iOS zoom); `.cb-row.dim` at 45% opacity with the note visible; desktop (≥ 900 px) puts the stage left and the rows right, like the dressing room's grid. Reuse the dressing room's colour tokens.

- [ ] **Step 4: Run.** Same command, plus the whole suite: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`. Expected: PASS, and `git status --short test/fixtures` prints nothing.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/dressingroom.js src/ui/dressingroomview.js src/ui/homebase.js src/style.css test/dressingroom.test.js test/dressingroomcontroller.test.js
git commit -m "feat(builder): make, change and walk your own cats from the dressing room"
```

---

### Task 9: Live check (headless Chromium) and the swatch sign-off

Nothing merges until this is done. A failed check goes back to the owning task with a test where one can pin it.

- [ ] **Step 1: Build.** `npm run build` in the worktree. Expected: success.

- [ ] **Step 2: Start a dev server for the worktree.** `preview_start` reads `.claude/launch.json` from the **main checkout** (`/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/launch.json`, which may carry other agents' entries: leave them alone). Add one entry and remember to remove only it:

```json
{ "name": "whisker-walk-catbuilder", "runtimeExecutable": "npx",
  "runtimeArgs": ["vite", "/Users/pniessen/CLAUDE-CODE/projects/cat-game/.worktrees/<the build worktree>", "--port", "5187", "--strictPort"],
  "port": 5187 }
```

Check the port is free first (`lsof -nP -iTCP:5187 -sTCP:LISTEN` prints nothing; else pick another free 518x). The positional root makes Vite serve (and read the config of) the build worktree, not main; do not rely on a `cwd` key. The worktree has no `.env.local`, so multiplayer is off. **First check:** the page shows `＋ Make a cat` (if not, it is serving main: stop and fix the entry).

- [ ] **Step 3: Drive it headless.** Use the Playwright already installed in the chess-game project (`/Users/pniessen/CLAUDE-CODE/projects/chess-game/node_modules/playwright`), from a script in the scratchpad (not in the repo), Chromium headless, two viewports: 390×844 (`isMobile: true, hasTouch: true`) and 1280×800. Screenshots go in the scratchpad. Check:
  - **Under a minute:** from a fresh save, tap ＋ Make a cat, type a name, tap Done: three taps and a name. Time it from the ＋ tap. The new cat is on the stage, dressed in the current outfit, and the Wearing panel is open.
  - Every row: each coat, markings colour, pattern, fur and eye swatch changes the stage at once; Markings dims for Solid and White socks with the right note and comes back for Tabby; the size slider grows and shrinks the cat live; the Personality blurb changes.
  - At 390 px: no horizontal scroll; the stage stays visible while the rows scroll; every tap target measures ≥ 44 px (`getBoundingClientRect`); the Done row stays on screen.
  - Type in the name field while a render fires (call the home base's render from the console mid-typing): the text, caret and focus survive.
  - ✕ Not now on a changed draft asks "Leave without saving?" once; Leave keeps the old version.
  - Make three cats; the ＋ tile reads "3 of 3 — change one of yours for a new look"; ✏️ Change my cat edits one; accessories stay on.
  - Walking a custom cat: her cat wears its own name on a tag (both editions; a 16-letter name fits the pill); it does not hide the path ahead at the default and closest zoom; a ready-made cat still has no tag; the tag sways but stays readable after a swim shake; a photo snapped on the walk shows it; a pounce catch toasts "You spotted Ember's masterclass", and the ready-made Calico still toasts "a Calico masterclass".
  - Each pattern × fur on the stage and on a walk in the Neighborhood (chase camera and closest zoom): markings placed on the new body, no z-fighting, the long-haired tail, the bib under a ruff, socks on the paws, accessories placed (a hat, the scarf, the backpack, sneakers).
  - The custom portraits in the strip (and the coloured-dot fallback with WebGL disabled via `--disable-webgl`).
  - Both editions (the title toggle): the builder looks the same.
  - Reload: the cats and the choice persist. Paste a hostile save into `localStorage` (`customCats: 'x'`, `equipped.custom: 'mine9'`, a cat with `size: 99` and a 200-character name) and reload: the game loads, and the cat is repaired.
  - Console: no errors.

- [ ] **Step 4: Co-walk.** Not testable headless without multiplayer. Ask the owner to try it on the two iPhones: she walks a custom cat; her own screen shows the cat's name over her cat; her brother (new build) sees the same coat, pattern, fur, eyes and size, her usual pet name on the tag (ruling 15), and a re-made cat after she taps Done while they are in a room. If one phone is on an older build, it shows the mapped ready-made cat in her outfit with her pet name.

- [ ] **Step 5: Swatches with her.** Show the eight coats, six markings colours and four eye colours on the iPhone in the walk's lighting; apply her picks to the hexes and bellies in `src/customcats.js` (ids stay; no test pins a hex outside Task 1's table assertions, which read the table). Re-run the whole suite.

- [ ] **Step 6: Clean up and commit.** Stop the server, remove **only** the `whisker-walk-catbuilder` entry from the main checkout's `.claude/launch.json` (leave its other edits), delete only the scratchpad files this task created (by name, no wildcards), then:

```bash
git add src/customcats.js
git commit -m "chore(builder): swatches tuned with the playtester on the iPhone"
```

---

## Self-review

1. **Spec coverage:** §1 choices → Tasks 1, 2, 7; free / both editions → Global Constraints, Task 7 edition test; 3 cats → Tasks 1, 3, 8; editable, accessories kept → Tasks 3, 8; §3 flow, markings dim, personality blurb, Done's four effects, Not now, editing, 3-of-3 tile, naming → Tasks 7, 8; §4.1 save, sanitising, API, cloud, known risk → Task 3 and ruling 4; §4.2 drawing table and palette → Tasks 1, 2; §4.3 personality rows, `activeCat`, readers → Tasks 1, 4; §4.4 wire, old and new builds, map dot, re-track → Task 5; §4.5 editions → Task 7; §4.6 dressing room, thumbnails, album (nothing to do), friends/ghosts, visit celebration, family cats → Tasks 4, 5, 6, 8; §5 constraints → Tasks 2, Global Constraints; §6 left to the builder → Task 9 (swatches, layout), rulings 8, 12, Task 2 (tail fluff 1.3, patch colours); owner's answers → Global Constraints; builder-check fixes → rulings 1–4.
2. **The roster and tags:** the owner's answers override spec §4.6's "walk roster takes `activeCat().name`": the roster and a co-walker's tag over her cat show her pet name (ruling 15); only her own screen shows the cat's name (ruling 14).
3. **Types:** `Look`, `CustomCat`, `Builder` and the function names match across Tasks 1–8 (`activeCat`, `catProfileFields`, `wireLook`, `lookKey`, `presetFor`, `customThumbnails`, `retrackProfile`, `updateProfile`, `handleInput`, `onProfileChange`).
