# Holiday keepsakes: seasonal accessories and prizes (design)

Status: DESIGN ONLY, 2026-11-27, for the owner's yes/no. No code. Players: a girl of 11 and a boy of 9. Rules: kind, nothing scary, no countdown pressure, no real money, nothing bought. "Merch" here means in-game keepsakes the cat wears, never anything sold.

## What exists today (read before writing)

- Accessories live in `CATALOG.accessories` (`src/progression.js:285-390`): shop items (price), `prize: true` items (visit, fair, area-story prizes such as `snowclasp`, `rainlily`, `acornlocket`), found outfits (`src/foundwear/`, hidden on walks, `find`), and gift outfits (`src/foundwear/gifts.js`, `code: true`). Prizes are rebuilt into `unlocked.accessories` on every load, so a cloud load never loses one, and are kept forever.
- Gift events (`src/giftevents.js`): `EVENTS` table with a `last` date, `wear` list rebuilt on load, `wearOnOpen`, a `present`. `eventWindowOpen(id, now)` already reads local time. The birthday (2026-11-21) is the only event, switched on by a redeem code (`src/redeemcodes.js`).
- Meshes are drawn cat-side (`src/cat/hats.js`, `foundhead.js`, `foundneck.js` FOUND_NECKS / FOUND_COLLARS, `foundbody.js` FOUND_FLOATS); names go through `clanphrases.js` `wear.<id>.name`.
- No holiday calendar exists. "Winter Lights" is not in code yet (Snowville has Lantern Night; the Seaside has still holiday decor, no clock). The only clock code is the event window and `localDay`.
- Word sets: `src/wordset.js` with the family set (`clanwords.js`) and the everyday set (`offclanwords.js`). Holiday names must read well in both, so they are plain words in both and need no series word.
- Budgets: start-up 665.7 of 720 kB gz; per-place chunk 100 kB; the allowance for new work is "up to 5 kB start-up per feature, reported".

## Decisions (each one line; answer yes or change it)

### D1. Which holidays
Recommend four, all invented-neutral and cute: **Winter Lights** (1 Dec to 6 Jan), **Spring Bloom** (15 Mar to 30 Apr), **Harvest Moon** (the Halloween slot: 20 Oct to 2 Nov; pumpkins, bats-as-friends, a sleepy ghost sheet, never scary), **Summer Splash** (15 Jun to 31 Aug). Birthdays stay as gift codes (existing path). No country-specific religious holidays by name; the owner can add one by data.

### D2. Date windows, device clock, safe override
Recommend a table of `{id, from:[m,d], to:[m,d]}` read from the device's local clock once per home screen and per walk start (not per frame), windows recur yearly, a window spanning New Year handled. Override: `?holiday=winter` (or `?holiday=off`) in the URL for testing and for the owner; Settings gets no clock switch for kids. A wrong device clock only changes which errand shows; nothing is lost.

### D3. What a holiday gives
Recommend 4 pieces per holiday (16 total at first, Winter Lights first), one per slot kind so none overlap: a head piece, a neck or collar piece, a back or float piece, and one that is the "grand prize" for finishing the errand set. Candidate Winter Lights set: **Lantern Charm** (collar, a tiny glowing lantern), **Snow Cap** (head, soft white pompom hat), **Light-string Scarf** (neck, small coloured bulbs, no flashing), **Star Topper Halo** (back float, a small star hovering, grand prize). Other seasons are listed in the plan and chosen by the owner after Winter Lights ships.

### D4. How they are earned
Recommend a short seasonal errand, not a purchase: during the window, a **Holiday Basket** sits on the home screen (one line, no timer): collect 3 small seasonal finds (one per walk, hand-placed spots in the existing neighbourhood, Park and Farm, never in a place the child cannot reach, no-skills reach) and the pieces come in order, one per find, the fourth after the third find on a co-walk or a solo walk. At most one find per walk, never time-boxed within the window.

### D5. After the window
Recommend: once earned, kept forever and wearable all year (stored like a prize, rebuilt on every load). Not earned in time: the errand reopens next year, and a one-line kind note says "Back again next year". No expiry, no missed-it message in the child's face.

### D6. How a piece is stored
Recommend one new prize family `holiday: '<id>'` on catalog rows (`prize: true`, price 0, like `fair:` and `reef:`), and a save field `holidays: { winter2026: bitmask }` rebuilt into `unlocked.accessories` in `sanitizeState` as the event wear is. Reuse the gift-event rebuild path so a cloud merge never loses one (merge is the union of bitmasks). No new SQL, rides the existing JSON save.

### D7. Co-walk
Recommend: both cats see each other's worn holiday pieces (ordinary accessories already sync). The seasonal find is hidden from the room seed (same salted stream as found outfits, so both players agree) and a find picked up by either gives the piece to both, as found outfits do. Different holiday windows on the two devices: the host's clock decides the room's holiday; a guest keeps what they earn.

### D8. Accessibility
Recommend: no flashing (lights are steady or a slow pulse under 1 Hz, none at all with reduced motion), every piece readable by shape and not only by colour, find twinkle also has the existing chime, text in the basket in plain words at the reading size already used, pad and TV reachable, VoiceOver names via `wear.<id>.name`.

### D9. Word sets
Recommend all names are in `clanphrases.js` for the family set and as `PHRASES` overrides in the everyday set only where the family set uses a series word (it will not). The structural test (no series word outside the word-set files) runs. Banned-word scan on every holiday string (scary, dark, lost, trapped, hurt, dead, ghost-as-scary; "ghost sheet" is "sleepy sheet cat").

### D10. Size, per piece
Recommend: each mesh builder about 0.3 to 0.6 kB gz (a few primitives, shared materials), the four-piece set about 2 kB gz; the whole 16 pieces about 8 kB gz, as a **lazy chunk** `holiday` loaded only when a window is on, a find is near, or the dressing room is opened with a holiday piece owned. Catalog rows and strings in start-up: about 0.15 kB per piece, so **under 1 kB start-up for Winter Lights, about 3 kB for all 16**, inside the 5 kB allowance. Triangles: under 120 per piece, no new transparent draw except a glow quad on lanterns.

### D11. No money, no pressure
Recommend: no paws price, no streaks, no daily login, no "limited time" red badges, no notifications. The basket is one calm line on home with the season's name.

### D12. Build order
Recommend Winter Lights first (the window opens in 4 days, so a stripped first slice is the aim: window helper, one find spot per area, four pieces), then Spring and Harvest Moon, then Summer.

## Not in scope
Real-world purchases, trading holiday pieces (prizes are untradable like every prize), a calendar screen, holiday-only areas, sound beyond the existing chime.

## Open questions the owner must answer
D1 holidays and names, D3 Winter Lights piece list, D4 errand shape, D5 reopen next year, D12 order. Everything else is a default.
