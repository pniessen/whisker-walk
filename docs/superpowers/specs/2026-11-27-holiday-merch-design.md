# Holiday keepsakes: shop items, earned prizes and place decor (design, revision 2)

Status: DESIGN ONLY, 2026-11-27, revised the same day for the owner's update (Christmas and Hanukkah shop items, and decor placed in the areas). Revision 2 replaces D1, D3, D4 and D9 to D12 below and adds D13 to D22. No code. Players: a girl of 11 and a boy of 9. Rules: kind, nothing scary, no countdown pressure, no real money, nothing bought. "Merch" here means in-game keepsakes the cat wears, never anything sold.

## What exists today (read before writing)

- Accessories live in `CATALOG.accessories` (`src/progression.js:285-390`): shop items (price), `prize: true` items (visit, fair, area-story prizes such as `snowclasp`, `rainlily`, `acornlocket`), found outfits (`src/foundwear/`, hidden on walks, `find`), and gift outfits (`src/foundwear/gifts.js`, `code: true`). Prizes are rebuilt into `unlocked.accessories` on every load, so a cloud load never loses one, and are kept forever.
- Gift events (`src/giftevents.js`): `EVENTS` table with a `last` date, `wear` list rebuilt on load, `wearOnOpen`, a `present`. `eventWindowOpen(id, now)` already reads local time. The birthday (2026-11-21) is the only event, switched on by a redeem code (`src/redeemcodes.js`).
- Meshes are drawn cat-side (`src/cat/hats.js`, `foundhead.js`, `foundneck.js` FOUND_NECKS / FOUND_COLLARS, `foundbody.js` FOUND_FLOATS); names go through `clanphrases.js` `wear.<id>.name`.
- No holiday calendar exists. "Winter Lights" is not in code yet (Snowville has Lantern Night; the Seaside has still holiday decor, no clock). The only clock code is the event window and `localDay`.
- Word sets: `src/wordset.js` with the family set (`clanwords.js`) and the everyday set (`offclanwords.js`). Holiday names must read well in both, so they are plain words in both and need no series word.
- Budgets: start-up 665.7 of 720 kB gz; per-place chunk 100 kB; the allowance for new work is "up to 5 kB start-up per feature, reported".

## Decisions (each one line; answer yes or change it)

### D1. Which holidays (revised)
Recommend **Christmas** and **Hanukkah** as two separate holidays with equal care (own names, own pieces, own decor, own date table), under **Winter Lights** (1 Dec to 6 Jan), the shared secular umbrella kept for lights, stars, snow and a New Year's note that belong to everyone. Spring Bloom, Harvest Moon and Summer Splash stay later (D12). Neither religious holiday is the "default" winter: a child who keeps neither sees only Winter Lights; both are shown with the same words ("Christmas shelf", "Hanukkah shelf"), the same size, the same kindness.

### D2. Date windows, device clock, safe override
Recommend a table of `{id, from:[m,d], to:[m,d]}` read from the device's local clock once per home screen and per walk start (not per frame), windows recur yearly, a window spanning New Year handled. Override: `?holiday=winter` (or `?holiday=off`) in the URL for testing and for the owner; Settings gets no clock switch for kids. A wrong device clock only changes which errand shows; nothing is lost.

### D3. What each holiday gives (revised: three kinds of thing)
Recommend three kinds, all kept forever once owned: (a) **shop items** for paws (D13, D15), (b) **one earned grand prize per holiday** from a short errand (D4), (c) **decor in the areas** that is look-and-find, not worn (D17 on). Winter Lights keeps its four earned pieces (Lantern Charm collar, Snow Cap head, Light-string Scarf neck, Star Topper Halo back); Christmas and Hanukkah each add one earned piece (D14, D16).

### D4. How the earned pieces come (revised)
Recommend the errand stays as first written (a calm basket of three finds, one per walk) but the finds are now the **holiday's own small things in the area decor**: ornaments for Christmas, dreidels and gelt for Hanukkah, snow-stars for Winter Lights, so the errand and the decor are one build. Nothing earned is only for sale, nothing for sale is only earned: a child who never buys can still get one piece per holiday.

### D5. After the window
Recommend: once earned, kept forever and wearable all year (stored like a prize, rebuilt on every load). Not earned in time: the errand reopens next year, and a one-line kind note says "Back again next year". No expiry, no missed-it message in the child's face.

### D6. How a piece is stored
Recommend one new prize family `holiday: '<id>'` on catalog rows (`prize: true`, price 0, like `fair:` and `reef:`), and a save field `holidays: { winter2026: bitmask }` rebuilt into `unlocked.accessories` in `sanitizeState` as the event wear is. Reuse the gift-event rebuild path so a cloud merge never loses one (merge is the union of bitmasks). No new SQL, rides the existing JSON save.

### D7. Co-walk
Recommend: both cats see each other's worn holiday pieces (ordinary accessories already sync). The seasonal find is hidden from the room seed (same salted stream as found outfits, so both players agree) and a find picked up by either gives the piece to both, as found outfits do. Different holiday windows on the two devices: the host's clock decides the room's holiday; a guest keeps what they earn.

### D8. Accessibility
Recommend: no flashing (lights are steady or a slow pulse under 1 Hz, none at all with reduced motion), every piece readable by shape and not only by colour, find twinkle also has the existing chime, text in the basket in plain words at the reading size already used, pad and TV reachable, VoiceOver names via `wear.<id>.name`.

### D9. Word sets (revised)
Recommend the holiday names and item names are **the same plain words in both sets** (they are real-world holidays, so neither the Clan set nor the everyday set rewords them): each string is a `clanphrases.js` entry, and the everyday set carries a `PHRASES` entry for every id (a set must have every id its tests check, never fall back). The Clan set may colour only the **home basket line and the area greeting** ("The camp is hung with lights" vs "The street is hung with lights"); no series word appears in any item name. Banned-word scan on every holiday string (scary, dark, lost, trapped, hurt, dead, grave, haunted, fight).

### D10. Size per piece (revised)
Recommend: a worn piece about 0.3 to 0.6 kB gz in the lazy `holiday` chunk; catalog row plus both phrase entries about 0.2 kB each in start-up. Planned: 4 Winter + 2 grand + 10 shop = 16 pieces now, about 7 kB chunk and about 3.3 kB start-up. Under 120 triangles each.

### D11. No money, no pressure
Recommend: paw prices only (the game's own points, no real money, nothing sold for cash, no bundles, no "last chance" wording). Seasonal shelves close quietly and reopen next year (D15); no streak for lighting a candle, no missed-night message.

### D12. Build order (revised)
Recommend Winter Lights, Christmas and Hanukkah first, in that order of risk (the calendar and shop first, decor last); the other three seasons stay a later wave.

## The two holidays in detail

### D13. Dates: computed or tabled, offline
Recommend a **table, never a calculation**, in `src/holidays.js`: Hanukkah moves each year by the Hebrew calendar, which is not worth shipping code for, and `Intl` Hebrew-calendar support differs by device and cannot be trusted offline. Table ten years of `firstNight` (the calendar date of the evening the first candle is lit); a window is `firstNight` through `firstNight + 8 days` (night n is lit the evening of firstNight + n - 1, and the last day ends at nightfall). Christmas is fixed (1 Dec to 26 Dec for shelf and decor, 25 Dec the day). Outside the table (year 2036 or later) the window falls back to a single fixed fortnight starting 5 Dec and the owner is told in the plan; the plan adds a test that the table has every year from this build's year to at least +8, so the owner refreshes the table in an ordinary release. Dates for the table (first candle evening; to be checked against two published calendars before the build merges, they are from memory and the plan says so):

| Year | Hanukkah first night | Last day |
|---|---|---|
| 2026 | Fri 4 Dec | Sat 12 Dec |
| 2027 | Fri 24 Dec | Sat 1 Jan 2028 |
| 2028 | Tue 12 Dec | Wed 20 Dec |
| 2029 | Sat 1 Dec | Sun 9 Dec |
| 2030 | Fri 20 Dec | Sat 28 Dec |

(2031 onward are filled in at build from a published source.) Christmas 2026: Fri 25 Dec. A window year is the local year of the clock; an eight-night window crossing New Year (2027) is handled as in D2. The override `?holiday=hanukkah&night=3` (testing only) pins the night.

### D14. Christmas: shop items, earned piece, sale window
Recommend **five shop items** and one earned piece. Shop (paws, the game's existing 20 to 45 tiers): **Red Cozy Hat** (head, 30, a soft red cap with a white band and pompom), **Reindeer Antlers** (head, 35, small, with a tied ribbon), **Jingle Collar** (collar, 25, a red band with a small gold bell, the cheapest tier), **Candy-stripe Scarf** (neck, 30), **Evergreen Sweater** (body, 35, green with a small red pattern). Earned (the Christmas errand): **Little Gold Star** (back float, a star hovering over the shoulders, prize, never sold). Sold during the **Christmas shelf**, 1 Dec to 26 Dec, and **all year after, at the same price in the shop's "Seasons" row**? Recommend **in season only** (the shelf is part of the fun and reopens each year), so nothing is ever "missed for good".

### D15. Hanukkah: shop items, earned piece, sale window
Recommend **five shop items** and one earned piece, the same price tiers as Christmas. Shop: **Blue Star Beanie** (head, 25), **Dreidel Charm** (collar, 25, a small four-sided spinning top; the letters are plain marks, not text), **Blue-and-Silver Scarf** (neck, 30), **Gelt Pouch** (back, 30, a little blue pouch with gold coins showing), **Silver Snowflake Sweater** (body, 35, blue). Earned (the Hanukkah errand): **Menorah Glow** (back float, a small eight-light menorah with steady flames that shows tonight's candle count; prize, never sold). The shelf is open for the **window** (first night to last day) and for the **week before** so a family can see it coming; closed the rest of the year; reopens next year. The Star of David is not used on an item (D18).

### D16. Prices and tiers
Recommend the existing tiers (20 collar-and-head basics, 25 to 30 the middle, 35 the top for body), no item over 35, so a child with the game's ordinary paw income buys a piece in one or two walks; no discounts, no bundles.

### D17. Embedded area decor: where (cheapest first)
Recommend **six places**, in this order, each a short list of small things. Cost figures are planning numbers (gz in the lazy `holidaydecor` chunk, triangles added, draws added), measured then set:
1. **The Cozy Neighborhood** (the first thing every child sees): wreaths on door fronts, strings of steady lights along two roof edges, one tree in a front window and a menorah in another window whose candles follow the tonight count; about 2.2 kB, 700 triangles, 3 draws.
2. **The Old House** (interior): stockings on the mantel, a small tree, a menorah on the sill; about 1.6 kB, 500 triangles, 3 draws.
3. **Market Square**: a tree in the square, a wreath on each stall, a **dreidel-and-gelt stall** (decor only, nothing bought); about 2.4 kB, 800 triangles, 3 draws.
4. **Appletree Farm**: a wreath on the barn, a lit tree by the farmhouse, a menorah in the farmhouse window, stockings on the porch; about 1.8 kB, 600 triangles, 3 draws.
5. **City Park**: one large lit tree and a **big menorah** by the pond with the night count, and light strings along the bandstand; about 2.6 kB, 900 triangles, 4 draws.
6. **Snowville**: the village already glows; add a lit tree in the square and a menorah on the inn sill; about 1.4 kB, 500 triangles, 2 draws (waits for the Snowville build to land).
**Not included**: the Fairground (95.8 of 100 kB, 74.3k of 75k triangles, no room), the Seaside, the Docks. Total about 12 kB gz in one lazy chunk, 4,000 triangles over six places, at most 4 added draws in any one place.

### D18. Respect rules for the Hanukkah and Christmas decor
Recommend: the menorah is drawn with nine lights (eight plus the shamash), the shamash set higher, the candles lit left to right as the nights pass, one more lit each night, steady glow; dreidels are plain wooden or blue-and-silver tops; **no religious figures, no scripture, no text on any item**; no Star of David or crosses on an item or decor, only the menorah, dreidel, gelt, tree, wreath, stocking and lights; wording is plain ("Hanukkah", "Christmas", "tonight is the third night"). Sensitivity check by the owner before any release (the plan has the picture-page review as its gate).

### D19. How decor is built (the instanced and merged rule)
Recommend: each kind of thing (all wreaths, all stockings, all light strings, all dreidels) is **one merged geometry or one InstancedMesh per kind per place**, never a mesh per object; positions are hand-placed data in `src/world/spots/holiday.js` (like the found outfits), drawn from their own seeded stream so no other draw moves; **no colliders** (decor sits on walls, sills, rooftops or beside the path, never in the walkway) except a tree trunk, which is a tiny non-blocking mark; no text, no prompts, no perches; the window decides at build time whether the decor is built at all (a closed window builds nothing, so outside the season the cost is zero); the area's own budget row is re-measured, never raised.

### D20. Things to find (the errand pieces in the decor)
Recommend: in each of the six places up to two small finds (an ornament in the Christmas window, a dreidel or a gelt coin in the Hanukkah window), the same pick-up rules as found outfits (twinkle from 20 m, chime within 6 m, no spawn within 15 m, no-skills reach), one counted per walk; collecting three gives the holiday's earned piece. Gelt collected is a counter and a kind line, **not paws** (no money pressure, no gambling-looking mechanic; the dreidel is never spun for a result).

### D21. Candles night by night
Recommend the home line and the menorah read `nightOf(now)` from `holidays.js` (1 to 8, from the table), so on 4 Dec 2026 one candle is lit and on 12 Dec eight. Nights are counted by the local calendar date for the whole day, so a child at lunch on the third day sees three candles (the lighting is "tonight"). Nothing happens if a night is missed: the next day simply shows more candles. Reduced motion: flames do not sway.

### D22. Co-walk for decor
Recommend: the host's clock decides the room's holiday (the same as D7), the decor is built from that holiday so both see the same place, finds come from the room seed so both agree, and each player's own shelf and owned pieces are their own save.

## Home, launch and menu flair (revision 3)

How the screens are built today (launch-screen spec, Direction A, `docs/superpowers/specs/2026-11-05-launch-screen-design.md`; `src/ui/homebase.js`, `src/ui/hometabs.js`): a HUD top bar of translucent pills (title as plain text on desktop, kept for screen readers on a phone), the cat stage, the Wearing and Today's walk cards, Start the walk as the only pink element, the Menu sheet with a stats line, six tiles and a "For grown-ups" group, and a Settings sheet that already holds `reducedMotion` (`src/settings.js:13`) and a short Advanced group.

### D23. What the flair is
Recommend small, quiet, in-window only: (a) a **string of steady lights** under the top bar (a thin strip of dots, a different colour set per holiday), (b) a **seasonal greeting line** under the cat's name, (c) on Hanukkah a **menorah badge** beside the visit pill with tonight's candles lit, on Christmas a **small tree-and-wreath badge**, (d) a faint **snow-dust** on the title (Winter Lights only, a few CSS dots), (e) a **tinted menu header** (deep blue and silver for Hanukkah, green and red for Christmas, the usual dark for Winter Lights). Nothing moves a layout, nothing sits in the way of Start, which stays the only pink element.

### D24. Equal and respectful
Recommend the same size, the same position and the same quality of treatment for both: one badge each, one greeting each, one tint each; during the days they overlap (1 to 26 Dec) the home shows **the nearer holiday only** (the one whose own day is closer, ties go to the one that began first), with the other in the Menu header line, so neither is crowded out and neither is merged into a single "holiday" look. A child can pick which to see in Settings (D27).

### D25. Greeting lines (both word sets)
Recommend one line per holiday, plain, no series words, identical in both sets (the Clan set may say "camp" where the everyday says "street", D9): Christmas "Merry Christmas! Lights are up all over." Hanukkah "Happy Hanukkah! Tonight is night 3." (night from D21), Winter Lights "Happy Winter Lights!". Every id has an entry in both word sets and the word-set structural test runs.

### D26. How it is built, and what it costs
Recommend **CSS and a few DOM nodes, no canvas, no images**: the light strip is one element with a repeating radial-gradient background, the menorah badge is one inline SVG of nine small shapes with the lit ones chosen by a class, the tree and wreath badge is one small inline SVG, the snow-dust is a few absolutely-placed dots. All of it is built by a **lazy module `src/ui/holidayflair.js`** that home and the menu import dynamically only when the window is on and the setting is on; a closed window loads and builds nothing. Start-up cost: one `import()` hook and the CSS custom properties in `homebase.js`, **about 0.4 kB gz** (the flair itself about 2.5 kB gz in the lazy chunk). Tint by CSS variables only, no layout reflow.

### D27. Switch in Settings
Recommend a Settings row "Holiday decorations" with three choices, **Automatic** (default), **Christmas**, **Hanukkah**, **Off**; it hides the home and menu flair and the area decor (D19) but never the shop shelf or what the child owns, and it applies at once. Stored in `settings.js` (default `auto`), which the cloud save already carries.

### D28. Reduced motion, phone, TV, accessibility
Recommend: under reduced motion the lights do not twinkle and the snow-dust does not drift (static), otherwise a very slow 6-second fade under 1 Hz; no flashing at all; text contrast kept at the HUD pills' level on the tinted header; the badges are decorative with `aria-hidden` and the greeting line is real text (so a screen reader reads "Happy Hanukkah! Tonight is night 3."); on a phone the strip is 6 px tall and the badge 28 px, on a TV (the 10-foot layout) both scale with the existing TV scale, kept clear of the safe margin; pad focus order unchanged (flair takes no focus).

### D29. Budget for this part
Recommend: start-up **about +0.4 kB** (hook plus CSS variables), the lazy flair chunk about 2.5 kB, no new draw calls (DOM only, no 3D), no change to the first paint.

## Not in scope
Real-world purchases, trading holiday pieces (prizes are untradable like every prize), a calendar screen, holiday-only areas, sound beyond the existing chime.

## What the owner must decide (revision 2)
D1 two holidays plus Winter Lights umbrella; D13 table of dates (and that I verify them against two sources before merge); D14 and D15 the ten shop items, names and prices; D14 and D15 sold in season only; D16 price tiers; D17 the six places (Neighborhood, Old House, Market Square, Farm, Park, Snowville), not the Fairground; D18 respect rules (no Star of David on an item); D20 gelt is a counter, not paws; D4 the earned errand; D12 order; D23 which flair pieces; D24 nearer-holiday-only rule on days that overlap; D27 Settings choices (Automatic, Christmas, Hanukkah, Off). Everything else is a default.
