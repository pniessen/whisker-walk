# Whisker Walk: Make Your Own Cat (design)

Date: 2026-10-31. Status: design only, no product code. Built against the `woods` branch (main plus Clan Edition and the Woods), because that branch changes the dressing room.

## 1. Intent and why

The older playtester asked for it: they want to make their own cat from scratch, give it a name, and then dress it up the way they dress cats today. The younger playtester gets the same builder. Each kid plays on their own iPhone, and sometimes they walk together.

The owner and the older playtester have already decided the following. These decisions are binding:

- They **build the cat first** and then **accessorises it in the dressing room**, exactly as cats are dressed today. The builder is the step before accessorising.
- **The choices are:** coat colour, markings colour, pattern (Solid, Tabby stripes, Pointed, Patches, White socks), fur (Short, Fluffy, Long-haired), eye colour, size (small to big), a name, and a personality.
- **The personality is one of the six that already exist:** keen nose, chaser, pouncer, napper, fearless or steady. A custom cat is never stronger than a ready-made one. That keeps things fair for the younger playtester.
- **The builder is free from the start** and works the same in Legacy and Clan Edition.
- **Each kid can have up to 3 custom cats.**
- **They can edit a cat any time:** looks, personality or name. Its accessories stay on.
- The clickable sketch they liked sets the rows and the "Done, now dress it up →" button. Its swatch colours are placeholders.

## 2. Goals, non-goals, anti-goals

**Goals**
- They can make a cat that looks like them, walk it, dress it and show it to the partner on a co-walk.
- A custom cat plays exactly like the ready-made cat that has the same personality.
- Each kid keeps up to three custom cats. They can change any of them later.

**Non-goals**
- No free colour wheel. The swatches are a fixed, hand-picked palette (see §4.2).
- No family-cat coats (Robbie's cow pattern, D2's shoulder band, Digit's long legs and big ears) and no chickens. The family cats stay one of a kind.
- Custom cats get no voice of their own. A custom cat meows with its personality's voice.
- Strays, colony cats, rivals and Mochi never use custom looks.

**Anti-goals (things this must never do)**
- **Make a custom cat stronger than a preset.** A custom cat's speed, nose, napping and bravery come from one of the six preset rows, unchanged.
- **Lose an existing cat or accessory.** Bought cats, the equipped cat and every accessory are untouched. Accessories belong to the kid, not to a cat, so they cannot be lost by switching or editing cats.
- **Break co-walks with an older build.** An older build sees a ready-made cat with the same accessories and name, and nothing more.
- **Need a server change.** Nothing new goes into Supabase tables or functions.

## 3. What she sees

### The flow
1. **The dressing room's cat strip** keeps the ready-made portraits. After them come the player's own cats, then a **"＋ Make a cat"** tile.
2. **Tapping ＋ opens the builder.** The live 3D cat stays on top, on the same stage the dressing room uses today. The sketch's rows sit below it:
   - Coat colour, Markings colour, Pattern, Fur, Eyes, Size, Personality, Name.

   Every tap changes the cat at once. On a new cat, the stage shows the cat without accessories so the coat is easy to see. The cat starts as a ginger tabby with green eyes, medium size and Keen nose, with an empty name.
3. **The Markings row dims for Solid and White socks**, with the note "Solid cats have no markings" or "Socks are always white". The player's choice is remembered, so switching back to Tabby brings it back.
4. **The Personality row** shows the six choices. The selected one shows the blurb its ready-made cat already uses, for example "Brave — nothing spooks this cat".
5. **"Done, now dress it up →"** stays greyed until the name is valid (see Naming below). Tapping it does four things:
   - saves the cat;
   - makes it the cat the player walks;
   - returns the player to the dressing room on the Wearing panel;
   - shows the cat in the player's current outfit.
6. **"✕ Not now"** leaves the builder. If the player has changed anything, it asks once: "Leave without saving?" A brand-new cat is not saved. An edit keeps the old version.

### Editing later
When one of the player's cats is on show, the hero shows **"✏️ Change my cat"**, in the spot where ready-made cats show "Unlock". That button opens the builder with every row filled in from that cat. Done saves over it. Accessories are never touched: they are already per kid, not per cat (`state.equipped` holds one outfit).

### At three cats
The ＋ tile turns into a soft, greyed tile that reads "3 of 3 — change one of yours for a new look". There is no delete button in this version. Editing does everything a delete would, and nothing can disappear because of a mis-tap. See open question 3.

### Naming rules
Custom cat names use the game's existing rule, `validPetName` in `src/net.js`:
- 2–16 characters;
- starts with a letter;
- only letters, spaces and hyphens;
- no word from `NAME_BLOCKLIST` (a substring match).

The hint under the field reuses the pet-name sheet's exact words: "Pet names are 2–16 letters, spaces, or hyphens." Using the same rule matters for co-walks. Every build, old or new, already accepts any name that passes it, so the partner's phone never shows "Mystery Cat" instead. Two of the player's cats may share a name. A custom cat may share a name with a stray, because a custom cat never enters the colony, which is the only place stray names are keys.

## 4. How it's built

### 4.1 The save (SAVE_VERSION stays 4)
The change adds two additive fields, sanitised independently with defaults, on the same terms as `colony`, `edition` and the rest:

```js
state.customCats = [            // 0..3 entries, in the order the player made them
  { id: 'mine1',                 // 'mine1' | 'mine2' | 'mine3', unique
    name: 'Ember',               // passes validPetName
    personality: 'keenNose',     // one of the six preset specials
    look: { coat: 'ginger', marks: 'chocolate', pattern: 'stripes',
            fur: 'short', eyes: 'green', size: 1.0 } },
];
state.equipped.custom = null;    // or 'mine1'..'mine3': the player is walking that cat
```

- **`equipped.cat` stays a ready-made cat id.** It is never a custom id. Every existing reader keeps working, and `sanitizeState`'s rule that the equipped cat must be unlocked still holds. An older build that meets this save sees a valid preset.
- **Choosing a ready-made portrait** clears `equipped.custom`. **Choosing one of the player's own** sets it and leaves `equipped.cat` alone.
- **Sanitising never drops a cat for one bad field.** Each bad field is repaired on its own:
  - an unknown swatch falls back to the default for that field;
  - size is clamped to 0.85–1.15 and snapped to steps of 0.05;
  - a bad personality becomes keenNose;
  - an invalid name becomes "My Cat".

  An entry is dropped only when:
  - it is not an object;
  - its id is a duplicate or not one of the three;
  - or it comes after the third.

  `equipped.custom` survives only if it names a cat that survived.
- **New API on progression:**
  - `createCustomCat(fields)` returns the new id, or null when the player already has 3;
  - `updateCustomCat(id, fields)`;
  - `equipCustom(id)`;
  - `equipCat(id)` also clears `equipped.custom`.

  Each saves once.
- **Cloud.** The custom cats travel inside the save payload with no other change. In `replaceFromPayload`, a payload that has *no* `customCats` key at all was written by an older build, so this phone's custom cats are kept. Visits already get the same kind of protection. A payload that has the key is taken as it is, which is a normal restore.
- **A known risk with every additive field.** An older build that loads the save and writes it back drops fields it does not know about. The service worker (`main.js`) can briefly serve a stale build. The cloud rule above covers the realistic path, which is restoring on a phone that has not updated yet. This risk is the same one `colony` and `edition` already accept.

### 4.2 Drawing each choice (`src/cat/model.js`)
`buildCat(breed, accessories, opts)` gains `opts.look`. With a look, the STYLE row comes from `lookToStyle(look)` instead of `STYLE[breed]`, and everything downstream draws it unchanged. That includes the markings queue, the tail, the paws, accessories and the final `g.scale`. Without a look, every preset cat stays byte-identical, and the existing determinism test pins that.

| Choice | How it's drawn | New drawing? |
|---|---|---|
| Coat colour | `base`. `belly` is a lighter partner colour, hand-set per swatch in the palette table (not computed) | No |
| Markings colour | `accent` | No |
| Solid | no flags (like `black`) | No |
| Tabby stripes | `stripes` + `headStripes` (the forehead "M", which Zeetoo, D2 and Digit already have) | No |
| Pointed | `points` (face, ears, legs, paws and tail tip in the markings colour, like `siamese`) | No |
| Patches | `patches`, drawn in the markings colour alone, so both body patches and the head patch use one colour (the calico's hard-coded orange and grey stay calico-only) | Small: the patch colours become parameters |
| White socks | `socks` (white paws) + `chin`, plus a white chest bib, which reuses the bib patch from Robbie's `cow` block | Small: the bib becomes its own flag |
| Short fur | none | No |
| Fluffy | `fluffy` (the ruff, like Persian) | No |
| Long-haired | `fluffy` + `tufts` (Maine Coon ear tufts) + a bushier tail: a `tailFluff` factor on `tailR`, so the same five segments are just thicker | Small: one radius factor |
| Eyes | a new `eyes` field on the style row, read before `EYE_COLORS[breed]` | Small: one lookup |
| Size | `scale`, 0.85–1.15. Size is cosmetic only; nothing in movement, collisions or climbing reads the cat's scale | No |

**The palette.** A small DOM-free module, `src/customcats.js` (no THREE, so `progression.js` can import it), holds:
- the swatch tables, as id → hex: `COATS` (with each coat's belly partner), `MARKS` and `EYES`;
- the personality→preset table;
- `sanitizeLook`, `sanitizeCustomCats`, `lookToStyle` and `activeCat`.

Storing swatch *ids* rather than hex values keeps the save and the wire small and validatable. It also means a later colour tweak reaches every cat already made. The swatches start from colours the world already uses, so custom cats sit in the same lighting:
- coats: brown tabby `0x9c7a4f`, black `0x2a2a30`, cream `0xf0ead8`, silver `0xcfcfd4`, seal cream `0xe8dcc8`, plus ginger, blue-grey and apricot to tune;
- eyes: green `0x4e9440`, gold `0xd8b830`, blue `0x68a8d8`, plus a new copper.

### 4.3 Personality: one preset row, unchanged
| Personality | Plays exactly as |
|---|---|
| Keen nose | `tabby` |
| Chaser | `siamese` |
| Napper | `persian` |
| Fearless | `black` |
| Pouncer | `calico` |
| Steady | `mainecoon` |

**One function decides which cat a walk uses:** `activeCat(state)` returns `{ breed, look, name }`.
- For a ready-made cat it returns `{ equipped.cat, null, petName }`.
- For a custom cat it returns `{ the mapped preset, its look, its name }`.

The walk builds the cat with `buildCat(breed, outfit, { look })`. It sets `userData.breed` to the mapped preset and adds `userData.custom` with the cat's id. Every existing `PERSONALITIES[cat.userData.breed]` reader therefore gets the preset's own numbers with no change. Those readers are the walk pace in `walk.js`, nose ranges, napping, the dog rule, puddles, pounce perks, voices and replies. Family-cat rows (Zeetoo's longer nose, Digit's speed) can never be picked. `src/skills.js` keys on neither breed nor special, so skills work identically.

`walk.js` today reads `state.equipped.cat` directly, at line 486 for the build and line 499 for the pace. Both switch to `activeCat`, and so does `rooms.js`'s profile code. That is the whole list of direct readers.

### 4.4 Co-walks and the profile on the wire
Today `rooms.js` sends `{ playerId, petName, breed: equipped.cat, accessories: {7 slots} }`, both as the room presence profile and as the cloud profile (`pushProfile` → `profiles.breed` / `profiles.accessories jsonb`).

**The change.** One helper builds both profiles from `activeCat`:
- `breed` is the mapped preset;
- `petName` is the cat's name (see open question 2);
- `accessories` gets one extra key, `look`, holding the six swatch ids and the size.

`look` is about 120 bytes and is sent only when a custom cat is active.

**Why inside `accessories`.**
- **No server change.** `accessories` is already a free-form jsonb column with no shape check in `upsert_profile`, so ghosts and the friend list get the look with no server change.
- **Rebuilds come free.** `remotecats.js`'s `profileUnchanged` already compares the whole accessories object, so a changed look rebuilds the partner's cat.

**What an older build does.**
- `sanitizeProfile` accepts the preset breed and the name, which passes the same `validPetName`.
- It passes the accessories object to `buildCat`, which reads only the seven named slot keys and ignores `look`.

So the partner sees a Tabby (or Siamese, or the right preset) in her outfit, labelled with the cat's name. Nothing throws, and nothing desyncs.

**What a new build does.**
- `sanitizeProfile` and `sanitizeGhostProfile` add `look = sanitizeLook(accessories.look)`.
- A look that is invalid, or comes from a newer build with swatches this build doesn't know, falls back field by field. A missing look means the plain preset.
- The remote cat is built `{ simple: true, look }`.
- The corner-map dot uses the look's coat colour: `coatColor(breed, look)`.

The room profile is tracked at join (`rooms.js`). If the player finishes the builder while a room is open, the profile is re-tracked. Otherwise the new look shows at the next join.

### 4.5 Editions
`src/edition.js` has no part in this. The builder, the save and the wire are identical in Legacy and Clan Edition. The builder's labels must avoid the borrowed words that `test/clanwords.test.js` scans for. The star-name picker stays on the pet-name sheet and is not added to the builder, so both editions show the same builder.

### 4.6 Where the player's cat matters, and how a custom cat flows through
- **Walk (solo and co-walk):** `activeCat` drives the build, the pace and every personality check (§4.3). The meow event sends the preset breed, so the partner hears that preset's voice. The one visible leftover is the pouncer perk line "a Calico masterclass", which a custom pouncer also sees. The builder may reword it to "a pouncer's masterclass".
- **Dressing room:** these changes go in the woods versions of `dressingroom.js` and `dressingroomview.js`.
  - `buildDressingModel` adds `mine: [{ id, name, selected }]`, `canMake` and a custom hero: name, the personality blurb from `CAT_BLURBS[preset]`, and an edit button instead of a price.
  - `catstage.show(breed, accessories, look)` passes the look through. The last-shown key includes it.
  - `handleClick` grows `data-dr-mine`, `data-dr-make` and `data-dr-edit`.
  - Preview and try-on behave as they do today.
- **Thumbnails:** `menuThumbnails` snaps presets once at start. Custom portraits are snapped on demand with the same `snap()` after Done and cached in memory by look, never saved. If WebGL fails, the stage's fallback image is the preset's thumbnail.
- **Colony, strays, rival cats, den cats, Mochi:** none of them read the player's breed or look. They build from `strayBreed(name)` or their own models, and that does not change.
- **Album:** photos store an image, a spot label, an area and a date, never a breed. A custom cat appears in photos as drawn, and nothing else changes.
- **Friends and ghosts:** ghosts come from the cloud profile, so new builds see the look (§4.4). The friend list's "— tabby" text shows the preset word, which is acceptable.
- **Visit celebration and walk roster:** both take their name from `activeCat().name`.
- **Family cats (Robbie, D2, Digit, Zeetoo, Hagrid):** they stay buy-only presets with their own coats, numbers and recorded voices. The builder reuses some of their drawing flags (`socks`, `chin`, `headStripes`, the bib), but none of their unique combinations, proportions or stats. Rosa's farewell reads `CATALOG.cats[equipped.cat]`, which is still always a preset.

## 5. Constraints
- **Draw calls.** Every custom combination must cost no more meshes than the dearest ordinary preset: Calico at 33. Measured on woods:
  - Solid on the plain body: 30 meshes (Black);
  - the ruff adds 1;
  - stripes plus the "M" add 2;
  - single-colour patches add 2;
  - socks (bib plus chin) add 2;
  - Pointed adds 0.

  The worst case is 33. `test/catmodel.test.js` gains a loop over every pattern × fur combination, with ceiling 33 full and 27 `simple`. Colours never change the count.
- **Determinism:** the same look builds byte-identical geometry, because co-walkers must draw each other's cats the same way. This is added to the existing determinism test.
- **No new dependencies.** The builder uses Three.js 0.185 as already installed, plus plain DOM.
- **SAVE_VERSION stays 4.** Only additive fields with defaults.

## 6. Left to the builder
- Final swatch hexes, checked in the walk's real lighting on the iPhone, with the player picking.
- The builder's layout inside the woods dressing room on phone and desktop, reusing the one WebGL stage (never a second canvas).
- Exact patch, bib and tail-fluff numbers, keeping the z-fight rule: two patches at one lift must not overlap.
- Re-tracking the room profile after Done while a room is open.
- Rewording the "Calico masterclass" line.
- Tests:
  - the sanitiser (junk, 4+ cats, duplicate ids, a bad field repaired rather than dropped);
  - `activeCat`;
  - the wire fallback against the old `sanitizeProfile`;
  - the mesh-ceiling loop;
  - determinism;
  - `replaceFromPayload` keeping cats when the key is missing;
  - dressing-model and controller tests for make, edit and the 3-cat tile.

## 7. Open questions for the owner (ranked)
1. **Personalities the player hasn't bought.** Fearless, Pouncer and Steady belong to Black Cat, Calico and Maine Coon, which cost 45, 45 and 60 paws. Reading "free from the start, any of the six" literally, a custom cat can have them right away. Buying those three would then only buy their looks. **Recommended: yes, all six from the start, as decided.** Say if you'd rather lock a personality until its cat is bought.
2. **Whose name does the partner see?** While the player walks their cat Ember, the design shows "Ember" on the cat's name tag in co-walks, ghosts and the roster. The colony panel, which names the player, keeps the player's usual pet name. The alternative is to keep her usual pet name everywhere.
3. **No delete at 3 cats.** At 3, the player changes one of their cats instead of deleting it. Is that OK, or should there be a "let this cat go" button with a confirm?

---

## Owner's answers (2026-10-31): these settle §7's open questions

1. **Co-walk name:** the partner sees **the player's usual pet name** whichever cat the player walks as. The custom cat's name shows only on the player's own screen. The profile's `pet_name` (ghosts, friend list, walk log, reply seeds) never changes when she switches cats, so the plan must not reuse `petName` for the cat's name.
2. **Personalities:** **all six are open from the start**, whether or not the player owns the matching ready-made cat ("free from the start"). The Personality row has no locked state and no buy path.
3. **At 3 custom cats:** **no delete button.** The player makes a new cat by reopening the builder on one of their three and changing it. No removal API, no id reuse, and no confirm UI.

## Fixes from the builder check (to apply in the plan)

- **Golden fingerprints:** the existing determinism test only checks that a preset builds the same twice in one run. The plan must add golden fingerprints of every preset before touching `model.js` (the cat body plan already does; reuse them).
- **More direct readers of `equipped.cat`:**
  - `src/ui/dressingroom.js` (selected portrait and hero);
  - the retired-cat farewell in `progression.js`.
- **`sanitizeState` rebuilds `equipped`** as `{cat, collar, …slots}`, so `equipped.custom` must be added there explicitly or it is silently dropped.
- **Cloud restore is manual only** (`cloudsync.js`: "Load from cloud"). The older-build mitigation is narrower than §4 implies; say so.
- **Ordering:** the cat body reshape (docs/superpowers/plans/2026-10-31-cat-body.md) lands first. The builder's mesh ceilings drop from 33/27 to 31/25, because body patterns are painted and free.
