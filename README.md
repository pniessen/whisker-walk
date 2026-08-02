# 🐈 Whisker Walk

A cozy first-person cat-walking game for your browser. Pick a cat, clip on the
leash, and wander — every bird spotted, yarn ball found, and purr earned pays
whisker points you can spend on new cats, accessories, and places to walk.

## Play

    npm install
    npm run dev

Open the printed localhost URL.

You ARE the cat: third-person camera, the world moves at your pace.

Every walk deals 3 goals — clear them all for a jackpot. Befriend the
neighborhood cats by name (greet them across multiple walks), earn rank
titles, and beat your best-walk score.

**Controls:** click to grab the mouse · arrow keys to prowl · Shift to stalk ·
mouse orbits the camera · Space to pounce or climb · E to interact / sniff ·
V to meow · T yarn ball · C camera · M mute · Esc to pause or end the walk.

**On phones & tablets:** left-thumb joystick to move (tilt gently to stalk) · drag the right side to look around · tap the buttons for pounce, meow, yarn, and camera · tap prompts to interact · ⏸ to pause.

**Settings ⚙️** (home base, below Sync): volume, mute, invert look (Y axis), left-handed touch controls (mirrors the joystick/action-button layout), and reduced motion (drops rain particles and the walk body-bob). Everything applies immediately, no reload — and it's all local, so it works fully offline/solo too.

## Walk together 🐾🐾

Up to 4 players can share a live walk — one shared seeded world, everyone's
pet rendered in real time, plus touch-noses, duet meows, yarn rallies, and
nap piles. From the home base screen: name your pet, then either **Host a
walk** (get a 4-character room code to share) or **Join** with a code a
friend sent you. The host picks the area and starts the walk for everyone;
joiners' Start button reads "Waiting for host…" until then.

Multiplayer runs on [Supabase](https://supabase.com) Realtime — no server of
ours involved. To enable it locally, create a free Supabase project and put
its Project URL and anon public key in a `.env.local` file (gitignored):

    VITE_SUPABASE_URL=https://your-project.supabase.co
    VITE_SUPABASE_ANON_KEY=your-anon-public-key

Without these two variables set, "Walk together" simply shows a
"multiplayer not configured" message and the rest of the game is unaffected
— solo play never depends on them. The deploy workflow reads the same two
variables from the repo's GitHub Actions secrets at build time.

## Develop

    npm test          # unit tests (Vitest)
    npm run build     # production build in dist/

Design spec: docs/superpowers/specs/2026-07-31-whisker-walk-design.md
Multiplayer design spec: docs/superpowers/specs/2026-08-01-whisker-walk-v5-multiplayer.md
