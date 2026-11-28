# Overnight soak driver

Plays the **built** game (`dist/`) in Chrome with a seeded bot, to catch crashes the owner saw: the
"Home again! Oops..." card (`WALK_ENDED_LINE`, `src/game/recovery.js`) in the Reef, and the Moon just
before boarding the rover Dot. It needs only Node 22 and Chrome: no packages beyond the repo's own.

## What it does

`scripts/soak.mjs` serves `dist/` on a free local port, opens it in a throwaway Chrome profile and drives
it over DevTools. A script injected before the game (`scripts/soak/pagebot.js`) seeds the save (chosen
cat, every place open, guided walk done, no cards) and runs the bot:

- **Input**: a seeded PRNG. A stand-in gamepad replaces `navigator.getGamepads` (so the game's pad code
  runs: Start resumes, left stick walks, A pounces/kicks, X interacts, B meows), plus keyboard events
  (WASD/arrows, Space, E, V, C). `--couch 1` adds a second pad.
- **Goals**: the game exposes no positions, so the bot hill-climbs on the HUD's objective distance
  ("25 m"): keep the heading while it falls, turn 90-180 degrees when it rises. A visible prompt line
  makes it stop and press interact. A "hop in/out" prompt (Dot) is worked again and again. In the Reef
  the kick button is held in stretches. It pauses now and then, and every 4-8 minutes goes home and
  picks another place from Change place.
- **Hidden tab** (`--hidden-tab 1`): frames are held back and the page reports hidden for 4-24 s, then
  everything is released at once (one huge frame gap).
- **Throttle** (`--throttle K`): CDP CPU throttling by K (the matrix uses 1, 4 and 6).
- **Detection**: window `error`/`unhandledrejection`, the game's diagnostics record (read from the perf
  readout, which the soak turns on with `?perf=1`), the Home-again card (`#btn-reload` or its text), a
  page that stops answering for 20 s, a crashed renderer, and never reaching a walk in 3 minutes.
  The run stops on the first one.

On a crash it writes `soak-out/<run>/crash.json` (kind, message, entries with file:line, seed, step,
args, the replay command) and `crash.png`. A clean run leaves `run.json` and `end.png`.
`soak-out/summary.json` groups crashes by message + file:line with counts (digits in a message are
ignored for grouping).

## Setup (once per machine)

```
cd <repo>            # a checkout of the branch to test
npm ci
npm run build        # the soak plays dist/
```

Ubuntu needs Chrome (`/usr/bin/google-chrome`); on a box without a GPU the driver adds software GL
(SwiftShader) and `--no-sandbox` by itself. Node on the two spare machines lives in `~/soak/node-*/bin`:

```
export PATH="$(echo ~/soak/node-*/bin):$PATH"; node --version
```

## One run

macOS (Chrome at `/Applications/Google Chrome.app`):

```
node scripts/soak.mjs --seed 7 --place reef --cat tabby --tv 0 --throttle 1 --minutes 5 --couch 0
```

Ubuntu (Chrome at `/usr/bin/google-chrome`), same command; or name the browser:

```
node scripts/soak.mjs --seed 7 --place moon --cat hagrid --throttle 6 --minutes 5 --chrome /usr/bin/google-chrome
```

Flags: `--seed N`, `--place reef|moon|<area id>`, `--cat <tabby|siamese|persian|black|calico|mainecoon|zeetoo|robbie|d2|digit|hagrid|custom>`,
`--tv 0|1`, `--couch 0|1`, `--throttle K` (1-20), `--minutes M`, `--hidden-tab 0|1`, `--touch 0|1`
(a first touch makes the game switch to touch controls), `--headed` (show the window), `--out dir`
(default `soak-out`), `--dist dir`, `--chrome path`, `--self-test` (throws a deliberate error after a
few seconds, to prove the net works). Exit code 0 clean, 3 crash, 1 the soak itself failed.

A crash's `replay` line repeats it. The same seed repeats the bot's plan of inputs; what the game does
with them still depends on timing, so a crash may need a few tries (or the same `--throttle`).

## All night

```
node scripts/soak-night.mjs --hours 8 --minutes-per-run 4
```

Loops the matrix (reef, then moon, then every place; every preset cat plus a custom one; tv 0/1;
throttle 1/4/6; couch 0/1), **one Chrome at a time**, each run under `nice -n 15`. Every run is a fresh
`soak.mjs` process. `soak-out/queue.json` is the resumable queue: Ctrl-C and start the same command
again and it carries on after the last finished job (`--fresh` starts over). `--places reef,moon`
limits it. Only the child it started is ever stopped. Read `soak-out/summary.json` in the morning:

```
cat soak-out/summary.json
```

Ubuntu, kept running after the terminal closes:

```
cd ~/cat-game && export PATH="$(echo ~/soak/node-*/bin):$PATH"
nohup nice node scripts/soak-night.mjs --hours 10 > soak-night.log 2>&1 &
```

(From the laptop: `ssh pniessen@10.1.10.31` for the Dell, `ssh pniessen@192.168.0.165` for the Intel MacBook, then the
commands above. The driver itself never connects anywhere but `127.0.0.1`.)

## Limits

- No positions are exposed, so "head for the marker" is distance hill-climbing and can circle; the
  Moon's Dot and the Reef usually get reached because the objective points at them.
- The stand-in pad is a standard layout only; `--touch 1` fakes only the first touch.
- Hidden-tab is simulated in the page (rAF held, `document.hidden` faked, `visibilitychange`
  dispatched); it is not a real OS-level background.
- Headless Chrome on a GPU-less machine draws slowly; its frame rate is not the iPad's.
