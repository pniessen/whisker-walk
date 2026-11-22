# Log in to my cat: design

Date: 2026-11-22. Status: design only, nothing built. Branch `cat-login`.
Owner idea (2026-11-21): "a way to login to 'my' cat from an arbitrary device."

Plan that builds this: `docs/superpowers/plans/2026-11-22-cat-login.md`.

Everything under "What exists today" was read from the code and the SQL files in this branch. The live database was not contacted. Statements about what the live database does are inferred from `docs/supabase-v10-limits.sql` and are marked "inferred". Nothing here is legal advice (see risk R9).

---

## 1. The problem, in the kids' terms

There are two kids and many screens. The girl (11) and the boy (9) play on a Mac, on iPads, on phones, and sometimes on a grandparent's or a friend's device. Each one thinks of one thing: "my cat".

What they want to say:

- "I made my cat on the Mac. Now I'm on my iPad. Where is she?"
- "I got a new iPad. I want my cat on it."
- "My iPad broke. Is my cat gone?"
- "I'm at Grandma's. Can I play my cat on her tablet and leave nothing behind?"

What happens today: the cat lives inside one device. There is a way to copy it (Menu, Save, Save to cloud, then Load from cloud on the other device), but it is a one-time move, it replaces the cat on the other device, and after that the two copies drift apart. It also leaves the second copy half-broken in ways a kid cannot see (section 2.3). It does not feel like "my cat is wherever I am."

What good looks like: type or tap one small thing, see "Is this your cat?" with the cat's own picture, tap Yes, and the cat is there with everything it had. Walk on either device. Both stay in step. Nobody has an email address, a password, or a real name in the game. If a device is lost, a grown-up can get the cat back with one piece of paper.

Anti-goals (from the players): the 9-year-old must never lose something he earned because his sister's iPad synced later; a code must be typeable by a 3rd-grader on a touch keyboard; nothing may say "account", "log in with email", or "parent screen" (owner decision 2026-11-17: no parent screen in front of going online).

---

## 2. What exists today

### 2.1 How a device identifies itself

- `src/main.js:86-94`: `pid` = a random UUID in `localStorage['whisker-walk-player']`, made on first open. Per device, not part of the save.
- `src/cloud.js` `getOrCreateSecret`: `psecret` = two UUIDs in `localStorage['whisker-walk-secret']`. It authorises every write to the player's own cat profile, friendships and colony. Server side it is `profiles.secret`, checked by `record_friend_greet` and `colony_authed` (`docs/supabase-colony.sql:121`).
- Cloud link: `localStorage['whisker-walk-cloudcode']` and `...cloudsecret` (`src/game/cloudsync.js:70-71`).
- Online is opt-in by a tap, not by a parent: `onlineOptedIn` (a saved walking name, or a cloud link). `test/offlinefirst.test.js` holds the game to "no request before that".

### 2.2 What a cloud save holds and how it moves

- Table `saves(code, secret, payload jsonb, lifetime, updated_at)`. No other column. `payload = { save: progression.state, album: album.serialize() }` (`cloudsync.js` `composeCloudPayload`). So the **whole save and the whole photo album** go up each time. Cap 2 MiB (client stops at 1.75 MiB).
- Code format: 3 words from a 256-word list plus 2 digits, for example `PLUM-OTTER-CROW-42`. About 30.6 bits (`cloud.js`, regex in `upsert_save`).
- `Save to cloud` makes the code and seeds the **row secret with this device's `psecret`** (`cloudsync.js:200-221`). So for every row made that way, the row secret and the player secret are the same value.
- `load_save(code)` returns payload, **the row secret**, and lifetime to anyone who knows the code (`docs/supabase-v10-limits.sql:499`). The SQL comment says this is deliberate: the code is the capability. The loading device stores code + that secret and from then on can write.
- Writes: `upsert_save` replaces the whole payload. The only conflict rule is `p_lifetime < existing.lifetime` gives `'stale'` and the write is refused (`upsert_save`). There is no merge and no revision counter.
- Pushes: after each walk summary and after shop buys (`sync.autoSync`). Pulls: never automatic. Only a tap on Load from cloud, which shows a preview card and then **replaces** the local save (`progression.replaceFromPayload`, `src/progression.js:2665-2720`).
- `replaceFromPayload` already carries a few "never lose" rules over from the old local save: visits, `visitPrizesSeen`, `moreCatSlots`, `usage` (via `mergeUsage`), `foundWear`, `events`, `fightsWon`, `fightMoves`; `customCats` and `outfits` only when the payload lacks them. It writes the old save to the `whisker-walk-save.before-cloud` backup first, so Undo works (`BACKUP_KEYS`). These are the seeds of a real merge.
- Limits (v10, live since 2026-11-17, steps 1-4 run): per-visitor counters on a salted hash of `cf-connecting-ip`, 10 wrong codes per 10 minutes and 50 per day per visitor, 500 per 10 minutes and 72,000 per day for the whole world. Header arrival is **unverified** (step 0 not done), so the limits may still be the shared "unknown" numbers (100 per 10 minutes). The 12-month clean-up is installed but **off**.
- `delete_save` and `delete_player` exist (v9/v10), the right secret always deletes.

### 2.3 Gaps found while reading (these shape the design)

1. **A cat is stuck to a device id.** Everything that is "about other players" is keyed by `pid`: the cat profile, friendships, the colony (`colony_members.player_id`, `colony_cats.finder_id`, `colony_feeds.by_id`, trades), the clan name (minted from `pid`, `ensureClanName`), `clanPick.partnerId`. The save carries the colony link and partner but **not `pid`**. So after Load from cloud on a second device: the device has a different `pid`; the colony sync gets `'unpaired'` and drops the link (`src/game/colonysync.js:356`); a new profile row is made under the new `pid` (a second copy of the cat in friend lists); the met list is empty (`src/metplayers.js` says so in its header), so ghosts and the Player pets list lose the friends. The kids see "my cat is here, my friends are gone." This is the biggest problem and the reason a code is "a one-time move".
2. **No automatic catch-up.** Two devices drift. If both are walked offline, the one that uploads second with higher lifetime overwrites the first: items found on the lower-lifetime device are lost (no merge on push).
3. **The save code is the master key.** It returns the row secret, which is the original device's `psecret`. Anyone with a code can impersonate that cat's profile and colony writes. A code posted in a Roblox chat (the 11-year-old plays Roblox) is a leak with no remedy: there is no way to change a code.
4. **Code strength.** 30.6 bits. With the world ceiling of 72,000 guesses a day and N stored saves, the chance of any hit per day is about `72,000 × N / 1.7e9`. At N = 10,000 that is 0.4 a day (the release assessment, item 33, says the same). Fine for four family saves, not for a public game.
5. **The album rides along on every sync** (up to 1.75 MiB) although a pull needs only the save. Fine on Wi-Fi, bad for an auto-pull on an old iPad.
6. **Privacy text and code disagree.** `docs/PRIVACY.md` says "a count of how often each screen has been opened. The count stays on the device." But `state.usage` is inside the save, and the save is uploaded whole (`src/usage.js` header admits "travel with a cloud save only because the whole save does"). Either strip `usage` from the payload or fix the text. Recommendation in 4.6.
7. **The 12-month clean-up (when turned on) would delete a cat nobody pushed to for a year.** `updated_at` only moves on a push. An iPad that only pulls looks idle. For a game where a cat is a child's work this is the wrong default (R5).

### 2.4 Things that must keep working

- Colony: server truth when paired; `mergeColony` and `colonySync` pull and merge by themselves (`src/colony.js`, `src/game/colonysync.js`).
- Ghost visits: a friend's profile shows as a ghost only when its id is in the met list (`src/ghosts.js`, `src/metplayers.js`). The friend list and ghosts skip the player's own id.
- Partner co-walk: realtime room, presence key = `profile.playerId` (`src/net.js:501`). Two devices with the same id in one room would share a presence key (R3).
- Series words: the family's word set unlocks per device with a family gift code in `localStorage['whisker-walk-family-words']` (plan `series-switch-phase3-plan.md`). That is a different thing from this feature's code. **Name clash to avoid: this feature never says "family code".** It says "cat code".
- Start-up chunk 705.2 kB gz against a 720 ceiling (`test/buildsize.test.js`, `MAIN_GZIP_CEILING_KB`). `src/cloud.js` is imported by `src/game/cloudsync.js`, so today its 256-word list and code maker sit in the start-up chunk.

---

## 3. Options compared

Scale used in the table: Good / Fair / Poor, for a family game that may one day be public.

| | A. Word cat code (3-4 words, no email) | B. Handoff from a device that has the cat (hop code, link, or QR) | C. Sign in with Apple / email magic link | D. Do nothing (device only) |
|---|---|---|---|---|
| What a kid does | Types or taps 4 words once per new device | Taps "Add a device" on the old one, types 6 characters on the new one | Taps a button; for email needs an address the kid does not have | Nothing; no second device |
| Data from children | None. A random code, a random id | None. A one-time code that expires | **Email, or an Apple ID**: personal information from a child; verifiable parent consent (COPPA, UK Code, GDPR-K) | None |
| Kid-safety | Code is a bearer key: shared in chat = cat taken (needs a "change my code" button) | Safest: expires in 10 minutes, one use, the old device taps Allow | Parent-controlled in theory; in practice the child's own address or a parent's | Safe |
| Offline-first | Fine: nothing until the kid links; then pulls when online | Needs both devices online once | Needs the network at every sign-in; breaks the "no request before opt-in" rule unless gated | Perfect |
| Lost device | Parent types the code on a new device. Code on paper = recovery. Lost code and no linked device = cat gone | **Cannot help:** the old device is the one that is gone | Best in theory: email or Apple ID is the recovery | Cat is gone |
| Guessing | 30.6 bits today, 40 bits with 4 words and a 1,024-word list | 29.7 bits but 10-minute life, one use, and an Allow tap | Not applicable (the provider does it) | None |
| Cost | Free (existing Supabase) | Free (a small table) | Apple Developer Program fee ($99/yr) for Sign in with Apple, **and** the kids' app is signed with a free Personal Team (`ios/`), which cannot use that capability. Email needs an auth provider and email sending | Free |
| Effort | Small: the code already exists, fix identity and merge | Medium: three RPCs, a poll, one sheet | Large: auth model, RLS rewrite (`auth.uid()` replaces the capability secrets), consent flow, parent UI the owner ruled out | None |
| Fit with Supabase tables | `saves` plus 3 columns | One new private table `hops`, same pattern as `colony_invites` (code, expiry, answer) | Replaces the secret-in-RPC model everywhere | None |
| Verdict | **Keep, strengthen, make it the recovery key** | **Add as the everyday way to add a device** | **Reject for the kids' game** | Becomes the default for devices that never link |

Notes on B:

- QR scan: needs the camera. `docs/PRIVACY.md` promises "The game never uses your camera". Scanning inside the iOS WKWebView shell also needs a camera permission string and a native bridge. Rejected for now. The hop code is "a QR you read aloud": six characters from the existing 31-letter code alphabet (`src/codealphabet.js`, no I O L 0 1).
- A link (`whiskerwalk.org/#hop=ABC234`) could be sent by the parent over Messages to a browser device. It would put the one-time code in a URL, which is allowed (it expires and is single-use) but pages and chat apps keep URLs. Parked, not in v1. The iOS app is a bundled copy and does not open site links without universal links (a paid-program feature).

Notes on C:

- Sign in with Apple needs the paid program for the app, and a child's Apple ID rules for third-party sign-in were **not checked**; treat as unknown.
- Even a parent-owned email means the game stores an adult's personal data about a child's account. That is the thing the privacy draft is built to avoid (`PRIVACY.md`, "What the game never collects").
- Supabase Auth would change every RPC from "the secret is the capability" to `auth.uid()`. The whole v7-v10 security model (and its tests) would be rewritten.

Notes on D:

- It stays the default. A device that never links never talks to the network (offline-first gate unchanged). The feature must cost nothing for it.

---

## 4. Recommendation

**Build A and B together, and fix the identity gap first.** In kid words: "My cat has a cat code. I can add a new device with a hop code. My cat catches up by itself."

No email, no password, no account. The game still never learns a name. The kid-visible words:

- **Cat code**: the four words that name the cat's cloud home. For keeping safe and for emergencies.
- **Hop code**: six characters, good for ten minutes, for adding a device while holding both.
- **Catch up**: the automatic sync (not a button the kid presses).

### 4.1 The cat's identity travels with the cat

The key change, and the reason this is more than a nicer Load button:

- A cat has an id (the `pid` it was born with) and a secret (its `psecret`). Call the pair the **cat key**.
- Linking a new device **adopts the cat key**: the device's `whisker-walk-player` and `whisker-walk-secret` become the cat's. Then the profile, friendships, colony membership, finder ids and clan name are all still true on the new device, with **no server change** to any of those tables.
- The cat's `pid` is added to the payload (`payload.cat = { id }`). No SQL change is needed for that: the secret is already the row secret for every row made by Save to cloud (2.2). A row made before this change has no `payload.cat`; it gets one the next time its first device syncs. Loading such a row falls back to today's behaviour (new device keeps its own id) with one line: "Your friends and your clan come back after your first device saves once more."
- Because `pid` is read once at boot (`main.js:86`, used in many closures), a device that adopts a cat key **reloads the page** straight after the swap. Simple and robust. The kid sees one card: "Bringing Mittens here…".
- The device's old key is kept inside the existing undo copy (`before-cloud`) so Undo restores the previous cat completely. The old key's online rows are left alone (they may be live on another device).

One id on two devices is what the kids want ("one cat, many screens"). Its cost: realtime presence keys collide if the same cat is in one room twice (R3).

### 4.2 The kid flow

All text is for a 3rd-grade reading level: short sentences, no "account", "sync", "token", "authenticate", "rate". Strings live in `src/clanphrases.js` ids so both word sets are covered by the existing seam (`PHRASES` in `src/offclanwords.js` overrides where it differs). Only the strings that name the group differ between sets. Everything else is identical.

Where it lives: the Menu tile that is called "Save" / the Cloud save sheet becomes **"My cat"** (usage id `sync` is kept). The "For grown-ups" row still holds Delete my online data. On a brand-new device the launch screen gets one small quiet text link under Go: **"I already have a cat"**, opening the same sheet.

**Screen 1: My cat (nothing linked yet)**

> **My cat, on any device**
> Your cat can visit your other devices. Pick one.
> [ Keep my cat safe ]   (makes the cat code)
> [ Bring my cat here ]  (this device is the new one)

**Screen 2: Keep my cat safe** (first time, makes the code)

> **This is your cat code.**
> **PLUM · OTTER · CROW · MAPLE**
> Write it on paper. Show a grown-up. Keep it safe.
> Anyone who knows it can play your cat.
> To check, type the last word: [ ______ ]
> [ I wrote it down ]

The check step stops the common failure (a code never written down). It accepts the right word, any case. A "Skip, I'll do it later" link sits under it (the code stays viewable in Screen 4).

**Screen 3: Bring my cat here**

> **Bring my cat here**
> Pick one:
> [ I have a hop code ]  (six letters and numbers from my other device)
> [ I have my cat code ] (four words from my paper)

*Hop code entry:* a six-box input using the 31-letter alphabet. Then "Waiting for your other device to say OK…" (polls every 3 s for up to 60 s, like the colony invite).

*Cat code entry:* one text field plus **word chips**: each typed word turns green when it is on the list, red when not. Type the first three letters and tap a word to finish it. A word one letter off the list is offered ("Did you mean MAPLE?") so a typo does not use up a try. This is all client side.

**Screen 4: Is this your cat?** (the preview card, replaces the numbers-only card)

> **Is this your cat?**
> [drawing of the cat, name, rank]
> **Mittens** · Ranger · 1,240 🐾 · 38 walks
> [ Yes, bring Mittens here ]   [ No, not my cat ]
>
> (only when this device already has a cat with progress)
> This device's cat, **Pickle**, will be kept safe on this device. You can get it back with "Undo".
> [ Put both cats together ] (small link)

"Put both cats together" is the merge-without-a-base path (4.5). It is only for the case where the same kid played on both devices before there was a cat code. The default and the big button is always Yes.

**Screen 5: Welcome**

> **Welcome, Mittens!**
> Your cat is here with all its stuff.
> [ Go for a walk ]

**On the first device while a hop code is out (Screen 6)**

> **Add a device**
> On the other device tap *Bring my cat here*. Then type:
> **K7M2QX**
> Good for 10 minutes. [ Cancel ]
> …when someone types it: **A device wants to bring Mittens. Is that you?** [ Yes, allow ] [ No ]

**Screen 7: My cat (linked)**

> ☁️ **Mittens is safe.** Last saved today, 4:12 pm.
> [ Add a device ]  (hop code)
> [ Show my cat code ]  (press and hold two seconds, so it is never up by accident, and never on a TV)
> [ Change my cat code ] (if someone saw it) with a small note: "Other devices will need the new code."
> [ Take my cat home ]  (see 4.3)

Status words used on the sheet and in the Menu badge, never a spinner that blocks play:

| State | Words |
|---|---|
| saved | "Mittens is safe" |
| waiting for internet | "No internet. Mittens is safe on this device. It will catch up later." |
| catching up | "Catching up…" |
| something else changed | "Mittens caught up. Paws, finds and outfits from both devices are here." |
| code not working | "That code didn't work. Check the words and try again." |
| too many tries | "Too many tries. Wait a little, then try again." |
| this device was signed out (code changed) | "This cat moved to a new cat code. Type the new one to bring Mittens back." |

Differences between the two word sets (the rest is identical):

| Phrase id (proposed) | Clan edition words | Everyday words |
|---|---|---|
| `catlogin.welcome.sub` | "Your cat is back in camp with all its stuff." | "Your cat is home with all its stuff." |
| `catlogin.caughtup` | "Mittens caught up. Paws, finds and outfits from both devices are in camp." | "Mittens caught up. Paws, finds and outfits from both devices are here." |
| `catlogin.together` | "your clan's cats" where a clan is named | "your cat friends" |

(Exact wording is for the owner and the kids to approve; ids are stable.) The code word list itself is neutral: it is checked by a test to contain no word from `clanwords.js` or `offclanwords.js`, so the public bundle never carries series words.

**Rules for the flow**

- Nothing blocks play. The game opens from the local save every time. The catch-up runs in the background and changes the visible save only on the home screen, never in a walk (a "Welcome back" toast says what came in).
- The kid never has to choose between "newer" and "older". Section 4.5 does it for them.
- No request is made until the kid links (taps one of the two big buttons). A device that never links behaves exactly as today.

### 4.3 Grown-up recovery and "log out"

There is no parent screen. The grown-up uses the same sheet.

- **Lost or broken device.** On any new device: Bring my cat here, type the cat code from the paper. Mittens arrives with friends and colony intact (4.1). The lost device can still play its old local copy, but it can no longer write once the code is changed.
- **Cat code leaked.** On a linked device: Change my cat code. One call makes a new code and a new secret, moves the row, and changes the secret on the cat's profile (so a stranger holding the old code cannot write as the cat any more). Other devices get "denied" at their next catch-up and show the "signed out" line. The grown-up types the new code on each. (Needs the v11 SQL, M2.)
- **Code lost, device still linked.** Show my cat code (press and hold). Copy to paper.
- **Code lost, no linked device.** The cat cannot be found. This is the cost of having no email. The sheet says so in the "Keep my cat safe" screen: "If you lose this code and every device, we cannot find your cat." Hand-recovery by the owner is possible (privacy@whiskerwalk.org has the existing delete-by-request path), but only for him to look up an id the family can name.
- **Borrowed device (Grandma's tablet).** Bring my cat here with a hop code or cat code, play, then **Take my cat home**: sync now, remove the cat from this device, and put back the cat that was here before (the `before-cloud` copy, kept under its own key `before-login` so later loads do not overwrite it). The device is left as it was found. If the device is offline when the kid taps it: "Connect to the internet first, so Mittens' new things are saved." It will not wipe unsynced progress.
- **Two kids, one device (the Mac).** Version 1 is one cat per device. "Take my cat home" is how the second kid gets the Mac. A "Who's playing?" list with up to three kept cats is a possible later step (open question 3).
- **Delete my online data** stays where it is. With several devices linked, the others get "denied" and stop; their local copies stay.

### 4.4 When does it sync

- **Push:** as today (after a walk, after shop buys, after dressing), but now through a revision check (4.5).
- **Pull:** once at app open (after the first home screen is up), when the device is linked and online, and again after a push says the cloud moved. A pull first asks a tiny question ("what is your revision?", a few bytes). Only if it differs does the device download the save (not the album).
- **Offline:** every walk works; changes wait; "pending" is remembered in `localStorage` and tried at the next open or walk end. If the push or pull fails the kid sees nothing but the quiet status line.
- **Album:** one-time. It goes up at "Keep my cat safe" (first link) and is merged (union by photo id) when a device is brought to the cat. It does not travel on every sync (gap 5).

### 4.5 Conflicts: two devices progressed offline

Method: **three-way merge**. Each linked device keeps `localStorage['whisker-walk-syncbase']`: the revision and a small copy of the counters and sets as they were at its last successful sync (kilobytes, not the save). A pull that finds the cloud at a newer revision merges **local**, **cloud** and **base** field by field, then pushes the result against the cloud's revision. If the push loses a race (the cloud moved again) the device merges once more and retries, up to three times, then waits for the next open.

Design rule: **a kid never loses something she or he earned or owns.** When rules clash, the merge is generous, not strict.

With no base (first link of a device that already has a played cat, or a broken base) counters use "the larger of the two" instead of "base plus both changes", so history is not counted twice.

| Field (`defaultState`) | Rule |
|---|---|
| `points` | base + (local − base) + (cloud − base). For each item bought on both sides since base (same id in both sets, not in base), the price comes back once. Then at least 0 (never negative; if both sides spent the same paws on different things the kid keeps both things, and the paws floor at 0) |
| `lifetimePoints` | base + both gains, never below the larger of the two |
| `bestWalk` | larger |
| `walks` (per area) | per area: base + both gains; no base: larger |
| `visits`, `visitPrizesSeen`, `fightsWon`, `duskWalks` | base + both gains (no base: larger). Prizes and fight moves re-derived from the merged count (as `replaceFromPayload` does today) |
| `unlocked.cats / accessories / areas` | union |
| `equipped` | the side saved more recently (a timestamp in the payload, `savedAt`). Any item no longer owned is dropped to empty, as `sanitizeState` already does |
| `area`, `mapMode`, `edition` | the side saved more recently |
| `customCats` (slots `mine1..mine5`) | slot by slot. Same look in a slot: same cat. A slot used on one side only: kept. Two different cats in one slot and neither was in base: the one already in the cloud keeps the slot, the other moves to the first free slot (up to 3, or 5 with the slots purchase); if none is free it is kept as a **sleeping cat** in a hidden list and comes back when a slot frees. It is never deleted. References to a moved cat (scars, equipped custom, outfits) follow it |
| `moreCatSlots` | true if either side |
| `outfits` (o1..o5) | slot by slot, same collision rule as custom cats (overflow = dropped is allowed here: they are recipes, but both are kept when a slot is free) |
| `foundWear`, `events`, `redeemed`, `retired`, `skills`, `golden`, `fightMoves`, `scarredIntruders`, `gifts`, `grudges`, `keptOffers`, `marks`, `journal` (ids), `den.owned` | union (`redeemed` must be a union so a gift code cannot be used twice by using both devices) |
| `scars`, `feats`, `friends` (greets per stray), `journal` (counts), `usage` | per key, the larger number |
| `den.placed` | the side saved more recently, limited to items owned |
| `streak` | the side with the later `last` day; same day: the larger count |
| `kitten.stage` | larger |
| `race` | the later `date`; same date: the smaller `bestMs` |
| `colony` | the server is the truth when paired: keep the existing `mergeColony`/`colonySync` path and take the pair link from it. Unpaired: union of cats, feeds, trades by their keys |
| `clanRoles` | the existing `settleRoles` rule: a role only moves to a strictly earlier pick, never a demotion |
| `clan`, `clanPick`, `petName` | first non-empty value; both set and different: the more recently saved side (the cat key is shared, so they are normally equal) |
| `tutorial` | `first`: 'done'/'old'/'skipped' beats `null`; hints and `told`: larger |
| `visitPrizePending` | the side saved more recently |
| `version` | the higher; the merge output goes through `sanitizeState` like any load |

How the "never lose" rule shows to the kid: the single toast "Mittens caught up. Paws, finds and outfits from both devices are here." Nothing asks.

Two rules that are implemented as a **test**, not a promise: (1) every top-level key of `defaultState()` must have a merge rule (a test fails when a new field is added without one); (2) merging a save with itself, and merging with an empty cloud, change nothing.

**Cloud rows from old builds.** A device on an old build (a family iPad up to 7 days behind, see `docs/` iOS notes) calls the old `upsert_save`. The v11 SQL (6) makes that call answer `'stale'` for any row that has a revision, so an old build can never overwrite a merged save. The old build shows today's "cloud has newer progress" line and the kid gets the update at the next refresh.

### 4.6 What is NOT synced

| Not synced | Why |
|---|---|
| Settings (`whisker-walk-settings`: volume, music, quality, zoom, left hand, vibration, tips, zoom buttons, perf readout) | Each device is different (a TV, a small phone, a left-handed kid on one iPad). Per device, as the code comments already say |
| Adaptive-quality memory (`whisker-walk-adapt`), perf readout, the gl-reload flag | Measures one device |
| A walk in progress (`whisker-walk-resume`) | Belongs to a device and a moment. A resumed walk is 12 hours old at most |
| The family-words key (`whisker-walk-family-words`, series Phase 3) | A secret by design. Cat login must never put it in the database. Each device is unlocked once with the family gift code. A family cat loaded on a locked device shows everyday words (see that plan's risk 4) |
| Nearby opt-in (`whisker-walk-nearby-opted`), button counters (`whisker-walk-buttons`), den-day / birthday / roofs-guide hint flags | Device-only or per-device hints |
| `whisker-walk-secret` as a **separate** file | It is the cat key, handled in 4.1, never shown |
| The photo album, after the first link | Heavy; one-time union, see 4.4 |
| **Is synced** (new, small) | `payload.social = { met: [...ids], blocked: [...ids] }`, union, each capped at 500. Without them a new device shows no ghosts and no friends (gap 1). The ids are random, as the friendships rows already are; `blocked` is new online data about a child's choice (hide this visitor) and goes in the privacy text |

`usage`: today it is uploaded (gap 6). Recommendation: **keep it synced with the save** (it is a count by screen id, no personal data, and `mergeUsage` already exists) and **fix `docs/PRIVACY.md`** to say "the count travels with your cloud save". The alternative, stripping it from the payload, saves a few hundred bytes and loses the grown-up readout across devices. Owner's call (listed in the plan, not an open question: low stakes).

### 4.7 Offline-first, restated

- No new request is made by a device that has never linked or saved a name. `onlineOptedIn` is unchanged; `test/offlinefirst.test.js` is extended with the new calls.
- The catch-up is a background task with a short timeout. A failed call changes nothing.
- The hop and cat-code entry screens make requests only on the kid's tap.

---

## 5. Security notes

### 5.1 Cat code entropy

- Today: 3 words from 256, plus two digits = 256³ × 100 = 1.68 × 10⁹ = 30.6 bits.
- New codes: **4 words from a 1,024-word list**, no digits = 2⁴⁰ = 1.1 × 10¹² = 40 bits. Words are 3-6 letters, plain nouns (animals, foods, colours, nature, objects), unique by their first three letters (so "type three letters, tap the word" always works), no homophones, no look-alike spellings, no body words, nothing scary or rude in any 4-word pairing that a human would notice. Old codes (3 words + 2 digits) keep working forever; the server accepts both formats.
- What guessing costs an attacker (using the v10 world ceiling of 72,000 wrong codes a day, which holds even when the per-address header is missing): expected days until the first hit ≈ space / (72,000 × N saves). At N = 10,000: 30.6 bits gives 2.4 days; 40 bits gives about 1,500 days. Lowering `ww_limits.world` for `load-miss` to 20,000 a day (a one-line UPDATE) gives about 5,500 days. For the family's own four saves either is far beyond any attacker's reach.
- A typo costs nothing: the client snaps a mistyped word to the list before sending, and sends nothing if a word is not on the list.

### 5.2 Hop code

- Six characters from the 31-letter alphabet = 29.7 bits, **but** it lives 10 minutes, works once, and the old device must tap Allow. One open hop per cat. Success chance for a blind attacker: about `(500 guesses per 10 minutes, world) × (active hops) / 31⁶` = 1 × 10⁻⁵ per window with 20 open hops at once. And the Allow tap on the first device means a wrong guess that happens to hit still does nothing without a person agreeing.
- A wrong hop counts against its own limit (`hop-miss`), per visitor and for the world, same shape as `load-miss`.

### 5.3 Throttling (new `ww_limits` rows, text only)

| name | window | per visitor | unknown | world |
|---|---|---|---|---|
| `hop-open` | 1 hour | 12 | 60 | 600 |
| `hop-miss` | 10 min | 10 | 50 | 300 |
| `hop-miss` | 1 day | 40 | 3,600 | 36,000 |
| `sync-ok` per code | 1 hour | 120 pushes or pulls | n/a | n/a |
| `rotate` per code | 1 day | 5 | n/a | n/a |

The per-code counters use `ww_counts.name` with the code folded in (a hash, not the code, so the counters table never holds a code). A missing `ww_limits` row means refused, the v10 rule, never "no limit". Whether the per-visitor counters work at all depends on the header probe that step 0 of v10 would settle and has not (R7).

### 5.4 Row-level security (sketch, text only)

Same model as today: every table has RLS **on**, no policies, `revoke all` from `anon` and `authenticated`; only `SECURITY DEFINER` functions with `set search_path = public, pg_temp` are granted to `anon`; the code plus secret in the call is the capability. New tables:

- `hops(hop text primary key, code text not null, expires_at timestamptz not null, joiner_ticket text, answer text, handoff jsonb)`: private. `hop_join` stores a random `joiner_ticket` and nothing else. `hop_answer(code, secret, accept)` checks the cat's own secret, then writes the handoff (the cat code and secret) only if accepted. `hop_poll(ticket)` returns the handoff once and deletes the row. Rows are removed after 10 minutes at the next call (as colony invites are) and by `ww_cleanup`.
- `saves` gains columns only. No policy change.
- No function returns more than it needs: `peek_save` returns `{rev, updated_at}` only; `sync_save` returns the payload only when the caller holds the secret.
- All new functions share the existing shape of answers: a short word (`'ok'`, `'merge'`, `'denied'`, `'busy'`, `'bad'`, `'none'`), so the client never mistakes a failure for success (the pattern of `deleteCall`).

### 5.5 Other security points

- `load_save` by code returns the secret (unchanged). The recommendation does not try to hide this: the code **is** the cat's key. The new things are a way to **change** it (rotation) and a stronger default.
- A hostile payload: everything that comes from the cloud goes through `sanitizeState` / `loadState` and the merge's own checks. The merge never trusts counts: results are clamped to existing caps (`asFiniteNonNeg`, `USAGE_MAX`, the 500-id caps).
- The row size cap (2 MiB) and the 300 MB table guard stay.
- The `social.met` list is capped and each entry validated with `isPlayerId`.
- No new third-party code. The Supabase client is already lazy (`getSupabaseClient`).

---

## 6. Schema changes (TEXT ONLY, not applied, not to be applied by an agent)

A new file `docs/supabase-v11-cat-login.sql`, built in the same style as v8-v10 (a runbook comment, numbered steps, every step safe to repeat, a guard that v10 has run, a rollback line per step). The owner runs it by hand or says yes to each step (standing rule: every change to the live database needs his yes, and agents stay off it).

**Step 1: revisions and the cheap question** (adds only; old clients unaffected)

```text
alter table public.saves add column if not exists rev integer not null default 0;
alter table public.saves add column if not exists last_seen timestamptz not null default now();
alter table public.saves add column if not exists v smallint not null default 1;

create function public.peek_save(p_code text, p_secret text) returns jsonb ...
   -- needs the right secret. returns {rev, updated_at, lifetime}. touches last_seen.
create function public.sync_save(p_code text, p_secret text, p_base_rev integer,
                                 p_payload jsonb, p_lifetime integer) returns jsonb ...
   -- right secret only. if p_base_rev = saves.rev: write, rev = rev + 1, v = 2,
   --   answer {status:'ok', rev}.
   -- if p_base_rev <> saves.rev: answer {status:'merge', rev, payload} (no write).
   -- counts per-code and per-visitor limits; 2 MiB cap as upsert_save.
```

`upsert_save` (old name, old clients) changes in one way: for a row with `v = 2` it answers `'stale'` instead of writing. Old clients keep working on `v = 1` rows.

**Step 2: stronger codes and rotation**

```text
-- upsert_save / sync_save accept both code shapes:
--   ^[A-Z]{4,6}-[A-Z]{4,6}-[A-Z]{4,6}-[0-9]{2}$          (old)
--   ^[A-Z]{3,6}(-[A-Z]{3,6}){3}$                          (new)
create function public.rotate_cat_code(p_code text, p_secret text,
                                       p_new_code text, p_new_secret text) returns text ...
   -- one transaction: new row key; saves.secret = p_new_secret;
   --   update profiles set secret = p_new_secret where player_id = <the cat's id>
   --   and secret = p_secret;   (colony auth reads profiles.secret, so the colony follows)
   -- rev + 1; old code deleted. answers 'ok' | 'denied' | 'busy' | 'bad'.
```

The cat's id for `rotate_cat_code` comes from `saves.payload->'cat'->>'id'` (check it is a UUID of an existing profile before changing anything). A cat with no profile (no walking name) rotates only the save row.

**Step 3: hop codes** (adds a private table and four functions)

```text
create table public.hops(...) -- 5.4
create function public.hop_open(p_code text, p_secret text) returns text ...   -- the 6 characters
create function public.hop_join(p_hop text) returns jsonb ...                 -- {ticket}
create function public.hop_answer(p_code text, p_secret text, p_accept boolean) returns text ...
create function public.hop_poll(p_ticket text) returns jsonb ...              -- {status, code?, secret?}
```

**Step 4 (later, only if wanted):** `ww_cleanup` is changed to use `saves.last_seen`, not `updated_at`, and the retention is raised for saves (R5).

No change at all to `profiles`, `friendships` or any colony table. That is the point of adopting the cat key.

Backward compatibility: the client detects missing functions with the existing `isMissingRpc` and falls back (a device on v10-only SQL can still keep the cat code, Load, and a client-side merge on pull via `load_save`, but without the safe revision check). The client therefore ships before the SQL runs.

---

## 7. Milestones (summary; the plan has every task)

Each is mergeable alone, tested, and leaves the game working. DB changes are separate owner-run files.

| | Milestone | Needs SQL | Value alone |
|---|---|---|---|
| M1 | The cat key travels: `payload.cat`, adopt on load, reload, undo restores the old key, `social` (met/blocked) in payload | no | Fixes gap 1 for every load. Colony, friends, clan name survive a move |
| M2 | Three-way merge and catch-up (pure `catmerge.js`, lazy; pull at open; background push with revision) | step 1 for the safe version; works without it by `load_save` | Devices stay in step. This is the "login" feeling |
| M3 | Safe cat code: 4-word codes, snapping, word chips, "I wrote it down" check, show-and-hold, Change my cat code | step 2 | Public-release-grade key; a leak has a remedy |
| M4 | Add a device: hop code, Allow on the first device | step 3 | No typing of four words; the everyday path |
| M5 | Take my cat home (borrowed devices), "I already have a cat" on the launch screen | no | Grandma's tablet; new iPad on day one |
| M6 | Docs: `PRIVACY.md` and `ROADMAP.md` updates, the `usage` text fix, `ios/README.md` two-device checklist | no | Truthful policy |

Budgets (start-up chunk now 705.2 kB gz, ceiling 720, headroom 14.8 kB):

- **All new feature code is a lazy chunk** (`import()`): the merge, the hop client, the sheet markup, the 1,024-word list. `cloud.js` keeps only what the start-up path needs: `normalizeSaveCode`, `getOrCreateSecret`, `payloadBytes`, `isMissingRpc`, `createCloud`.
- Moving today's 256-word `WORDLIST` and `generateSaveCode` out of the start-up chunk **frees about 1.5 kB**.
- Start-up additions allowed: the linked-device check at boot and the dynamic import call, the one status badge. **Target: net change of the start-up chunk 0 kB or smaller; hard limit +2.0 kB.** `test/buildsize.test.js` ceiling stays 720; add `lazyProblems`-style assertions that the new chunk is not in `startupFiles`.
- New lazy chunk: expected 12-20 kB gz (merge 5, word list 5, sheet 4, hop 2). A device downloads it only when it links or has a link.
- Network: a pull is a few hundred bytes when nothing changed; a payload download only on change; a typical save is tens of kB (to be measured in M2 task 1 with the largest fixture; if a mature save is over 150 kB, list which fields to trim before turning on the auto-pull). The album is never part of a sync after the first link.
- Frames and triangles: no 3D work. The Is-this-your-cat card reuses the existing cat stage drawing (`src/ui/catstage.js`).

### Tests (full list in the plan)

- Pure merge: property-style tests (merging with self = identity; with empty = identity; commutative on sets and counters; never lowers `lifetimePoints`, `bestWalk`, the item set); one fixture per field row of the 4.5 table; double-buy refund; paws floor at 0; custom-cat slot collision and sleeping cat; `redeemed` cannot be used twice; a test that fails when `defaultState()` gains a key without a rule.
- Identity: adopt swaps `pid` + secret atomically, the page reload is requested, Undo restores the old pair, a payload without `cat` falls back, a hostile `cat.id` is rejected by `isPlayerId`.
- Offline-first: no network call before link (extend `test/offlinefirst.test.js`); a link with the network down still starts and plays; pending push retried.
- Codes: both formats accepted, 1,024 unique words, unique 3-letter prefixes, no word from either word set (leak test), no look-alike pairs, typo snapping.
- Hop: the whole flow with a fake cloud: open, join, allow, poll, expiry, single use, deny, wrong code counted.
- SQL: static tests like `test/v10limits.test.js` (the file parses; every function has `security definer` and `search_path`; RLS on, no policy; every limit has a row; the rollback lines exist). The live database is never contacted by a test.
- UI: fake-DOM tests of each screen state and both word sets; gamepad focus order (the sheet joins `src/gamepadnav.js` conventions); the code field accepts paste.
- Size: `buildsize` and `lazyProblems`: no new start-up file; the start-up chunk within +2.0 kB.

---

## 8. Risks

| # | Risk | What we do |
|---|---|---|
| R1 | A merge bug loses a kid's work | The merge is pure and tested hard; before any adopt or merge write, the old save goes to `before-cloud`; Undo is on the sheet; the first release turns on pull-and-merge for linked devices only and keeps "ask" mode (shows the merged result on a card with Undo) for the first two weeks, then silent |
| R2 | Old builds on the kids' iPads (up to 7 days behind) push over merged saves | v11 step 1 makes `upsert_save` answer `'stale'` on a revised row; the client ships first and the SQL only after both iPads have the build |
| R3 | The same cat open on two devices at once (same presence key, same colony feed once per walk) | Co-walk presence adds a short device tag to the key; a second device with the same cat in the same room shows "Mittens is already here on another device"; test that nothing crashes; low frequency (the kids' own cats rarely meet themselves) |
| R4 | A code shared in a chat | Hold-to-show, a warning on the code screen, Change my cat code (M3) |
| R5 | The 12-month clean-up (off today) deletes a quiet cat | Do not turn it on until `peek_save` updates `last_seen`; then clean by `last_seen` with 24 months; the owner decides the number |
| R6 | A kid types the wrong cat's code (a sibling's) and "brings" it | The picture-and-name card and "Is this your cat?"; the device's old cat is kept for Undo |
| R7 | The per-visitor limits may not be live (the `cf-connecting-ip` header probe, step 0 of v10, was never done) | The cat code does not rely on them: 40 bits plus the world ceiling is enough alone. The owner can still run the probe |
| R8 | Pid adoption leaves orphan rows (a device's own old profile) | Documented in `PRIVACY.md`: Delete my online data on that device removes them; left alone by default because that device's old identity may live on another device |
| R9 | The law: COPPA, UK Children's Code, GDPR-K | Not legal advice. This design collects no email and no real name, uses a random code and id, and sets no account. The "persistent identifier" is used to keep a child's own game and is not shared. Whether that fits the "internal operations" exception and what retention to state are questions for the lawyer (assessment item 1). The `social.blocked` list and the `usage` text need to appear in `PRIVACY.md` (M6) |
| R10 | Auto-pull on a slow iPad 7 | Pull happens after the home screen is up, with a 5 second timeout, no work during a walk; the merge is small arithmetic |
| R11 | iOS WKWebView storage cleared by the OS | Already true today for any save. A linked cat comes back from the cloud with the cat code; this feature is the safety net |
| R12 | "Take my cat home" deletes progress by mistake | It refuses without a successful sync first; it backs the cat up in `before-login`; a confirm card with the cat's name |

---

## 9. Open questions (7, each with a recommended answer)

1. **Should a new device adopt the cat's id, or keep its own and re-pair friends and colony?** Recommend: **adopt** (4.1). It keeps friends, the colony and the clan name working with no server change. Cost: a second device is "the same player" to other players and the server.
2. **Move to 4-word codes now?** Recommend: **yes for new codes, old codes keep working.** It costs nothing to the family, it is the real fix for gap 4, and the code list moves out of the start-up chunk anyway.
3. **Do the kids share a device (the Mac, an iPad)?** Recommend: **one cat per device in version 1, plus "Take my cat home".** If the kids do share, a later "Who's playing?" list (up to three kept cats on a device) is the next step. If the owner says they share, M5 grows by one milestone.
4. **Album: sync it?** Recommend: **only at the first link and when bringing a device**, as a union by photo id; never on every sync. Photos are pictures of the game world (`PRIVACY.md`), so nothing is lost by this, and syncs stay small.
5. **Does the hop code need an Allow tap on the first device?** Recommend: **yes.** One tap; it turns a six-character guess into something that cannot succeed alone.
6. **When may the 12-month clean-up be turned on?** Recommend: **not before M2 ships and `last_seen` is written**, then 24 months for saves and a note in `PRIVACY.md`. The owner chooses the number.
7. **A small "I already have a cat" link on the launch screen?** Recommend: **yes** (M5). It is the moment a kid with a new iPad needs it, and the owner chose a launch screen with few buttons (Direction A), so it is a quiet text link, not a button.

Not asked, decided in the text: no QR or camera in version 1; the code is called "cat code", never "family code"; `usage` stays in the save and the privacy text is corrected.
