# Whisker Walk: could the menus be lighter? (review, 19 November 2026)

Nothing in the game was changed. A designer agent played this morning's main in a headless browser (sound off) with two saves, a first-time child and a returning child (9 places, 7 cats, 22 things to wear, a clan, 5 skills, visit 42), at phone, two iPad and desktop sizes. Pictures: contact-1 to contact-6 and mockup-proposed.jpg in this folder.

**Short answer:** yes, a little. The launch screen is already in good shape. Most of the weight is in the Menu and three screens behind it. The worst gap is elsewhere: on an iPad or iPhone a child cannot turn the sound down during a walk without ending it.

## Summary
- **The launch screen works. Keep it:** one tap to walk, pink only for Start, Change place brings her home, "Start as Calico" for a locked cat, "Get it?" before spending, the clan card, the short first walk.
- **The weight is in the Menu:** 11 doors (7 tiles, 3 grown-ups chips, Back), uneven tiles, a stats line with 4 to 6 facts.
- **Biggest gap: no sound control during a walk on touch.** Today: ⏸, End walk, Continue, Menu, Sound & controls, Mute: 6 taps and the walk is over. Desktop has M.
- **Cat friends are in three places:** Journal ("Stray cats"), Colony, Play together ("Player pets").
- **Four kinds of name** (cat name, walking name, star name, clan name); room code and friend code sit close together and look alike.
- **Words that trip up a 9-year-old:** "Twolegplace" is the first place a new child sees; on a phone the rank sits under the cat's name ("Calico · Mythical Feline") and reads like a breed; points are "whisker points" and "paw points"; the desktop hint says "Esc menu" but Esc pauses.
- **Things talk at once on a return visit:** the cat's greeting, the "next thing" line and ability pop-ups. On desktop and iPad, Play together is a full-width second button under Start. Colony's "Walk with Leafpaw" is pink.
- **Layout:** for a new child Change place is mostly locks in tiny print, two phone screens tall; iPad portrait has a big gap between the place card and Start; My den is the only Menu tile that starts the game at once.

## Taps for common jobs (touch)

| Job | Today | Notes |
|---|---|---|
| Start a walk | 1 | 2 on desktop (Ready? card) |
| Change place, then walk | 3 | Dusk adds 1 |
| Put on something she owns | 3-4 | buying adds 2 |
| Change cat (owned / locked) | 1 / 4 | |
| See the journal | 2 | |
| Play with a friend in the room | 2 + typing | first time also types a walking name |
| Sound off at home | 3 | |
| Sound off during a walk | impossible on touch without ending the walk | |
| Grown-up finds settings | 2 | |
| Change clan | 3 | |

## A lighter structure (nothing removed, only moved; pink only on Start)

```
MENU BEFORE (11 doors + stats)           MENU AFTER (7 doors + stats)
[Play together] [Colony]                  [ 👫 Play together ] [ 🐈 My clan ]
[Journal]       [Album]                   [ 📖 Journal       ] [ ⭐ Skills  ]
[Skills]        [My den]                  [ 🏠 My den — go now          ]
[Sound & controls        ]                [ 🔊 Sound & controls       › ]
(Game settings)(Cloud save)(Gift code)    ⚙️ For grown-ups ›

PAUSED
[ Keep walking ]
[ 🔊 Sound on ] [ 🎵 Music on ]   ← new
[ End walk & head home ]

PLAY TOGETHER
Play now:   [ Start a room ]  [ Join a room ]
Friends:    Your friend name  Leafpaw ✏️   (asked once)
            Your friend code  CAT-…   + Add a friend by code ›
```

My clan (was Colony) also holds the stray cat friends; Journal gets a Photos tab (was Album); one "For grown-ups" door; Sound & controls is a slim row.

| Job | Before | After |
|---|---|---|
| Sound off during a walk | impossible | 2 |
| Find a cat friend | 2, but which of 3 screens? | 2, one place |
| See photos | 2 | 3 |
| Doors in the Menu | 11 | 7 |

## Ranked changes

| # | Change | Size | Your decision? |
|---|---|---|---|
| 1 | Sound and Music switches on Paused; "Esc menu" → "Esc pause" | small | no |
| 2 | Phone home: the cat's personality under its name, not the rank | small | no |
| 3 | One voice on Home: the cat's greeting only on first and milestone visits | small | lightly |
| 4 | One name for points ("paw points") | small | yes |
| 5 | Desktop and iPad: Play together as the round 👫 beside Start | small | no |
| 6 | One "For grown-ups" door; "Play the first walk again" moves there | medium | yes |
| 7 | Cat friends in one place; Colony → "My clan" ("My cats" in the everyday words) | medium | yes |
| 8 | Play together: two big choices first; name box only until saved; "walking name" → "friend name" | medium | yes |
| 9 | Colony's pink "Walk with Leafpaw" button in the quiet style | small | no |
| 10 | Change place for a new child: one short line per locked place, open places first | medium | no |
| 11 | Album becomes a Photos tab in Journal (check "What gets used" first) | medium | yes |
| 12 | iPad portrait gets the phone's stacked home | medium | no |
| 13 | A small "the town" line under "Twolegplace" for the first few visits | small | yes |
| 14 | My den: back to Change place, or stays a tile marked "go now" | small | yes |
| 15 | Menu as a panel over home on iPad and desktop | large | yes (later) |

**Not worth changing:** Dress up's taps, the Start dock on every sheet, 🐱 home, "Get it?", the clan card.

## Where a child still sees "a person takes the cat for a walk"

Leave lines where the cat walks on its own legs ("Push the circle to walk"). Pick ONE word for a time out in the world ("explore" or "adventure"); "visit" already means opening the game. The everyday word set (src/offclanwords.js) has its own copies of some lines.

| Screen | Today | Suggested |
|---|---|---|
| Home place card | "Today's walk" / "Today's walk: X. Change place" | "Today's place" / "Going to: X" |
| Change place | "today's walk" / "tap to walk here" | "you're going here" / "tap to go here" |
| Change place, locked | "opens after 2 walks in Twolegplace · 0/2 so far" | "explore Twolegplace 2 times to open · 0/2" |
| Sheet bottom bar | "Walking in The Woods" | "Next: The Woods" |
| Home greeting | "Visit 42, and the walk is waiting!" | "Visit 42! Ready to explore?" |
| Next thing | "Your cat is ready for a walk." | "Your cat is ready to explore." |
| Next thing | "One more walk here and {place} opens!" (+2, +3 versions) | "Explore here once more and {place} opens!" |
| Locked cat | "Unlock to walk with this cat." | "Unlock to play as this cat." |
| Dress up price | "— keep walking!" | "— keep exploring!" |
| Dusk switch / Glow Collar | "Dusk walk" / "Unlocks dusk walks with fireflies" | "Explore at dusk" / "Lets you explore at dusk, with fireflies" |
| Rosa line | "…and {cat} will walk with you today." | "…and {cat} is ready to play today." |
| Paused | "Keep walking" / "End walk & head home" | "Keep exploring" / "Head home" |
| Summary | "Walk complete!", "What a walk!", "Lovely walk!" | "Home again!", "What an adventure!", "Lovely exploring!" |
| Summary | "best walk" / "NEW BEST WALK!" / "walked with" / "Your first walk! ⭐" | "your best" / "NEW BEST!" / "explored with" / "Your first adventure! ⭐" |
| Menu stats | "Best walk 88 🐾" | "Best ever 88 🐾" |
| Resume / error / border | "Your walk in X…", "…on that walk…", "This walk ends here…" | "Your adventure in X…", "…on that adventure…", "Your adventure ends here…" |
| Walk toasts | "You met {name} across walks!", "Maybe next walk.", "Try again on another walk.", "…heal in a few walks!", "…for this walk." | "You've met {name} before!", "Maybe next time.", "Try again next time.", "…will heal soon!", "…until you go home." |
| Patrol end (everyday words), chat wheel | "Good walk!" / "A longer walk next time!" | "Good patrol!" / "That was fun!" |
| Play together | "walking name", "Host a walk", "…starting a walk nearby", "Could not join that walk", "…walk together and touch noses!" | "friend name", "Start a room", "…exploring nearby", "…that room", "…explore together…" |
| Room | "{name} is on a walk. Press Start when they're back." | "{name} is exploring. Tap Explore when they're back." |
| Colony (paired) | "🐾 Walk with Leafpaw" | "🐾 Explore with Leafpaw" |
| Skills | "Complete 5 seaside walks", "…5 dusk walks", "Dusk walks brighten…" | "Explore the Seaside 5 times", "Explore at dusk 5 times", "Dusk gets brighter…" |
| Empty states | "…on your next walk!" | "…next time you explore!" |
| Sound & controls | "Play the first walk again" | "Do the first lesson again" |
| Game settings | "(applies next walk)" | "(changes next time you explore)" |

## Decisions for you
1. Sound on the Paused card?
2. Menu 11 → 7 doors (grown-ups door, friends into Colony, Album into Journal): all, some or none? ("What gets used" in Game settings on the children's devices shows what they open.)
3. Words: "My clan"? "friend name"? "paw" or "whisker" points? A "the town" line under Twolegplace? One word for a time out: "explore" or "adventure"?
4. My den: a tile, or back in Change place?
5. A panel Menu on iPad: later?
