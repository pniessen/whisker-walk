# Launch screen, Direction A: "Cat, place, go" (2026-11-05)

Source: the designer review of the home base at main 2de4117 (scratchpad
`launch-review/review.md`, `mockup-A.html`) and the owner's answers the same day.

## Goal

The home screen answers three questions only: *who am I walking as, where,
go.* Everything else sits one tap behind three named doors: **Dress up**,
**Change place** and **☰ Menu**. One screen with no scrolling at 1280×800 and
390×844. Nothing leaves the game; things only move.

## Home

Desktop: the cat stage on the left with the portrait strip under it; on the
right, Wearing, Today's walk, Start and Play together. Phone: one column,
cat on top, two big tiles (Dress up, the place), and a pinned dock with a
round Play together button and Start.

- **Top bar** (HUD style: translucent dark pills, 999px radius, the light paw):
  - the title as plain text, `🐾 Whisker Walk 2 · Clan Edition` (desktop; on a
    phone it is kept for screen readers only). **It is not a button.**
  - `🐾 1240` points pill (aria-label "1240 whisker points");
  - `🏆 Rooftop Royalty` rank pill (desktop; on a phone the rank title sits under
    the cat's name instead);
  - the visit pill `🐾 Visit 12` (`🎉 Visit 30` on a milestone): quiet HUD
    style, small, never pink. It still pops once when a milestone celebration
    opens (no animation under reduced motion).
  - `☰ Menu` on the right.
- **Cat stage**: unchanged (the live cat, name, blurb, buy / Change my cat).
  "↔ drag to spin" stays.
- **Portrait strip**: owned cats, her own cats, `＋ Make`, then a `🔒 N more`
  tile that shows the locked cats in the strip (tap again: `less`). Locked
  cats keep their preview and Unlock behaviour.
- **Wearing**: the worn items (picture + name), or "Nothing on yet", and a
  **👗 Dress up** button. Dress up opens the wardrobe: the slot grid with the
  picker under the open slot and a **Done** button. In the wardrobe an empty
  slot reads `＋` and the slot name, not "nothing yet". The old
  "WEARING · 2 OF 7 SLOTS · 2 OF 28 OWNED" label and the abilities chip are gone
  (the count moves to the Skills tile).
- **Today's walk**: one picture card for the place the player will walk (the
  effective place, so Legacy never names a Clan-only place), with a line under
  the name (Clan Edition: `StormClan land` on a clan territory) and a
  `Change place ›` chip. The whole card is one button that opens the Change
  place sheet. While the wardrobe is open the card steps aside and the dock
  says `Walking in The Woods` instead, so Start always says where it goes.
- **Start the walk 🐾**: the biggest button and **the only pink element** on
  home. Enter starts the walk while nothing else has focus and no sheet,
  card or builder is up.
- **Play together**: one secondary button (round, 👫, on a phone; an outlined
  pill on desktop). In a room it reads `👫 2 together`. It appears once.
- The dusk toggle (glow collar only) sits in the dock beside Start.

## Change place sheet

Title "Where to?". Clan Edition: the clan as one line (`You're StormClan`,
`You're both StormClan!`, or the ally), or, when the Woods is open and she has
no clan, a `Choose your clan ›` button that reopens the clan moment. Then the
territory map (unchanged), "More places" (Park, Seaside, Docks) and a **My den**
card. Legacy: the place cards and My den. Tapping a place the player can walk picks
it and goes back home, where the card shows it; a place that opens or is
bought the same way picks it too. A locked or unaffordable place stays put.
My den starts the den walk, as "Visit your den" did (not offered in a room).
A walk that ended at a border post opens home on this sheet.

## Menu sheet

- Stats line: streak (2+ days), best walk, golden mice, today's race best,
  Mochi, and the rank's next step in plain words (`1200 🐾 more to Shadow Prowler`,
  or `Top rank!`).
- Six big kid tiles: Play together (when multiplayer is on), Colony, Journal,
  Album, Skills (`0 of 12 earned`), Friends.
- "For grown-ups": Settings, Save (cloud sync, when set up), Secret code.

Every sheet has a ← Back button. A sheet opened from the Menu goes back to the
Menu; Menu and Change place go back home. Content sheets keep Start pinned at
the bottom (the host-a-room flow starts from Play together); Menu and Change
place are doors, so they have no dock.

## The clan moment (Clan Edition)

A one-time story card, "The clans have noticed you!" / "Which clan will you
join?", with the five clan cards (emblems, partner tags) and a `Not yet`
button. It shows when all hold:

- Clan Edition, and no own pick (`state.clanPick.mine` is null);
- the Woods is open: two walks in Twolegplace, or the Woods owned
  (`CATALOG.areas.woods.requires`);
- this device has not shown it before (localStorage
  `whisker-walk-clan-moment-seen`);
- home is showing, and no celebration, Rosa notice, "While you were out" card
  or cat builder is up.

It is tried after the boot greeting (never under the splash or with the
visit celebration), each time home is shown after a walk (the walk that opens
the Woods brings it up straight away), and when one of the other cards
closes. Picking a clan saves the id exactly as before (`setClanPick`, then the
partner sync), and closes it. Afterwards the clan changes only in Settings.
The five cards no longer sit on home.

## Settings

- The edition select (the only edition switch).
- The clan select (Clan Edition).
- A small "Advanced" group at the end: the fps readout and graphics quality.

## Other fixes

- Play together and Friends (and Sync, Colony pairing) use the game's pill
  buttons, not the old blue system-font squares.
- Pink only for Start: the selected portrait and place use cream/gold rings;
  Unlock buttons (slot picker, hero) are outlined.
- Plain words on home: no count labels.

## Legacy

The same layout without the clan line, the map, the clan moment or the clan
select; the place card shows the effective place.

## First run

Visit 1 celebration over the quiet home; then the welcome line. The clan
moment can't show on a first run (the Woods opens after two walks). No stacked
overlays.

## Data

Nothing new in the save. The pick is still `clanPick.mine` (an id). The
moment's seen flag is per device in localStorage: on a new device a kid with no
pick sees it once more, which is harmless.
