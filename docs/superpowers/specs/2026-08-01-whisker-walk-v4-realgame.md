# Whisker Walk v4 — "A Real Game" — Design Spec

**Date:** 2026-08-01
**Status:** Approved by user
**Base:** post-v3 main. Five systems: persistent control bar, cat society
(≈10x strays + rich interactions), walk goals, walk summary, cat ranks.

## 1. Persistent control bar

Slim always-visible HUD strip at the bottom during walks:
`←↑↓→ move · ⇧ stalk · ␣ pounce/climb · E interact · V meow · T yarn · C camera · M mute · Esc menu`.
Muted styling; never blocks the prompt pill (prompt sits above it).

## 2. Cat society

- **Population:** ~22 strays per area (was 3). To keep draw calls sane,
  `buildCat` gains an options param `{ simple: true }` that skips whiskers,
  eye shines, inner ears, and cheeks (strays use it; your cat stays full
  detail). If the final perf check stutters, drop the count to 15.
- **Names & personalities:** every stray gets a unique name from a pool of
  ~48 ("Pickles", "Marmalade", "Baron von Fluff", …) and a personality:
  - **bold** — default behavior, walk right up.
  - **shy** — if you approach within 4 units while moving fast and not
    stalking, they scurry away; stalk or creep to greet them.
  - **playful** — if your yarn ball is active within 8 units, they run to it
    and bat it around with you.
- **Name tags:** a small canvas-sprite name label floats above a stray when
  you're within 4 units.
- **Friendship (persisted in the save, keyed by name):** greeting a cat
  (E — touch noses) records it: 1 greet = *met*, 3 = *friend*, 6 = *best
  friend* (greets counted max once per walk per cat). Level-ups toast
  ("Pickles is now your friend! 💕"). Names persist across walks so the
  same cats reappear (name pool is stable; each walk spawns a subset).
- **Gifts:** each best friend present on a walk has a ~30% roll; when you
  first come within 3 units they "bring you a gift" — `gift` award (+10).
- **Roster:** home base gains a **Cat Friends** section listing every cat
  ever met: name, breed, friendship level (♡ met / ♥ friend / 💕 best
  friend), greet count.

## 3. Walk goals

- Each walk deals 3 distinct challenge cards from a pool keyed to award
  types: spot 4 critters, collect 2 collectibles, tip 3 things, greet 3
  cats, take 2 photos, get head scratches, one yarn play session, dig 1
  treasure, sit in a box, visit 2 scenic spots.
- A small HUD goals panel (top-left, under points) shows the 3 goals with
  live progress ("Tip 3 things over — 1/3", ✓ when done).
- Completing a goal: `goal` award (+15). All three: `jackpot` (+40).
  Progress is driven off the discovery bus by award type; `goal`/`jackpot`
  awards themselves are ignored by the tracker (no recursion).

## 4. Walk summary

Ending a walk shows a summary card (overlay) before home base: points
earned this walk, discoveries made, cats met/leveled, goals completed
(with bonuses), and **NEW BEST WALK!** when the per-walk points beat the
saved record. One Continue button → home base.

## 5. Cat ranks

- Lifetime points (tracked as `lifetimePoints`, accumulating in addPoints)
  map to titles: House Cat (0) → Yard Prowler (150) → Street Smart (400)
  → Neighborhood Legend (900) → Mythical Feline (2000).
- HUD shows the current title next to the points pill; crossing a
  threshold mid-walk toasts "RANK UP — Street Smart! 🏆". Home base header
  shows the title and progress toward the next.

## Save migration

Save version bumps to 3. Version-2 saves are **migrated, not discarded**
(add `lifetimePoints` seeded from current points, `bestWalk: 0`,
`friends: {}`). Older/corrupt → fresh as before.

## Awards added

`goal: 15, jackpot: 40, gift: 10`.

## Out of scope

Cat breeding/kitten raising, rival cats/combat, trading, leaderboards
beyond best-walk, seasonal events.
