# Whisker Walk — Visit counter and milestone celebrations

Date: 2026-10-25 · Status: draft for owner approval

## Intent

The owner's 11-year-old has been playing *Finch*, and what she likes is the
small celebration that greets her when she opens it. Whisker Walk should give
her that same moment of arriving and being welcomed, built on a **visit
count** instead of a run of consecutive days. A day counter punishes a missed
day. A visit counter can only go up.

The players are the owner's two children, a girl of 11 and a boy of 9, on
separate devices with separate saves. Both get this.

## Decisions (owner, 2026-10-25)

1. **What counts as a visit:** every time the game is opened. Three opens in
   one afternoon are three visits.
2. **Reload farming is fine.** If a kid figures out that reloading adds visits
   and races to visit 50, that's funny, not a bug. No cooldown and no guard.
3. **The counter is easy to see:** a badge on the home screen.
4. **Milestones:** visit **1, 5, 10**, and then **every 10 visits** (20, 30,
   40, …) with no end.
5. **A milestone gives a prize to keep plus confetti.** The prize is a
   **special accessory for the cat** that can't be bought.
6. **Prizes appear in the real game.** A won accessory is a normal wearable:
   it shows on the cat during walks and on the other player's screen when they
   play together. (The existing outfit sync in `src/remotecats.js` already
   carries `accessories`.)
7. **All three celebration styles get used, varied across milestones**
   (mockups, 2026-10-25):
   - **A. The big moment:** the screen dims, confetti falls, and a present
     card says "Visit #N!". She taps **Open it!** to unwrap the accessory.
   - **B. Quick and cheerful:** a burst of confetti and a banner saying
     "Visit N! Your cat got a ___. It's already on!" The cat is already
     wearing it. Nothing to tap.
   - **C. The cat greets her:** the cat wiggles and says hello in a speech
     bubble ("You came back! This is our 10th visit. I found something for
     you…"), and a present sits beside it to tap.
8. **Prizes can't be traded.** They stay with the kid who won them. Colony
   trading treats them like the starter `bell` and `bandana`
   (`STARTER_ACCESSORIES` / `applyColonyTrades`, `src/ui/colonypanel.js`).
   They are never offered, never accepted from a partner payload, and not
   listed in the wardrobe sent for trading. So each kid's prizes come only
   from their own visits.
9. **When the prizes run out, cycle back.** Celebrations keep coming every 10
   visits, still rotating styles. In the owner's words: if we get to 100
   visits, we've already won. Don't over-engineer the far end.

## Goals

- Opening the game feels like arriving somewhere that's glad to see you.
- An ordinary visit gets a short, warm line, for example
  "Welcome back! Visit 23 🐾", that never blocks Start.
- A milestone visit gets a celebration and a keepsake.
- Every won accessory is a full citizen of the outfit system: wearable in the
  dressing room, seen on walks, sent to the other player.

## Non-goals

- Consecutive-day tracking. The existing `🔥 N-day streak` stays exactly as it
  is: not removed, not changed, not tied to visits.
- A shared count across both kids, or any server-side count.
- Prizes other than accessories (whisker points, den furniture, cats) for the
  first version.
- Notifications or reminders to come back.

## Anti-goals: failure even if it ships

- **Punishment.** Nothing is ever taken away, and no number ever goes down.
  The add-only rule in the v21 spec (§9) applies.
- **A progress bar.** No "7 more visits to your next prize!" meter. The badge
  shows the visit number, not a countdown. (The dressing-room teaser below
  names a visit number but has no meter.)
- **Points as a prize.** A milestone that pays whisker points has failed.
- **Getting in the way.** An ordinary visit must never need a tap before
  Start. Only style A and C milestones ask for a tap, and only one.
- **Sibling comparison.** Nothing shows one kid's visit count to the other.

## Constraints

- Stack per the v21 spec: Three.js, Vite, Vitest, Supabase JS. No new
  dependencies.
- **`SAVE_VERSION` stays 4.** The new save fields are added the way v15+
  fields were: a default on load, plus a sanitizer with a ceiling (pattern:
  `STREAK_COUNT_MAX` in `src/progression.js`).
- Must work with no network, like everything else in solo play.
- Phone frame rate: confetti must be cheap, either DOM/CSS over the home
  screen or a capped particle count. No full-screen WebGL effect.

## Design

### Save data (`src/progression.js`)

- `state.visits`: a non-negative integer, default `0`. Sanitized with a
  ceiling (the builder picks the number; something like 1,000,000 means
  "implausible" here, unlike a streak).
- `state.visitPrizesSeen`: the highest milestone visit already celebrated
  (default `0`). This is what keeps a celebration from replaying, and keeps
  the prize from being granted twice, if the page reloads mid-celebration.
- **Existing saves start at 0**, so the first open after the update is
  visit 1 and gets the visit-1 celebration. *(My call.)*
- **Cloud "Load from cloud"** replaces the save today. For these two fields,
  keep the **larger** of the local and cloud values so loading never makes
  the count go down. Then **rebuild owned prizes from `visitPrizesSeen`** on
  every load: every prize whose milestone is ≤ `visitPrizesSeen` is added to
  owned accessories if it's missing. So an older cloud save can never strip a
  won prize. *(My call, from the add-only rule.)*

### Counting

Once per page load, when the home screen first appears: `visits += 1`, then
save. A walk that ends and returns to home is not a new visit. (Rooms are
joined from the home screen, so there's no separate join-link case.) Exactly
where in `main.js` boot this happens is the builder's call, as long as it
runs once per load.

### Milestone schedule (pure function, unit-tested)

`isMilestone(n)`: `n === 1 || n === 5 || (n >= 10 && n % 10 === 0)`.

Milestone index: 1 → 0, 5 → 1, 10 → 2, 20 → 3, 30 → 4, … The index picks
both the prize and the style.

If a reload race skips past a milestone (visits jumps from 19 to 21 because a
celebration was never shown), celebrate the **most recent** missed milestone
once, not a queue of them. *(My call: one party, not a backlog.)*

### Prizes

About **ten** new accessories, flagged `prize: true` in `CATALOG.accessories`
with no purchasable price. Index 0 → prize 1, index 1 → prize 2, and so on.

Theme *(my suggestion, owner may swap)*: a party set with a few Warrior Cats
nods for the 11-year-old. For example:

| # | Visit | Item | Slot |
|---|-------|------|------|
| 1 | 1 | Party Crown | head |
| 2 | 5 | Confetti Cape | body |
| 3 | 10 | Star Sunglasses | face |
| 4 | 20 | Leaf Crown (clan-made) | head |
| 5 | 30 | Party Balloon Bunch | back |
| 6 | 40 | Sparkle Collar | collar |
| 7 | 50 | Clan War Paint | face |
| 8 | 60 | Birthday-Candle Hat | head |
| 9 | 70 | Streamer Scarf | neck |
| 10 | 80 | Golden Paw Booties | feet |

Each one needs a model in `src/cat/model.js` (cat and chicken, as existing
accessories do) and a thumbnail via `src/thumbnails.js`. Exact names, looks
and slots are the builder's call within the theme. Check the existing
**Flower Crown** and **Party Balloon** so the prizes look different from them.

**Granting:** the prize goes into owned accessories and is **put on
immediately**, replacing whatever was in that slot (the old item stays
owned). Style B shows it already worn. In A and C it's put on when she taps
the present. If she closes the tab before tapping, grant and wear it anyway
on the next load. *(My call: a present is never lost.)*

**After prize 10 (visit 90+):** cycle back. Celebrations continue in the same
style rotation. Instead of giving a duplicate, the cat shows off one prize she
already owns, cycling through them in order: "Remember this? You looked
great in it!", with a button to put it on. In style B the button is optional
and never blocks Start, and nothing changes her outfit unless she taps it.
*(My call on how "cycle back" works.)*

**If the other player presses Start mid-celebration** (any member's Start
starts everyone): the celebration gives way. The lobby logic is not touched.
The prize is granted and worn at once, and the celebration does not replay
after the walk. *(My call: don't reopen the "no split worlds" fix.)*

**Other boot cards** (the "While you were out" news card, one-time notices
such as the Rosa farewell): the celebration goes first, and they follow
after it closes, on the same open. "One tap" in the anti-goals means one tap
for the celebration itself. *(My call.)*

### Dressing room and shop

- Prize items never appear for sale.
- **Owned** prizes appear in their slot in the dressing room like any item.
- **Unowned** prizes show as a wrapped-present silhouette labelled
  "A surprise at visit N". *(My call: a little anticipation, Finch-like. Drop
  it if it reads as a checklist.)*
- Redeem codes (`src/redeem.js`) cannot grant prize items.
  `scripts/make-code.mjs` should reject them. *(My call: prizes are for
  visiting.)*
- Dressing-room counts like "owned N of M accessories" should leave out
  unowned prizes, or count prizes separately, so the shop never looks
  unfinished. Builder's call which.

### Home screen (`src/ui/homebase.js`)

- A **visit badge** in the header chip row, leftmost, in the pink from the
  mockup: `🐾 Visit 23`. On a milestone visit it becomes `🎉 Visit 30`. On a
  phone it stays visible; it does not move into "More" with the substats.
- **Ordinary visit:** a short welcome line near the cat for a few seconds,
  then it fades. Rotate a handful of lines so it doesn't go stale, for
  example "Welcome back! Visit 23 🐾" or "Visit 23. Your cat missed you."
  Wording is the builder's call. Keep it warm, never needy, and never a
  guilt line ("Where were you?").
- **Milestone visit:** the celebration plays over the home screen on arrival.
  - Style by milestone index: **visit 1 → C** (the cat introduces the idea),
    then **A, B, C** in rotation: 5 → A, 10 → B, 20 → C, 30 → A, … *(My call.)*
  - Confetti in all three. Visit 1 can be modest; 10, 50 and 100 can be
    bigger.
  - A short sound from the existing audio module, respecting mute settings.
  - Start is reachable the whole time in B, and right after one tap in A and
    C.

### Tests

- `isMilestone`, the milestone index, and the prize/style choice: pure, with
  Vitest coverage, including the cycle after prize 10 and the skipped-
  milestone rule.
- Save: defaults for old saves, sanitizer ceilings, the cloud-load max rule,
  no double grant across a reload, prizes rebuilt after an older cloud load.
- Trading: a prize can't be offered, and a partner payload that offers one is
  ignored.
- A `verify-visits.html` page in the repo's existing `verify-*.html` style, to
  step through visits 1, 5, 10, 20, 30, 90 and 100 and see each celebration
  and each prize on the cat.

## Left to the builder

- Exact prize models, names and slots within the theme.
- Confetti technique, timing and animation details.
- Welcome-line wording.
- Where in boot the count happens.
- How dressing-room totals handle prizes.
