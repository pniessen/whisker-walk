# 🐈 Whisker Walk

A cozy cat-walking game for your browser. You are the cat: prowl, pounce,
climb and swim through a little world of neighbourhoods and wild territories.
Every bird spotted, yarn ball found and purr earned pays whisker points you can
spend on new cats, outfits and places to walk.

Play it at **https://pniessen.github.io/whisker-walk/**, or run it locally:

    npm install
    npm run dev

Then open the printed localhost URL.

## On iPhone and iPad

**Whisker Walk 2** is also a home-screen app for the family's iPhones and
iPads: tap the cat icon and you're in the game, full screen, offline. It's in
`ios/`, signed with a free Apple ID, so each install lasts 7 days; a nightly
job on the Mac (`npm run ios:schedule`) renews them automatically, and
`npm run ios:refresh` does it by hand. `ios/README.md` covers setting up a
device, bringing a cat across from Safari, and the refresh.

## Two editions

The game has two editions, which share one save. You can switch between them
on the home screen.

- **Clan Edition** (the default) is a Warrior-Cats-flavoured game. You pick a
  clan and walk its territory, camp and borders.
- **Legacy Edition** is the original plain game, with no clans.

## Where you can walk

- **Town places:** the Neighbourhood (Twolegplace), the Park, the Seaside and
  the Docks, plus your den at home base.
- **The five clan territories**, each home to its own clan:

  | Territory | Clan |
  |---|---|
  | The Woods | StormClan |
  | The Moor | GaleClan |
  | The River and Marshes | BrookClan |
  | The Pines and Swamp | DuskClan |
  | The Gorge | CliffClan |

  The Pines also has a truce island.

The world map on the home screen shows them all. Border posts let you cross
from one territory into the next without going home first.

## What you do on a walk

- **Goals.** Every walk deals 3 goals; clear them all for a jackpot. You also
  earn rank titles and can try to beat your best-walk score.
- **Making friends.** Befriend the cats you meet by name, over several walks.
- **Exploring.** Find hidden spots, buried treasure, caves and dens. You can
  climb perches, rooftops and the Gorge's cliff ledges, and you can swim.
- **Collecting.** Spot critters, take photos for your album, and race through
  hoops.
- **Weather and time of day.** Walks can be sunny, rainy or at dusk, with stars,
  a moon and glowing windows.

## Clan life (Clan Edition)

- **Your clan's camp.** It has a leader, deputy, warriors, elders and kits,
  each with a name. You can patrol, mark your borders, and feed the colony.
- **Intruders.** Now and then a warrior from a neighbouring clan wanders
  across your land. Get close and you can choose **Fight!** or **Back off**.
- **Border patrols.** In another clan's territory you are the visitor. If its
  border patrol catches you inside its border, you can choose **Fight!** or
  **Run**:
  - **Win:** the patrol warrior lets you pass for the rest of that walk.
  - **Lose or run:** you're chased back over the border.
- **How fights work.** A fight is best of three, and it's about reading the
  other cat, not speed. Each round it shows an honest clue: it crouches low,
  raises a paw, or backs up. You answer with the counter:
  - **Dodge** a pounce.
  - **Pounce** on a swipe.
  - **Swipe** at a charge.
- **After a fight.** Wins can unlock new moves, and a beaten warrior wears your
  scar back to its camp. **Losing never takes anything away.** The worst that
  happens is a scratch on your cat that fades after a few walks.

## Your cats

- **The cat builder** lets you design a cat's coat, markings, eyes and shape.
- **The dressing room** has hats, capes, collars, wings, backpacks and more.
  You can try things on with your cat standing or sitting.
- **More cats** can be bought with whisker points, including a few family cats
  and Hagrid the hen.

## Controls

**Keyboard and mouse:**

| Key | Action |
|---|---|
| Click | grab the mouse |
| Arrow keys | move |
| Shift | stalk |
| Space | pounce or climb |
| E | interact or sniff |
| V | meow |
| T | yarn ball |
| C | camera |
| + / − | zoom |
| M | mute |
| Esc | menu |

The mouse orbits the camera. In a fight, the buttons on screen (or E and Q at
the challenge) do the work.

**Phones and tablets:**

- Move with the left-thumb joystick; tilt it gently to stalk.
- Drag the right side of the screen to look around.
- Tap the buttons to pounce, meow, throw yarn, use the camera and zoom.
- Tap a prompt to interact.
- ⏸ pauses.

**Settings ⚙️** (on the home screen) apply straight away and are stored only on
the device:

- volume and mute;
- invert look;
- left-handed touch controls;
- reduced motion;
- hide chat bubbles;
- graphics quality: Auto picks a level that keeps the frame rate smooth.

## Walk together 🐾🐾

Up to 4 players can share a live walk. Everyone sees the same seeded world,
with each player's cat rendered in real time. You can touch noses, meow in a
duet, rally a yarn ball, nap in a pile and patrol together.

**Starting a walk together:**

1. Name your pet on the home screen.
2. Choose **Host a walk** to get a 4-character room code, or **Join** with a
   code a friend sent you.
3. Anyone in the room can press **Start the walk together**. The walk starts
   for everyone, in the area of whoever pressed it.

Siblings who share a colony get a **Walk with …** button instead, so there's no
code to type. Fights are only ever against computer-run cats, never another
player.

**Chat.** During a co-walk, the 💬 button opens a tray of preset phrases and
emotes. There is no free text, so chat is always safe to share. Each phrase
shows as a speech bubble over the sender's cat. Solo walks have no chat.

**Setting up multiplayer.** It runs on [Supabase](https://supabase.com)
Realtime, so there's no server of our own. To enable it locally, create a free
Supabase project and put its Project URL and anon public key in a `.env.local`
file (gitignored):

    VITE_SUPABASE_URL=https://your-project.supabase.co
    VITE_SUPABASE_ANON_KEY=your-anon-public-key

Without them, "Walk together" shows a "multiplayer not configured" message, and
solo play is unaffected. The deploy workflow reads the same two variables from
the repo's GitHub Actions secrets.

## Develop

    npm test          # unit tests (Vitest), about 8,800 of them
    npm run build     # production build in dist/
    npm run preview   # serve the production build

**Built with:** Three.js 0.185, Vite 8 and Vitest 4. There is no backend apart
from the optional Supabase realtime channel.

**Deploying.** Every push to `main` runs the tests and deploys to GitHub Pages
(`.github/workflows`).

**Performance readout.** Add `?perf` to the URL to show frame time, draw calls
and triangles on screen.

**Determinism.** A walk is driven by seeded randomness, so the same seed always
builds the same world. `test/fixtures/flat-trace.json` pins a recorded walk.
If a change moves it, find out why before you re-record it.

**Design docs** live in `docs/superpowers/specs/` and build plans in
`docs/superpowers/plans/`. Good starting points:

- `2026-07-31-whisker-walk-design.md`: the original game.
- `2026-08-01-whisker-walk-v5-multiplayer.md`: walking together.
- `2026-10-31-editions-and-territories-design.md`: editions and the five
  territories.
- `2026-10-31-clan-life-design.md`: camps, intruders and fights, including
  the 2026-11-04 border patrol amendment.
- `2026-10-31-cat-builder-design.md`: the cat builder.
