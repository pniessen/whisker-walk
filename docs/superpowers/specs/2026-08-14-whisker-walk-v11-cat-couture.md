# Whisker Walk v11 — "Cat Couture" — Design Spec

**Date:** 2026-08-14
**Status:** Approved (design + mockups reviewed by the user's tester panel)
**Base:** deployed game at v10 + Phase 0 renderer.

## Summary

Tester feedback asked for more ways to customize your cat. This wave turns
accessories from a one-at-a-time trinket into a **layered dress-up system**:
six cosmetic slots a cat can wear **simultaneously**, plus ~12 new items
(necktie, bowtie, purple hoodie, butterfly wings, footwear, and more).
Most items are **cosmetic only**; a few carry a small flavor perk.

## Design decisions (locked)

- **Multi-slot outfits.** The single `outfit` slot becomes six layered slots:
  **head · face · neck · body · back · feet**. The existing `collar` slot is
  unchanged. A cat wears at most one item per slot, so players build looks.
- **Cosmetic + light perks.** Most new items are look-only and cheap. A
  handful carry a small flavor perk (see below). No item meaningfully shifts
  game balance.
- **The existing six accessories re-home into the new slots** and therefore
  now stack with each other (a bandana + crown + booties is a legal outfit,
  where before it was one of the three).

## Slots and items

Existing (re-homed, perks unchanged):

| Item | Old slot | New slot | Perk (kept) |
|---|---|---|---|
| Bell Collar | collar | collar | birds come closer |
| Glow Collar | collar | collar | unlocks dusk walks |
| Bandana | outfit | **neck** | neighbors wave back |
| Rain Booties | outfit | **feet** | puddles become splashes |
| Tiny Backpack | outfit | **back** | carry one extra collectible |
| Flower Crown | outfit | **head** | butterflies trail your cat |

New (12):

| Item | Slot | Price | Perk |
|---|---|---|---|
| Top Hat | head | 30 | — |
| Beanie | head | 20 | — |
| Round Glasses | face | 25 | — |
| Sunglasses | face | 25 | — |
| Necktie | neck | 25 | — |
| Bowtie | neck | 25 | — |
| Knit Scarf | neck | 30 | — |
| Purple Hoodie | body | 35 | cozier dusk (dusk walks read warmer) |
| Superhero Cape | body | 40 | zoomie sparkle trail when running |
| Butterfly Wings | back | 45 | — (cosmetic; the Flower Crown already owns the butterfly-trail perk) |
| Sneakers | feet | 25 | — |
| Rain Boots | feet | 25 | — |

Ten of twelve are purely cosmetic; two carry light flavor perks (hoodie,
cape). Perks are deliberately non-overlapping with the existing six.

**The hoodie's hood.** The hoodie occupies the `body` slot. Its hood renders
**up when the head slot is empty** (the cute default the panel approved) and
**down when a head item is equipped**, so hats still stack. This is decided
at render time from the equipped set — no extra item, no slot conflict.

## Save format + migration (the load-bearing change)

`equipped` grows from `{ cat, collar, outfit }` to
`{ cat, collar, head, face, neck, body, back, feet }`. **Save version bumps
3 → 4.**

- Migration `3 → 4`: read the old `equipped.outfit` value and place it in
  that item's **new** slot (bandana→neck, booties→feet, backpack→back,
  crown→head); drop the `outfit` key. `collar` and everything else carry
  over untouched. **No player loses an accessory or an unlock.**
- `sanitizeState` validates each slot independently: a value survives only
  if it is a string, is unlocked, and its catalog `slot` matches that key —
  otherwise that slot becomes `null` (the existing per-field rule, applied
  per slot).
- `equipAccessory`/`unequip` already key off `item.slot`, so they work
  unchanged once the catalog carries the new slot names.
- Cloud saves: the same parse/migrate/sanitize path already runs on
  cloud-loaded payloads, so a v3 payload from another device migrates
  identically. A v4 payload loaded by an old client is not a concern (the
  client is the deployed one).

## Rendering

Each item is small procedural low-poly geometry attached to the existing cat
model at the right anchor (`src/cat/model.js`) — head/face pieces on the head
group, neck at the collar seam, body over the torso, back behind the
shoulders, feet at the paws. Items must:

- follow the existing flat, chunky, low-poly art direction and the game's
  palette;
- scale with the breed's `scale` factor so they fit a Persian and a Maine
  Coon alike;
- attach to the head group (not the body) for head/face items so they move
  with head animation;
- degrade gracefully on **Hagrid the chicken** — he wears what fits (hats,
  neckwear, glasses) and silently skips what doesn't (no crash, no floating
  geometry). Skipping is per-item and explicit.

## UI

The Play tab's **Accessories** section groups cards by slot with headings —
Head / Face / Neck / Body / Back / Feet / Collar — each card keeping the
existing Choose / Take off / Unlock affordances. Menu thumbnails are
generated for the new items the same way the current ones are.

## Out of scope

- Colour variants / dyes, per-item stat tuning, outfit presets or a
  "save this look" feature, trading or gifting items.
- Any change to multiplayer, backend, or SQL. (Remote pets already transmit
  their `accessories` object; it simply carries the new keys.)

## Testing

- Unit (Vitest): the **3→4 save migration** (each old `outfit` value lands in
  the correct new slot; collar/unlocks/points preserved; a corrupt or unknown
  value yields `null` for that slot, not a crash); per-slot `sanitizeState`
  validation (wrong-slot item rejected, unowned item rejected); catalog
  integrity (every accessory has a valid slot, unique id, price ≥ 0).
- Existing suite stays green (baseline 218); `npx vite build` green.
- Browser verification: each new item renders on the cat at the right anchor,
  several items worn together look right, the hoodie hood flips with the head
  slot, Hagrid skips the incompatible pieces, and the grouped Accessories UI
  equips/unequips per slot.
