# Fight actions, special moves and scars: design

*2026-11-01. From the playtester after Clan Life Part 2 shipped:
"fights should have more modes than just circling around each other" and "you
should be able to buy new fighting moves, or earn them as you gain experience
(or both)". Answered by the owner in chat. Sketch the owner and playtester
approved ("these all look good"): https://claude.ai/artifact/BHK3XNVWhM93hai46gBymd
(A leap and scratch, B up on hind legs swatting, C jump on top and pin,
D rolling tumble, E scars that fade).*

## Why

Clan Life Part 2 gave Clan Edition real fights (src/fight.js, src/intruders.js,
src/game/clanfight.js, src/ui/fightui.js): an intruder from another clan walks
onto the kid's home land; they pick Fight or Back off; a best-of-three
"read the move" fight follows. Each round the intruder shows an honest clue
(crouches low / raises a paw / backs up) and they answer Pounce, Dodge or
Swipe. Between rounds the cats circle; each round's result is a short
1.4 s "tumble".

What the player sees is mostly two cats circling. The player's original ask (clan-life design)
was hissing, clawing, jumping and rolling, and that is still what they want.
They also want to grow as a fighter: new moves to buy or earn.

Success: a fight looks like a real cat fight from the books — leaps, swats,
pins and rolling tumbles — each round's result reads at a glance (who landed
what), and after a few weeks of play the player's cat knows moves it didn't have on
day one, some of which they could only earn by fighting.

## What the owner decided

1. **Fight rounds play out as real actions** (sketch A–D, all approved):
   - **Leap and scratch:** a crouch, a spring across with claws out, a scratch;
     the other cat flinches back with ears flat.
   - **Up on hind legs, swatting:** both rear up and box in a fast flurry.
   - **Jump on top and pin:** one lands on the other's back and holds it down,
     then hops off.
   - **Rolling tumble:** they grab each other and roll over and over in fur and
     dust, then break apart and square up.
2. **Scars, on both sides** (sketch E):
   - a cat that loses a fight gets a scratch scar: on the face, shoulder,
     back, side or hindquarters, not all at once (owner, 2026-11-01);
   - the player's own cat can get one (when the player loses), and an intruder she beats
     carries her scar;
   - **scars fade after some walks** and then are gone.
3. **New fighting moves:** some can only be **earned** (by fighting); others
   can be **earned or bought** with paw points.
4. Unchanged from Clan Life (owner decisions 2026-10-31): fights are real and
   can be won or lost; win → the intruder flees over its border; lose → it
   walks on; never a fight against either kid's own clan; Clan Edition only;
   home land only; no fights on the island or truce path or in water.

## Claude's calls (flagged; the builder may push back with a reason)

### The fight's shape stays

Best of three, honest clue, **speed never matters** (any tap after the first
0.25 s scores the same), the answer window and the "longer look"/"second look"
edges stay as they are (src/fight.js `TIMING`, `EDGE_BY_SPECIAL`). The new
work is what the rounds *look like*, the moves a kid can bring, and scars.

### Between rounds: squaring up, not circling

The square-off and beat phases replace most of the circling with face-offs:
arched backs, fur up, sideways stalking steps, tail lashing, a hiss. A little
circling may stay as one of several square-off beats. The clue poses
(stalk / swipe / backUp, src/cat/animator.js) are unchanged so the clue stays
readable.

### Each round's result is one action

When a round ends, its result plays as one of the four actions above, landed
by the round's winner on the loser:

| Answer that won the round | Action played |
|---|---|
| Swipe (beats "backs up") | A. Leap and scratch |
| Pounce (beats "raises a paw") | B. Up on hind legs, swatting |
| Dodge (beats "crouches low") | the intruder lunges, misses, and the player's cat lands on its back: C. Jump on top and pin |
| A lost round (wrong answer or no answer) | the intruder lands A, B or C on the player's cat, by which clue it showed: "backs up" → A, "raises a paw" → B, "crouches low" → C |
| The Rolling Tumble special (below) | D. Rolling tumble, ending with the intruder breaking away |

Every round, the deciding one included, plays its own action from this table
(builder-check fix: an earlier draft forced D on the last round, which would
have made face, shoulder and back scars impossible).

- The action replaces today's `tumble` phase. It may need to be longer than
  1.4 s to read (the sketch loops run 2.8–3.4 s); the builder picks lengths
  per action, as long as a full fight still ends in under about 30 s.
- **Reduced motion:** no leaps, rolls or shakes; a short still pose of the
  winner standing tall and the loser crouched, with a dust puff (as today's
  tumbleReduced).
- **The fight camera** (Part 2's clear-view camera) must keep both cats in
  frame through every action, including the top of a leap and the pin. Its
  view choice may need the action's height and width as input.
- **No new random draws** on walkRng or strayStream; which action plays is a
  pure function of the round's clue, answer and result.

### Special moves

Today's three buttons stay forever and are free. On top of them a kid can
learn **special moves**. Each is a finisher she can use **once per fight**.

- A special move answers one clue, like the basic buttons (the clue stays
  honest; reading still matters). **Used on its clue, it wins the round and
  counts as two round wins** — so it finishes the fight from 0–0 or 1–1, and
  turns 0–1 into a win. Used on the wrong clue, it loses the round like any
  wrong answer, and it's spent.
- It plays its own bigger action (below), always with the player's cat as the winner.

| Special move | Answers the clue | Action | How the player gets it |
|---|---|---|---|
| **Rear-up Swat** | "It raises a paw…" | B, bigger and longer | **earn** (3 fights won) **or buy** (300 paw points) |
| **Leap and Scratch** | "It backs up…" | A, bigger and longer | **earn** (6 fights won) **or buy** (600 paw points) |
| **Pin** | "It crouches low…" | C | **earn only** (10 fights won) |
| **Rolling Tumble** | any clue | D | **earn only** (20 fights won) |

- Numbers are Claude's first guess, to be tuned in play: a kid wins roughly
  2–3 fights in a 10-minute home walk (about 3 intruders a walk, Part 2), so
  Pin arrives after a few weeks of play and the Rolling Tumble later.
- **Experience = fights won**, counted for good in the save (a fight lost adds
  nothing and takes nothing away). Backing off adds nothing.
- Buying uses paw points like any purchase (the shop / dressing room's
  existing buy flow). Earning a buyable move the player hasn't bought just unlocks it
  free; buying early skips the wait. No refunds needed: a bought move is never
  taken away.
- A toast when a move unlocks ("New move: Pin! Use it when they crouch."),
  and a place to see the cat's moves and how close the next one is (the journal or
  the dressing room; the builder picks, phone-first).
- **Fight panel:** the three basic buttons stay as they are (bottom third,
  ≥ 88 px, Part 2's phone rules). Owned specials sit in a second, smaller row
  above them; a used one greys out for the rest of that fight. The helper line
  gains each owned special's clue.

### Scars

- **Who gets one:** the loser of a whole fight (not of a round). The player's cat when
  she loses; the intruder when she wins. Backing off gives no scar.
- **Where (owner, 2026-11-01):** a scar can sit at one of several sites, not
  all at once:
  - **face**, over one eye (sketch E);
  - **shoulder**;
  - **back**, along the spine;
  - **side** (flank);
  - **hindquarters**.

  The site follows the action of the round that decided the fight (Claude's
  call, so it's a story the kid saw happen and needs no random draw): leap
  and scratch → face; rear-up swatting → shoulder; pin → back; rolling
  tumble → side or hindquarters (alternating by a stable hash of the scarred
  cat's id). Left or right side is fixed per cat so a scar doesn't jump
  sides. Since the intruder's winning action follows its clue, the player's cat can
  get face, shoulder or back scars; side and hindquarters come from her own
  Rolling Tumble, so they appear on intruders.
- **How many at once:** at most **two** scars on a cat, at two different
  sites. A new scar at a site that already has one resets that scar to full;
  a third scar replaces the faintest of the two. (Claude's call; "not all at
  once".)
- **Look:** three short scratch lines in a soft red on the head or body
  surface, crisp enough to read as scratches on every coat (the custom cats
  from the cat builder and the new body's wrap-around stripes included).
  - **How it's drawn (builder-check fix; Claude's call):** cats have no
    texture: coats are painted per vertex (coat.js `paintCoat`; intruders use
    the `simple` 24×28 build), too coarse for crisp lines. So a cat's scars
    (up to two) are **one merged mesh** of thin raised strips fitted to the
    head/torso surface, vertex-coloured by fade stage, hung on the head or
    torso so it poses with the cat. That is **+1 mesh only on a scarred
    cat**; the mesh-cap tests (test/catcustom.test.js, test/catmodel.test.js)
    gain a scarred variant with caps 32 full / 26 simple. No mesh at all
    when a cat has no scar.
  - **Under clothes:** a scar covered by a body item (hoodie, sweater,
    raincoat, cape, jetpack) or by a fluffy cat's ruff is simply hidden;
    nothing extra is done to show it.
- **Fading:** each scar lasts **5 walks** on its own: full for the next 2
  walks, half for the next 2, faint for the last one, then gone. Walks counted
  are any walks (Legacy walks too), so a scar from Clan Edition fades even if
  they play Legacy. A new scar at a site that already has one resets that
  scar to full.
- **Her own scars** belong to the cat that fought (owner, 2026-11-01): if
  she loses as one cat and switches to another, the new one has no scar. The
  equipped cat's scars show everywhere it shows: walks, dressing-room stage,
  album photos, and to the partner on a walk together. Scars travel to a
  co-walker in a new `accessories.scars` key (up to two site + fade-stage
  pairs) sent for **every** cat, not only custom ones (today only a custom
  cat sends a look: src/customcats.js `catProfileFields`). It is sanitised on
  receipt; an older-build partner ignores the unknown key. Note this rides
  the public cloud `profiles` row too (src/game/rooms.js `pushProfileNow`),
  which is fine for a cosmetic field, and is re-pushed when scars change.
- **Intruder scars:** intruders are cast slots of the territory's clans
  (Part 2 `RAIDER_SLOTS`, src/intruders.js). The save keeps a small list
  keyed by **cast id** (not name) of cats the player has scarred; that cat shows its
  scar **anywhere it appears on the player's device**, as an intruder or standing in
  its own clan's camp, fading by the player's walk count the same way. Each kid's
  device keeps its own list (Claude's call: keep it local rather than
  syncing).
- **Chasing off together** (`chasedOffTogether`, both kids in one fight's
  win): counts as a fight won for each kid and scars the intruder on each
  kid's device.
- **Hagrid** (the chicken avatar) already fights today (`bird` →
  `secondLook`; walk.js creates the clan fight for any cat). He keeps
  fighting, gets **no scars** (he has no torso to hang them on), and his
  rounds keep today's short tumble instead of the four cat actions; his
  goldens stay byte-identical.
- **The partner never sees the player's fight actions**: each kid's fight runs and is
  drawn on their own device (Part 2), as today.
- **Losing changes nothing — except a scar.** Part 2's rule "losing a fight
  changes nothing in progression" is amended by the owner's decision: losing
  now leaves a cosmetic, fading scar on the player's cat. It still costs no points,
  cats, unlocks, marks, moves or fights-won count. The structural tests in
  Part 2 that pin the lose path must be updated to allow exactly this one
  cosmetic field and nothing else. The win path changes too: src/game/clanfight.js
  is deliberately given no progression today and its tests pin that a win
  pays only `log.awardOnce`; it now also records `fightsWon`, move unlocks
  and the intruder's scar, so those win-path pins are updated to exactly
  these writes.

### Save, wire and editions

- **Save:** additive, sanitised fields only, SAVE_VERSION stays 4:
  `fightsWon` (non-negative integer, clamped), `fightMoves` (owned special-move
  ids from a fixed list), `scars`, kept **per cat** (owner, 2026-11-01: the cat that fought
  keeps its own scars; keyed by preset breed id or custom-cat id, each up to
  two site id + walks-left 0–5; a cat the player switches away from keeps fading by
  her walk count; a deleted or replaced custom cat's scars are dropped), and
  `scarredIntruders` (at most ~24 entries keyed by cast id, each up to two
  site/walks-left pairs, oldest dropped).
- **Wire:** only her scars, in `accessories.scars` (see Scars).
  Special moves don't go over the wire; each kid's fight runs on their own
  device as today (Part 2's co-walk events stay as they are).
- **Legacy:** no fights, so no moves UI; a scar from Clan Edition still shows
  on the player's cat in Legacy while it fades (Claude's call: it's the player's cat's look; the
  owner may prefer hiding it in Legacy).

## Constraints

- **The clue stays honest and speed never matters** (src/fight.js promises).
- **Budget:** the iPhone 18 must hold 60 fps mid-fight. Actions are
  animation of the two existing cat models plus short-lived `fx` puffs and
  slash marks (pooled, no per-frame allocation); scars are one merged mesh
  per scarred cat (+1 on the 31/25 mesh caps, only when scarred; see Scars).
- **Determinism:** no new draws on walkRng or strayStream; co-walkers still
  agree on intruders. Hagrid's goldens (test/fixtures) stay byte-identical
  (he fights, but with no scars and today's tumble; see Scars).
- **Reduced motion** respected everywhere (actions, scars don't animate).
- **Our own words:** no Warrior Cats canon names; move names are plain
  English; the borrowed-word scan stays green.

## Goals

- Fights look like the sketch: leaps, swats, pins and tumbles, readable on a
  phone.
- A kid feels themselves get better: moves unlock as they win.
- Some moves can only be earned; buying is a shortcut for the rest.
- Scars are a badge that fades, on both sides.

## Non-goals

- No health bars, damage numbers or blood.
- No penalty for losing beyond the fading scar.
- No moves in Legacy, and no fights anywhere fights don't already happen.
- No new intruder clues (the three stay); the Rolling Tumble's "any clue" is
  how the top move stays special without a fourth clue.

## Anti-goals

- A fight becomes a reflex test, or a special move wins without reading a
  clue (except the top earn-only move, by design).
- A scar that never goes away, or one that makes the player's cat look hurt rather than
  battle-tested.
- The young player feels punished for losing.
- The phone drops below 60 fps mid-fight.

## Left to the builder

- Exact action animations, timings, camera framing per action, and the
  square-off beats.
- The scar's exact look per coat, and how it's drawn (texture vs decal).
- Where the player's moves list lives, and the unlock toast copy.
- Final unlock counts and prices (first guesses above).
