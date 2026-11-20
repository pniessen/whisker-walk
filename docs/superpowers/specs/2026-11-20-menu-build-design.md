# Menu build and tour hints (design, 20 November 2026)

Two parts on one branch (`menu-build`, cut from 8ba1fc28): the menu-review build (report: `2026-11-19-menu-review-report.md`, this folder) and first-time hints for the new things (found outfits, the yarn ball, the world map).

Marking: **Owner** = the owner's decision of 2026-11-19, as he gave it. **My call** = filled in by the build's controller; each one goes to him with the pictures and can be vetoed.

Standing rules (Owner, launch-screen decisions): pink only on Start; nothing removed, only moved. Project rule: every series word through the word tables (`clanphrases.js` phrase ids, with an everyday override in `offclanwords.js` PHRASES); hint lines in `tutorialwords.js`.

## Already on main (checked 2026-11-20, not built again)

- #1 Sound and Music on Paused, "Esc pause" (15071568).
- #2 the cat's personality under its name on a phone, not the rank.
- #5 Play together as the round 👫 beside Start.
- #9 "Explore with Leafpaw" in the quiet style (it now lives in Play together).
- The "explore" wording table (7960ffc6, b1ca7f77); "Start a room", "Do the first lesson again", "Today's place", "Going to:" are in.
- The yarn-ball hints (`hint.yarn`, `hint.bat`, `hint.yarn-carry`, `hint.tkey`, c23dba98). Part 2 checks them in the real game and pictures them, and adds nothing (My call).

## Part 1: the menu

### The Menu after (My call on the layout, from the report's sketch)

```
Menu
🏆 stats line (unchanged)
[ 👫 Play together ] [ 🐈 My clan  ]
[ 📖 Journal       ] [ 📸 Album    ]
[ ⭐ Skills        ] [ 🏠 My den · go now ]
[ 🔊 Sound & controls                  › ]   (a slim full-width row)
  ⚙️ For grown-ups ›                         (one quiet door)
```

- Album stays a tile because #11 is not built (Owner: wait for the usage check). With Album there are six tiles in three rows, and My den sits in the grid as the sixth tile, not full width (My call).
- Offline (no rooms) Play together is missing as today, and the odd last tile spans the row as the CSS already does.
- Sound & controls becomes a slim row under the tiles, as in the report's sketch (My call: the sketch shows it; it is a move, not a removal).

### #7 My clan (Owner)

- The `colony` tile and its sheet heading read **"My clan"** in the clan words and **"My cats"** in the everyday words: one phrase id `menu.myCats` in `clanphrases.js` built from the word set's group word (no series word typed in the source), overridden in `offclanwords.js` PHRASES with `'My cats'`. The sheet id stays `colony` (ids never change).
- Cat friends in one place: the sheet shows, in order, the colony cards (today's), then **Stray cats** (moved from Journal, same heading and rows), then **Player pets** (moved from Play together, same heading, only when cloud is available, loaded when this sheet opens).
- Journal no longer has a Stray cats section; Play together no longer has Player pets. Play together keeps the friend code and "Add a friend by code" (the report puts them under Friends there).

### #6 For grown-ups (Owner)

- The three chips go; one quiet door **"⚙️ For grown-ups ›"** at the bottom of the Menu opens a new sheet `grownups` with four buttons: Game settings, Cloud save (only when sync is available, as today), Gift code, and **Do the first lesson again** (moved from Sound & controls; same label, same handler).
- Back from Game settings, Cloud save or Gift code goes to For grown-ups; back from For grown-ups goes to the Menu. The back stack counts one more layer for those three.
- No Start dock on For grown-ups, as on the grown-ups sheets today.

### #4 paw points (Owner)

Every player-facing "whisker points" (labels and aria labels: HUD, home pill, walk summary tile, den shop) says **"paw points"**. Code comments may keep their words.

### #8 Play together (Owner)

- Outside a room, from the top: **Play now** — two big choices side by side, **Start a room** and **Join a room**. Join a room opens the room-code box and Join button under them (My call: a reveal, so the first sight is two buttons). Then the nearby rows and the sibling "Explore with X", as today.
- **Friends** below: the name box only until a name is saved. With a name saved it is one quiet row, "Your friend name: Leafpaw ✏️", and the pencil opens the box again. Then the star-name picker (Clan Edition), then the friend code and Add a friend by code.
- Tapping Start or Join with no name saved still leads her to the box, as today.
- Every "walking name" says **"friend name"** (labels, intro lines, rules, errors, the colony panel's lines).

### #14 My den (Owner)

Stays a Menu tile; its small line says **"go now"** instead of "Visit". Tapping it still starts the den at once.

### #13 "the town" (Owner)

- Under the place name on the home place card, a small **"the town"** line when the place is the Neighborhood and the save has 5 visits or fewer (My call: "the first few" = 5).
- Through a phrase id `place.townNote` = `'the town'`; the everyday set overrides it with `''` and an empty phrase draws nothing, so the line is only under "Twolegplace" (My call: "Peopleville" says it is a town).
- Also on the map's pop-up card for the Neighborhood, same rule (My call).

### #3 one voice on Home (Owner)

The cat's welcome bubble shows only on the first visit and milestone visits (1, 5, every 10th), which already get the celebration: on those it shows only when the celebration could not open. Ordinary visits get no bubble; the "next thing" line and the clan moment are unchanged.

### #10 Change place for a new child (no owner decision needed)

- On the world map (Clan Edition) a locked place's label carries one short line, **"explore {place} {n} more times"** ("once more" for one), with no counter. The pop-up card keeps the full line with the counter ("opens after you explore … · 0/2").
- "Open places first" means nothing on a map; Legacy's picture-card list puts open places first, locked after, each group in today's order (My call).

### #12 iPad portrait (no owner decision needed)

The phone's stacked home also applies in portrait up to 1100 px wide (iPad mini to iPad Pro portrait), so there is no empty gap between the place card and Start. Landscape iPads and desktop keep the two columns.

### Not built

#11 (Album into Journal, waits for the usage check), #15 (dropped).

## Part 2: first-time hints

All in the existing table (`src/hints.js`), words in `tutorialwords.js` (`hint.<id>`), each shown once per save (`max: 1`), off with "Show tips" off. Wording is mine and goes to the owner.

| id | When | Words (touch / keys the same) | Picture |
|---|---|---|---|
| `find` | a walk's find is not yet taken and its twinkle is within 20 m and ahead of her | "Something is twinkling! Go and see. ✨" | ✨ |
| `find-kept` | the find card has just closed, either answer | "It's yours to keep! Change clothes in Dress up." | 👕 |
| `map` | Change place opens the world map (home, not a walk) | touch "Tap a place to see it. Pinch to zoom." / keys "Click a place to see it. Scroll to zoom." | 🗺️ |

- `find` goes away when the find is taken or out of range. A child who picks up a find before the hint ever went up never needs it: the hint is marked done.
- `find-kept` is offered by the game after the card closes. It may follow `find` inside the usual 60-second gap (My call: it answers her own act, it is not the game nagging); a new flag on the hint, `soon: true`, lets an offered hint skip the gap.
- `map` is shown on the home screen, not by the walk's engine: a small line at the top of the Change place sheet the first time it opens in Clan Edition, counted on the save through the same table. It stays while the sheet is open and is gone the next time.
- Rooftops seam: the walk's facts carry `place` (the area id), and `hints.js` has a short recipe for a place's own first-time hint ("a polled hint with `when: (f) => f.place === '<id>'`"). No Rooftops hint is added.

## Pictures and summary

In the build's scratchpad `menu-build/` folder: home, Menu, My clan, For grown-ups, Play together, Change place for a new child, each hint, in both word sets, on phone, iPad portrait and desktop, with before/after where it helps; and `summary.md` with what changed per item, the calls above, wording to check and open questions.
