# Border Patrol Fight — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** In another clan's territory, that clan's border patrol cat is a real named warrior. When it catches you trespassing it squares up and offers **Fight!** or **Run**. Win: it lets you pass for the rest of the walk and you get points once. Lose or Run: you are chased out exactly as today. Losing never costs anything.

**Spec:** `docs/superpowers/specs/2026-10-31-clan-life-design.md`, "Amendment (2026-11-04)". Builds on `docs/superpowers/plans/2026-10-31-clan-life-2-intruders-fights.md` (rulings R1–R19 hold).

**Architecture:**
- **One fight controller.** `createClanFight` (src/game/clanfight.js) gains a few options, every default being today's behaviour, so the home-intruder flow is byte-for-byte unchanged. The patrol is handed to it as the `intruders` interface through a **patrol foe adapter** (`patrol.foe`, src/rivalcats.js). clanfight.js stays free of progression.
- **The patrol is the authority on *when*.** Its chase trigger is unchanged (inside the disc, within 4.5 m, `chaseAllowed`, cooldown over, same level). With a foe, before chasing it asks `intercept()`: if the fight would show (or is showing) its pill, the patrol squares up instead (stops, faces you, `cross`). Otherwise (wading, off clan ground, a lock) it chases as today.
- **Run / lose / no answer** call `patrol.chaseNow()`; the next patrol update runs today's chase from where the cat stands (if she is still inside the border).
- **Win** calls the adapter's `flee`, which for the patrol means *stand down*: it returns to its route and never pills or chases again this walk.
- **Ring lag.** While it squares up or is held, the patrol falls behind its clock (`lag` seconds); afterwards it glides back onto its ring and catches up at `CATCH_UP_SPEED` (2.5 m/s), so co-walk screens agree again. With no foe, lag is always 0 and the patrol is exactly today's.
- **Identity:** `borderWarriorFor(clan, key)` (src/clancast.js), one of `RAIDER_SLOTS` (warriors 4–6) of the patrol's clan, from `key = roomSeed ?? seedFromCode(walkStamp)`: both co-walk screens share the room seed. That slot is left out of the walk's roaming clan cats (it is out on patrol), so there is never a double.
- **Wiring:** `src/game/borderfight.js` builds the patrol's clanfight (words, options); walk.js assigns it to `session.clanFight` in foreign territory (home and away are exclusive, so there is only ever one pill), builds the fight camera for it, and keeps all progression out of the chase slice. netevents.js handles `patrol-fight` / `patrol-done`.

## Rulings (builder's, 2026-11-04)

| # | Ruling | Cost if wrong |
|---|---|---|
| B1 | The patrol warrior is a RAIDER_SLOTS warrior of the territory's clan, keyed by the room seed on a co-walk (else the walk stamp), so it varies walk to walk and both screens agree. | A kid wanting "the same rival every time" gets variety instead; a one-line change to key by area only. |
| B2 | That warrior's roaming copy is left out of this walk's clan cats when (and only when) this device has the fighting patrol. A Legacy co-walker (no patrol at all, as today) still sees it roaming, unnamed. | Mixed-edition co-walks already differ by the patrol; this adds one unnamed roamer on the Legacy screen only. |
| B3 | The pill appears exactly where the chase used to (inside the border, 4.5 m), and the patrol stops and stares while it is up. The stop is local (not on the wire); it catches up afterwards. | Up to 8 s of a co-walker seeing the patrol walk on while mine stands; it glides back after. Same class as today's local dash. |
| B4 | No answer in 8 s (`BORDER_CHALLENGE_WAIT`) counts as Run: today's chase. Stepping out of the border hides the pill with no chase. | A slow reader is chased (which costs nothing) and can come back after the 8 s cooldown. Without a timeout the pill would make the camp free to roam. |
| B5 | Lose → today's chase from the fight spot (if still inside), after a "won this time" toast. Re-challenge waits RECHALLENGE_DELAY (20 s); in that time a trespass is chased as today. | A kid who lost and walks straight back in is chased once more without a pill. |
| B6 | Win → the patrol stands down for this walk on this device only (no pill, no chase); it keeps walking its border on both screens. A co-walker's win doesn't give me passage; each kid wins her own. | A sibling who didn't fight is still chased. Matches "a watcher gets nothing" (Part 2). |
| B7 | New award kind `border: 12` (its own feat tally, so the journal's "chased off" count stays intruders only), key `border-<area>`, once a walk. It counts toward fights won (move unlocks) like any win. | Points could be seen as low or high; the value is one constant. |
| B8 | Scars: a win scars the patrol warrior by its cast id (so it wears it back in camp on later walks); a loss scars my cat, fading, as at home. Hagrid never scarred. | — (same as home). |
| B9 | Co-walk: `patrol-fight` holds it facing the fighter on the other screen (and hides that screen's pill with a toast); `patrol-done` releases that holder. Holds are counted; remote holds expire after HOLD_MAX (40 s) and on room leave. No "together" pay. | Two kids fighting it at once each get their own fight and outcome; fine. |
| B10 | The warrior mesh is built like an intruder (simple model, its coat, its scars, warrior scale 0.85, a cross name tag) and, like today's patrol, gets no shadow-pass caster or contact decal. | Draw count unchanged vs today's patrol except the tag sprite (+1). |
| B11 | Old areas keep today's generic patrol (no foe: rival.clan is null there). Legacy has no patrol. The den and island have none. | — |

## Tasks

### Task 1: pure pieces
- [ ] `borderWarriorFor(clan, key)` in clancast.js (+ tests: a warrior of RAIDER_SLOTS, same for same key, varies over keys, null for a non-clan).
- [ ] `AWARDS.border = 12`; `discoveryText` returns a `border` label as a whole sentence.
- [ ] `renderChallengeHtml({ name, clan, ask, off })`: defaults give today's exact HTML (test pins old output), patrol words render.

### Task 2: clanfight options (defaults = today)
- [ ] `hostile(cur, catPos)`, `challengeRange`, `challengeWait` (s; Infinity), `onBackOff()`, `challengeWords` (merged into the pill model), `words: { award(name), won(name, clan), lost(name, scarred) }`, `eventTypes: { fight, done }`; `wouldChallenge(s)` public (true when idle and the pill would open now).
- [ ] Tests: the existing clanfight tests unchanged and green; new tests for each option.

### Task 3: patrol foe mode (rivalcats.js)
- [ ] `createRivalPatrol(..., { foe: { member, scars, showNames }, intercept })`: warrior mesh + tag; states standoff / held; lag + catch-up; `chaseNow()`; `foe` adapter (`current, hold, release, dropHolder, holders, stage, measure, setScars, flee (stand down), isFled`).
- [ ] Tests: no-foe patrol unchanged (existing tests); intercept → no chase, stands; chaseNow chases; held stays and faces; release glides back and catches up; stand-down never chases; adapter shape.

### Task 4: borderfight.js, walk.js, netevents.js
- [ ] `createBorderFight` wraps createClanFight with the patrol words and options.
- [ ] walk.js: compute the border warrior before the clan cats, drop its roaming copy, pass `foe` into the patrol, build the border fight + fight camera after the rival slice; dropHolder on roster leave.
- [ ] netevents.js: `patrol-fight` / `patrol-done`, validated like the intruder events.
- [ ] Tests: structural (walk pins still hold; chase slice still has no progression), netevents behaviour.

### Task 5: live check
- [ ] CliffClan save in the Moor: pill at the patrol, win (lets you pass, no further chase), lose (chased), Run (chased), phone width; a home-intruder fight still works.
