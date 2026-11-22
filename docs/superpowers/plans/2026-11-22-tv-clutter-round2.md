# TV clutter, round 2 (notes; not started)

Round 1 (merged into tv-mode): Paused card, walking HUD layers, pad hints for every key name, Welcome back card, TV type system.
Round 2 waits for the owner's photos of round 1. Findings so far, from the owner's photos:

## Clan-pick card ('The clans have noticed you!')
- Tiles are narrow columns: words wrap one or two per line, 'StormClan'/'BrookClan' clip at the tile edge.
- The fifth tile (CliffClan) wraps to a second row: lopsided.
- The 'Whisker Walk 2' mascot sits behind the tiles and shows through the text.
- Bottom row ('Not yet' + note) is cramped.
- Home base behind it is cut off at the left and right edges (check safe margins on the header row and buttons; check horizontal overflow at 1920x1080 and 3840x2160); page text behind shows through.
- A first draft of the CSS (5 tiles in a row, 3 + 2 under 1500 px, name 28 px / place 24 px, 64 px 'Not yet', solid 0.9 scrim):

```css
/* The clan pick: five tiles in one row (3 + 2 on a narrow window), the name large and the place smaller. */
html.tv .join-moment { padding: var(--tv-safe-y, 5vh) var(--tv-safe-x, 5vw); box-sizing: border-box; background: rgba(14, 19, 29, 0.9); }
html.tv .join-moment .join-moment-card { max-width: min(calc(1700px * var(--tv-s, 1)), 100%); padding: calc(28px * var(--tv-s, 1)) calc(36px * var(--tv-s, 1)); gap: var(--tv-gap-l); }
html.tv .join-moment h2 { font-size: var(--tv-title); line-height: 1.15; margin: 0 0 var(--tv-gap); }
html.tv .join-moment-paws { display: none; }
html.tv .join-moment-ask { font-size: var(--tv-body); margin: 0 0 var(--tv-gap-l); }
html.tv .join-moment .dr-homes { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--tv-gap-l); }
html.tv .join-moment .dr-home { min-height: 0; padding: calc(16px * var(--tv-s, 1)); font-size: var(--tv-small) !important; font-weight: 500; line-height: 1.4; text-align: left; align-items: flex-start; gap: calc(6px * var(--tv-s, 1)); overflow-wrap: anywhere; }
html.tv .join-moment .dr-home .dr-home-name { font-size: var(--tv-body); font-weight: 700; line-height: 1.2; }
html.tv .join-moment .dr-home small { font-size: var(--tv-small) !important; opacity: .92; }
html.tv .join-moment-foot { margin-top: var(--tv-gap-l); gap: var(--tv-gap-l); }
html.tv .join-moment-later { min-height: calc(64px * var(--tv-s, 1)); padding: 0 calc(32px * var(--tv-s, 1)); font-size: var(--tv-body); }
html.tv .join-moment-note { font-size: var(--tv-small) !important; opacity: .9; }
@media (max-width: 1500px) { html.tv .join-moment .dr-homes { grid-template-columns: repeat(3, minmax(0, 1fr)); } }

```

## Prompt and confirm dialogs (gateway 'Head to the River and Marshes?', border, place change, Head home, fight, delete confirms)
- Buttons are tiny, in a default font (Arial-like), far below the 24 px floor.
- Title and subtitle float over the 3D scene with no card or scrim.
- The key strip shows under the prompt and runs off both screen edges.
- No pad glyph on the buttons (A accept, B cancel) while other cards have them.
- Fix: one TV card for all of them (scrim, rounded face, big buttons with glyphs, safe margins). List every dialog (grep confirm / prompt / gateway / modal / dialog in src/ui and src/world).

## Other home-base cards
Dress up, Change place map, Settings, Skills, Journal, Den shop: check the same wrapping and clipping; list what is fixed.

## 'Home again!' trip summary card
- The four stat tiles are uneven (heights, offsets); 'discoveries' touches or overflows its tile edges.
- Labels wrap to two lines ('paw / points', 'cats / greeted', 'goals / done') in narrow tiles.
- 'What a trip!' is a small bold line between the big title and 'your best: 132': three sizes crammed together.
- 'Continue' has no pad glyph (X) though the other TV cards do.
- All four stats read 0 / 0 / 0 / 0/3 right after a trip: check whether the summary renders with reset counters when she is simply returning home (possible bug, counters reset before the card is drawn). Report; fix only if trivial.

## 'Change place' map
- Labels collide: 'The Island' and 'in the Pines and Swamp' overlap the lake and each other; 'The Rooftops', 'Twolegplace', 'The Market Square' and 'The Old Twoleg Nest' pile into one cluster; 'The Old Docks' unlock lines overlap the dotted path.
- Lock-hint lines ('explore City Park 2 more times') are tiny, well below the 24 px floor, cramped in small blobs.
- The map uses a handwriting-style face unlike the rest of the UI, with a thin text outline that looks fuzzy from the sofa.
- The map fills about 60% of the width: on TV let the card be about 90% wide, with bigger +/- buttons.
- 'Press X to go here' repeats on every unlocked place: say it once in a footer, keep place names only.
- Check pad navigation (d-pad / stick jumps to the nearest place, A goes, B back) and a clearly visible focus ring on the selected place.
- Cropped photos: measure edge clipping at 1920x1080 and 3840x2160 before changing any safe margin.

## Home base (owner photo)
- Cat slot row (round thumbnails about 40 px, '+ Make a cat', '8 more') and the caption 'Tabby / Curious - sniffs out hidden treasures' are small for the sofa; check how the pad moves between slots.
- Big empty gap in the right column between the Today's place card and 'Feed Ramen again: 3 of 6.'
- Header pills (title, paws, rank, Visit n) are small next to the huge Menu button.
- Copy the Change place card's clear focus-ring style to every focus ring.
- 'drag to spin' is mouse wording with the pad as the input (round 1 keyboard audit item; the pad's right stick should spin the cat: unverified).

## Change place: unlock flow (owner photo)
- 'Open The Old Docks for 100 paws?' confirm is a small box in the middle of the map: awkward title wrap, 'Yes, open it' wraps to two lines, text under the floor, covers labels. Make it the same TV dialog as the fight prompt (yellow card, big buttons with glyphs: X yes, Circle not now, visible ring). Default focus on a paid action stays on the safe choice.
- The place preview card (photo, 'You have 905', 'Open for 100') floats at the lower right and covers the map's right side; it has a tiny close X. Reserve a fixed side panel (map about 65% left, panel about 30% right); B closes; no close X.
- Map labels still wrap and cluster ('The Market Square press X to go here' in four lines, 'The Old Twoleg Nest').

## 'Home again!' zero counters (investigated in round 1)
- bankWalk reads session.discoveryCount, session.catsGreeted, session.goals and state.points - session.startPoints before the teardown; a resumed walk restores them (walkresume.js). I found no path that resets them early. A summary of 0/0/0/0-of-3 matches a walk that was just begun (Ready? card then Head home), whose own counters are zero while 'your best' is the save's. Not reproduced as a bug; ask which path she took (Fairground trip -> Continue -> new walk -> Head home?).
