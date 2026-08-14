# Whisker Walk v11 "Cat Couture" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn accessories into a layered six-slot dress-up system and add 12 new items, migrating existing saves without loss.

**Architecture:** The `outfit` slot splits into `head/face/neck/body/back/feet` in `CATALOG.accessories`; `equipped` grows to one key per slot and the save version bumps 3→4 with a migration that re-homes each old `outfit` value into its item's new slot. `equipAccessory`/`unequip` already key off `item.slot` and need no change. `src/cat/model.js` gains per-slot procedural geometry attached at the right anchors; `homebase.js` groups accessory cards by slot.

**Tech Stack:** Vanilla ES modules, Three.js, Vitest. No new deps. No backend/SQL change.

**Spec:** `docs/superpowers/specs/2026-08-14-whisker-walk-v11-cat-couture.md`.

## Global Constraints

- **No player loses an accessory or unlock.** The 3→4 migration maps the old `equipped.outfit` into that item's new slot (bandana→neck, booties→feet, backpack→back, crown→head) and preserves `collar`, unlocks, points, friends, petName. This is the highest-risk change in the wave — it is TDD'd first, before any rendering work.
- **Per-slot validation:** in `sanitizeState`, a slot's value survives only if it is a string, is in the unlocked list, AND `CATALOG.accessories[value].slot` equals that slot key — otherwise `null`. Never throw on a malformed payload (same posture as the existing sanitize).
- **Art direction preserved:** new geometry is flat, chunky, low-poly, in the game's palette; every item scales with the breed `scale` factor; head/face items attach to the **head group** so they animate with the head.
- **Hagrid (chicken) degrades gracefully** — wears what fits, silently skips the rest, never crashes and never leaves floating geometry.
- Tests + `npx vite build` green every commit. **Baseline: 218 tests (30 files).**
- No multiplayer/backend/SQL changes. Remote pets already carry an `accessories` object; it simply gains keys.

---

### Task 1: Catalog slots + save v4 migration + per-slot sanitize (TDD)

**Files:** modify `src/progression.js`; test `test/progression.test.js`.

**Interfaces produced:** `CATALOG.accessories[id].slot ∈ {collar,head,face,neck,body,back,feet}`; `equipped = { cat, collar, head, face, neck, body, back, feet }`; `SAVE_VERSION = 4`.

- [ ] **Step 1: Write the failing tests** — append to `test/progression.test.js` (use the file's existing storage-fake helper; mirror its style):

```js
describe('v11 slots + save migration', () => {
  const SLOTS = ['head', 'face', 'neck', 'body', 'back', 'feet'];

  it('every accessory has a valid slot, and ids are unique with sane prices', () => {
    const seen = new Set();
    for (const [id, a] of Object.entries(CATALOG.accessories)) {
      expect(['collar', ...SLOTS]).toContain(a.slot);
      expect(typeof a.name).toBe('string');
      expect(a.price).toBeGreaterThanOrEqual(0);
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('re-homes the old outfit item into its new slot on a v3 save', () => {
    const cases = [['bandana', 'neck'], ['booties', 'feet'], ['backpack', 'back'], ['crown', 'head']];
    for (const [item, slot] of cases) {
      const store = fakeStorage();
      store.setItem('whisker-walk-save', JSON.stringify({
        version: 3, points: 120, lifetimePoints: 300, bestWalk: 40, area: 'neighborhood',
        walks: {}, friends: {}, petName: 'Zeetoo', discovered: [],
        unlocked: { cats: ['tabby'], accessories: ['bell', item], areas: ['neighborhood'] },
        equipped: { cat: 'tabby', collar: 'bell', outfit: item },
      }));
      const p = createProgression(store);
      expect(p.state.version).toBe(4);
      expect(p.state.equipped[slot]).toBe(item);   // re-homed, not lost
      expect(p.state.equipped.collar).toBe('bell'); // collar preserved
      expect(p.state.equipped.outfit).toBeUndefined();
      expect(p.state.points).toBe(120);             // progress preserved
      expect(p.state.petName).toBe('Zeetoo');
      expect(p.state.unlocked.accessories).toContain(item);
    }
  });

  it('a v3 save with no outfit migrates with every new slot null', () => {
    const store = fakeStorage();
    store.setItem('whisker-walk-save', JSON.stringify({
      version: 3, points: 10, lifetimePoints: 10, bestWalk: 0, area: 'neighborhood',
      walks: {}, friends: {}, petName: null, discovered: [],
      unlocked: { cats: ['tabby'], accessories: ['bell'], areas: ['neighborhood'] },
      equipped: { cat: 'tabby', collar: 'bell', outfit: null },
    }));
    const p = createProgression(store);
    for (const s of SLOTS) expect(p.state.equipped[s]).toBeNull();
  });

  it('rejects a wrong-slot, unowned, or garbage value per slot without throwing', () => {
    const store = fakeStorage();
    store.setItem('whisker-walk-save', JSON.stringify({
      version: 4, points: 0, lifetimePoints: 0, bestWalk: 0, area: 'neighborhood',
      walks: {}, friends: {}, petName: null, discovered: [],
      unlocked: { cats: ['tabby'], accessories: ['bell', 'tophat'], areas: ['neighborhood'] },
      equipped: { cat: 'tabby', collar: 'bell', head: 'bandana', face: 'nope', neck: 42, body: null, back: null, feet: 'sneakers' },
    }));
    const p = createProgression(store);
    expect(p.state.equipped.head).toBeNull();  // bandana is a neck item, not head
    expect(p.state.equipped.face).toBeNull();  // unknown id
    expect(p.state.equipped.neck).toBeNull();  // not a string
    expect(p.state.equipped.feet).toBeNull();  // sneakers not unlocked
    expect(p.state.equipped.collar).toBe('bell');
  });

  it('equips and unequips independently per slot', () => {
    const store = fakeStorage();
    const p = createProgression(store);
    p.state.unlocked.accessories.push('tophat', 'necktie');
    p.equipAccessory('tophat');
    p.equipAccessory('necktie');
    expect(p.state.equipped.head).toBe('tophat');
    expect(p.state.equipped.neck).toBe('necktie');
    p.unequip('head');
    expect(p.state.equipped.head).toBeNull();
    expect(p.state.equipped.neck).toBe('necktie'); // other slots untouched
  });
});
```

- [ ] **Step 2: Run, verify failure** — `npx vitest run test/progression.test.js` → FAIL (`tophat` unknown, `equipped.head` undefined).

- [ ] **Step 3: Implement in `src/progression.js`:**

1. `const SAVE_VERSION = 4; // v4: per-slot cosmetic accessories`
2. Re-home the four existing items and add the twelve new ones in `CATALOG.accessories` (exact ids/names/slots/prices from the spec table):
   `bandana`→`slot:'neck'`, `booties`→`slot:'feet'`, `backpack`→`slot:'back'`, `crown`→`slot:'head'`; new: `tophat`(head,30), `beanie`(head,20), `glasses`(face,25), `sunglasses`(face,25), `necktie`(neck,25), `bowtie`(neck,25), `scarf`(neck,30), `hoodie`(body,35), `cape`(body,40), `wings`(back,45), `sneakers`(feet,25), `rainboots`(feet,25).
3. `defaultState()`: `equipped: { cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null }`.
4. `sanitizeState`: replace the single `outfit` check with a loop over the six slots applying the per-slot rule (string + unlocked + `CATALOG.accessories[v]?.slot === slot`), keeping the existing `collar` check as-is.
5. Migration in the loader, beside the existing v2→v3 branch:

```js
      if (parsed && parsed.version === 3) {
        // v3 → v4: the single `outfit` slot became six cosmetic slots.
        // Re-home the equipped outfit item into whatever slot its catalog
        // entry now uses, so nobody loses the accessory they were wearing.
        const worn = parsed.equipped?.outfit;
        const slot = typeof worn === 'string' ? CATALOG.accessories[worn]?.slot : null;
        const { outfit, ...rest } = parsed.equipped ?? {};
        return sanitizeState({
          ...parsed,
          version: 4,
          equipped: { ...rest, ...(slot ? { [slot]: worn } : {}) },
        });
      }
```

   Keep the v2 branch working — a v2 save must migrate 2→3→4 (route it through the same v3 logic rather than duplicating; simplest: have the v2 branch produce a v3-shaped object and fall through to the v3 branch).

- [ ] **Step 4: Run tests, verify pass** — `npx vitest run test/progression.test.js`, then the full suite.
- [ ] **Step 5: Commit** — `git add src/progression.js test/progression.test.js && git commit -m "feat: six cosmetic accessory slots with v4 save migration"`

---

### Task 2: Render the new items on the cat

**Files:** modify `src/cat/model.js`.

**Interfaces consumed:** `buildCat(breed, accessories, opts)` receives the full `equipped`-shaped object (now with six slot keys); `buildChicken(accessories)` likewise.

- [ ] **Step 1: Read the file first** and note: the `mat()` helper, the root group, the **head group**, the breed `scale` factor, the existing collar/outfit rendering, and `buildChicken`'s accessory block. Attach new geometry using the same idioms — do not restructure the model.

- [ ] **Step 2: Add a per-slot render block** for each of the 12 new items plus the four re-homed ones. Anchors:
  - **head** (`tophat`, `beanie`, `crown`): on the head group, above the skull; hats sit between the ears.
  - **face** (`glasses`, `sunglasses`): on the head group at eye level — two small rounded frames plus a bridge; sunglasses use the dark palette (`#26262e`), round glasses a thin warm frame.
  - **neck** (`necktie`, `bowtie`, `scarf`, `bandana`): at the neck seam; the necktie is a small knot + a tapered blade hanging down the chest, the bowtie two small triangles + a centre knot, the scarf a wrapped band with a short tail.
  - **body** (`hoodie`, `cape`): over the torso; the cape drapes behind and down, the hoodie is a torso shell **plus a hood** — see Step 3.
  - **back** (`wings`, `backpack`): behind the shoulders; wings are two flat translucent-ish panels angled up and out (use the coral/sage accent palette), gently mirrored.
  - **feet** (`sneakers`, `rainboots`, `booties`): small shells on the paw positions.

  Every item's dimensions/offsets must multiply by the breed `scale` so it fits a Persian and a Maine Coon.

- [ ] **Step 3: The hoodie hood rule.** When rendering `body === 'hoodie'`, draw the hood **up** (a rounded shell behind/over the head) **only if no head item is equipped**; if a head item is present, draw the hood **down** (a small bunched collar at the neck) so the hat is unobstructed. Decide this from the same `accessories` object already passed in — no new parameter.

- [ ] **Step 4: Hagrid.** In `buildChicken`, render only the items that fit a chicken — head, face, and neck items (a chicken in a bowtie is the joke) — and **explicitly skip** body/back/feet items with a short comment saying why. No crash, no floating geometry, no console noise for the skipped ones.

- [ ] **Step 5: Verify** — `npx vitest run` (218+ green; this task adds no unit tests, model rendering is browser-verified) and `npx vite build` (exit 0).

- [ ] **Step 6: Commit** — `git add src/cat/model.js && git commit -m "feat: procedural geometry for the new accessory slots"`

---

### Task 3: Slot-grouped Accessories UI + thumbnails

**Files:** modify `src/ui/homebase.js`; `src/thumbnails.js` if the new items need thumbnail entries.

- [ ] **Step 1: Group the Accessories cards by slot** in the Play panel: headings in the order **Collar · Head · Face · Neck · Body · Back · Feet**, each listing that slot's catalog items using the existing `card('accessories', id, item, …)` helper unchanged. A slot with no owned items still shows its locked cards (same as today's behavior for locked items).

- [ ] **Step 2: Fix the "equipped" label per slot.** The card's `selected` check currently compares `s.equipped[item.slot] === id` — confirm this still holds with the new slot names (it should, since it reads `item.slot`), and that "Take off" unequips the correct slot.

- [ ] **Step 3: Thumbnails.** Ensure `menuThumbnails()` produces an image for each new accessory the same way it does for the current six. If thumbnails are generated by rendering the item on a cat, the new items ride along automatically once Task 2 lands — verify rather than assume, and add entries if the generator uses an explicit list.

- [ ] **Step 4: Verify** — `npx vitest run` + `npx vite build` green.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: slot-grouped accessories UI"`

---

### Task 4: Review, verify, release

- [ ] Full regression `npx vitest run` + `npx vite build`.
- [ ] Final whole-branch review (most capable model) focused on: **the save migration cannot lose an accessory, an unlock, or progress** (including the v2→v3→v4 path and cloud-loaded payloads); per-slot sanitize rejects wrong-slot/unowned/garbage without throwing; no crash or floating geometry on Hagrid; head/face items animate with the head; breed scaling; art direction preserved.
- [ ] One fix wave + one scoped re-review if findings.
- [ ] Browser verification + screenshots: a fully-dressed cat (hat + glasses + tie + hoodie + wings + shoes), the hoodie hood flipping with the head slot, Hagrid in a bowtie, and the grouped UI.
- [ ] Merge to `main`, push, confirm the Pages deploy is green.

## Plan Self-Review Notes

- **Spec coverage:** six slots + re-homing → T1; 12 items with exact ids/prices/perks → T1 (catalog) + T2 (geometry); save v4 migration + per-slot sanitize → T1 (TDD, first); hood rule → T2 Step 3; Hagrid graceful skip → T2 Step 4; slot-grouped UI + thumbnails → T3; browser proof → T4.
- **Risk ordering:** the migration is the only change that can destroy player data, so it is Task 1 and is the only task with mandatory failing-test-first TDD. Rendering/UI are browser-verified per this repo's convention (no DOM/WebGL test harness).
- **Type consistency:** slot names `head/face/neck/body/back/feet` (+`collar`) are identical across the catalog, `equipped`, sanitize, migration, model rendering, and the UI grouping order. Item ids used in tests (`tophat`, `necktie`, `sneakers`) match the catalog ids specified in T1 Step 3.
- **Reuse guard:** `equipAccessory`/`unequip` are already slot-generic and must NOT be rewritten; `card()` in homebase is reused unchanged; the existing `collar` sanitize rule stays as-is.
- **Perk note:** only `hoodie` and `cape` carry new perks; wings are cosmetic because the crown already owns the butterfly trail. Implementers should not invent perks for the other ten.
