# Whisker Walk — Improvement Roadmap (v12+)

> Drafted 2026-08-13 from a full review of the live game (home base + Cozy
> Neighborhood walk, desktop and mobile layouts), the session handoff, the v11
> spec, and the gameplay/audio modules. This sequences every suggested
> improvement into themed waves sized for the existing SDD pipeline
> (brainstorm → spec → plan → subagent execution → final review). Each wave is
> ordered so it makes the *next* wave land harder.
>
> Status: proposal — nothing below is specced yet. v11 "Cat Couture" is
> already specced/planned and comes first.

## The through-line

The game's systems depth (cloud saves, co-walks, ghosts, chat, ranks, goals)
is well ahead of its *feel*. The world is sparse, the cat is static, and the
audio is oscillator bleeps — so moment-to-moment play under-sells the
engineering. For 10–12-year-old players the priority is **reactivity**: a
world and a cat that visibly and audibly respond to everything the player
does. Every wave below pushes on that.

---

## v11 — "Cat Couture" (in flight)

Already specced (`docs/superpowers/specs/2026-08-14-whisker-walk-v11-cat-couture.md`).
Six layered cosmetic slots, ~12 new items, save v3→4 migration. Ship as
planned. Everything below assumes it's landed.

---

## v12 — "Juice & Polish" (quick wins, ~days)

Small, mostly-independent changes with outsized impact. Theme: every action
the player takes gets a satisfying visual + audible response, and the whole
game gets brighter.

**Visual**
- **Palette calibration** — the deferred Phase 0 by-eye pass. Live site reads
  gray/washed-out. Levers (per the Phase 0 plan): `renderer.toneMappingExposure`
  (try 1.05–1.15) and `scene.environmentIntensity` — not `weather.js`.
- **Feedback particles** — dust poof on landing, sparkle burst on
  collect/greet/tip.
- **Score popups** — floating "+5 🐾" at the event site; points should never
  tick up silently in a corner.

**Audio** (all asset-free synthesis; see §Audio architecture at bottom)
- **Master bus** — route every sound through one master GainNode →
  DynamicsCompressorNode → small generated-impulse ConvolverNode (low wet
  outdoor reverb). Fixes the known `setVolume`-doesn't-touch-live-ambient wart
  in `src/audio.js` as a side effect.
- **Formant meow rework** — sawtooth through a swept bandpass (~1100→600Hz)
  with vibrato, replacing the square-wave slides. This is why the current meow
  bleeps: square waves are the bleep timbre.
- **Purr as a loop** — ~25Hz amplitude wobble over low filtered noise + low
  sine, running continuously during head scratches (not a one-shot).
- **Trill** — short pitch-wobbled "brrrup?" when a stray notices you.
- **Per-breed voices** — map meow pitch/filter/speed to the existing
  personalities (Siamese loud+fast, Persian low+slow); fixed signatures for
  Zeetoo/Rosa/Robbie so kids can tell whose meow they heard.
- **Collect arpeggio** — rising three-note pluck on collect; longer fanfare on
  goal jackpot.

---

## v13 — "Alive World" (visual + ambient wave)

Theme: the world stops being a flat green void. Pure content density plus
atmosphere; no new mechanics.

**World density** (`src/world/builder.js` — more of what it already does)
- Sidewalks with seam lines, picket fences, flower beds at house corners,
  bushes, mailbox clusters, fallen leaves, parked bike, more varied trees.

**Living sky & time-of-day**
- Drifting clouds; occasional birds crossing overhead.
- Dusk: fireflies + warm window lights turning on in houses (makes glow-collar
  dusk walks and the v11 hoodie's "cozier dusk" perk land).

**Layered ambience** (replaces the `setInterval` bleep-chirps)
- Neighborhood: continuous wind-through-leaves (filtered noise, same
  technique as the existing seaside waves), sparse bird calls, rare distant dog.
- Seaside: keep the wave synth (best sound in the game), add seagulls.
- Dusk anywhere: crossfade to synthesized crickets (bandpassed pulse trains)
  + occasional owl.
- Rain: rain-noise layer whose lowpass opens with intensity; rare soft thunder.

---

## v14 — "Cat Athletics" (movement + animation wave)

Theme: moving *is* the toy. This is the wave the kids will feel most.
Depends on v13's denser world (parkour needs fences/roofs worth reaching).

**Movement**
- Sprint/zoomies with a little drift; momentum that feels good.
- Parkour: wall-hop onto fences; fences → roofs → tree branches as climbable
  routes. Verticality is the #1 thing kids poke at ("can I get up there?").
- A few collectibles placed *only* on rooftops.

**Hunting minigame**
- Some critters flee; stalk-and-pounce scoring using the existing Shift-stalk —
  the closer the sneak, the bigger the bonus; perfect sneak = slow-mo pounce.

**Animation juice** (the cat currently glides)
- Tail sway with turning, ear flicks, head-bob walk cycle, squash-and-stretch
  on pounce, idle chain when stopped (sit → groom → loaf).

**Movement audio**
- Soft whoosh–thump on pounce; faint surface-aware paw steps (soft on grass,
  light ticks on pavement — kept very quiet).

**Camera juice**
- Small FOV kick at sprint; tiny shake on pounce landing.

---

## v15 — "Collector's Journal" (collection + story wave)

Theme: reasons to come back, things to complete. Points the v14 parkour at
destinations.

- **Critter journal** — a page per critter spotted (already backlogged).
- **Golden mice** — a handful of secret collectibles per map, tucked in
  hard-to-reach (parkour) spots.
- **Lost-kitten quest chain** — one multi-walk narrative: paw prints across
  three walks, ending with the kitten following you home. Kids remember
  stories, not point totals. (Kitten later lives in the v17 den.)
- **Photo mode stickers/frames** feeding the existing album.
- **Daily streak gift** — small bonus for walking each day.

---

## v16 — "Together" (sibling/multiplayer wave)

Theme: playing *with* each other, not just near each other. The killer wave
for a two-kid household.

- **Co-walk verbs** (backlogged): tag/zoomies chase, ambush pounce, mutual
  grooming, duo goals.
- **Daily challenge race** — one shared daily seed, a checkpoint "zoomies
  race" course, best-time board on the home base. Couch rivalry = endless
  replay.
- **Ghost reply wiring** (v10 follow-up): named-cat voices
  (Zeetoo/Rosa/Robbie/Hagrid) become reachable via ghost visitors.
- **Sampled cat voices** — 6–10 short CC0 clips (freesound/pixabay; Kenney
  for UI), pitch-varied per play; small .ogg/.m4a, cached by the existing SW
  so offline play keeps working.
- **Record the real pets** 🎙️ — 1-second phone recordings of the actual
  Zeetoo, Rosa, and Robbie; the game speaks in the family pets' voices. For
  the kids this beats everything else in this document.

---

## v17 — "Cozy Den" (home + music wave)

Theme: a place of your own; the point-sink becomes visible.

- **Home interior decoration** — a cat den furnished with whisker points
  (rug, cat tree, fish tank…). Pairs with v11: dress your cat, then decorate
  your cat's house. Ghosts (and the v15 kitten) visit the den.
- **Generative lofi music** — seeded pentatonic kalimba/marimba plucks over a
  slow two-chord pad (~70bpm), melody picked by the walk's RNG. Asset-free,
  never repeats exactly, fits the deterministic-seed ethos; key/instrument
  shift by location and weather (warmer at sunset, sparser in rain).

---

## Infrastructure thread (slot when convenient, before the game spreads
beyond the family)

- **Server-side moderation + rate-limiting of `record_friend_greet`** —
  closes the unilateral-friendship hole properly (currently client-side
  blocklist only). Requires re-running SQL against the live DB (user action).
- **Save-carries-identity** — phone + desktop appear as the same player.
- Housekeeping: delete the `* 2.js` Finder-duplicate files in `src/`/`test/`
  (confirm nothing unmerged first); `apple-touch-icon` is SVG (iOS fallback).

---

## Audio architecture notes (applies across waves)

- Two-track strategy: **synthesis** for everything musical/UI and for voices
  where parameterization matters (per-breed variation), **small samples** only
  for the organic star sounds (real meows, birds, seagulls). Total sample
  budget ≲ 300KB.
- Everything routes through the v12 master bus (gain → compressor → light
  reverb). No node connects to `ac.destination` directly.
- Ambience = 2–3 quiet continuous layers per location, ducked under events —
  never `setInterval` one-shots.
- Keep the existing rules: `settings.muted`/`volume` as the single source of
  truth; distance scaling for remote sounds; iOS autoplay handled by the
  existing on-gesture `ensure()`.

## Sequencing rationale

Couture (v11) → Juice & Polish (v12) → Alive World (v13) → Athletics (v14) →
Journal (v15) → Together (v16) → Den (v17).

Each wave feeds the next: outfits look better in a calibrated, particle-lit
world; parkour needs the dense world's fences and roofs; the journal and
golden mice need parkour destinations; races and co-walk verbs need movement
that feels good; the den caps it as the place all of it comes home to.
