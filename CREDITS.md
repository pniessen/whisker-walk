# Credits and third-party notices

Checked against the repository on 2026-11-15 (`package.json`,
`package-lock.json`, `public/`, `src/`, `ios/`, and the git history of each
asset). Where the repository does not record where something came from, it is
listed at the end with the owner's answer; nothing here is a guess.

## Licence: all rights reserved

The owner chose this on 2026-11-17; the wording is in `LICENSE`. People may
play the game, and nobody else may copy or reuse the code or art without
asking. The third-party libraries below keep their own licences.

## Libraries that ship inside the game

These are bundled into the website and the iPhone/iPad app.

| Library | Version | Licence | Link |
|---------|---------|---------|------|
| three (Three.js) | 0.185.1 | MIT | https://threejs.org/ · https://github.com/mrdoob/three.js |
| @supabase/supabase-js | 2.111.0 | MIT | https://github.com/supabase/supabase-js |

`@supabase/supabase-js` brings its own parts with it. They are in the lockfile
and can end up in the bundle:

| Library | Version | Licence |
|---------|---------|---------|
| @supabase/auth-js | 2.111.0 | MIT |
| @supabase/functions-js | 2.111.0 | MIT |
| @supabase/postgrest-js | 2.111.0 | MIT |
| @supabase/realtime-js | 2.111.0 | MIT |
| @supabase/storage-js | 2.111.0 | MIT |
| @supabase/phoenix | 0.4.5 | MIT |
| iceberg-js | 0.8.1 | MIT |
| tslib | 2.8.1 | 0BSD |

The MIT licence asks that the copyright notice and the licence text travel
with copies of the library. The full texts are in each package's `LICENSE`
file under `node_modules/` after `npm install`. The built game does not show
them anywhere yet; a credits screen or an `about` page that names Three.js and
Supabase and links to their licences would settle that.

## Tools used to build and test (not shipped)

| Tool | Version | Licence | Link |
|------|---------|---------|------|
| vite | 8.2.0 | MIT | https://vite.dev |
| vitest | 4.1.10 | MIT | https://vitest.dev |

Their own dependencies (85 packages in the lockfile in all) are MIT except:
`lightningcss` 1.33.0 and its platform builds (MPL-2.0), `detect-libc` 2.1.2
and `expect-type` 1.4.0 (Apache-2.0), `picocolors` 1.1.1 and `siginfo` 2.0.0
(ISC), `source-map-js` 1.2.1 (BSD-3-Clause). None of these is copied into the
game.

The iPhone/iPad app (`ios/`) uses Apple's own frameworks only; its Xcode
project pulls in no Swift packages.

## Services the game uses

Supabase (database and live messages), GitHub Pages (hosting) and GitHub
Actions (tests and deploys). They are services, not bundled code. See
`docs/PRIVACY.md`.

## Art, sound, fonts and models

| What | Where | Origin | Licence |
|------|-------|--------|---------|
| Every cat, animal, building, plant and prop | `src/cat/`, `src/world/`, `src/render/` and the rest of `src/` | Built in code by the game. There are no model or texture files in the repository | The project's own |
| Every sound and all music | `src/audio.js`, `src/music.js`, `src/catvoice.js` | Made by code in the browser (Web Audio). No sound files ship: `public/sounds/manifest.json` lists none | The project's own |
| Fonts | `src/style.css`, `index.html` | None shipped and none downloaded. The game names fonts already on the device (Avenir, Nunito, Trebuchet MS, Chalkboard SE, Comic Sans MS, system monospace) and uses whichever is there | Not applicable |
| Icons and small pictures in the pages | inline SVG in `index.html` and `src/style.css` | Written by hand as code for this project | The project's own |
| Place pictures: neighborhood, park, seaside, docks, woods, moor, river, pines, gorge | `public/places/*.jpg` | Pictures of the game's own worlds, taken from the game (`docs/VISUAL-PASS.md`; commits `0bd98b9`, `b9b14d2`, `4e369b3`, `edafae4`, `890d515`, `5bec2f2`, `9e263fe`) | The project's own |
| Website icon | `public/icon.svg` | Written as SVG code for this project (commits `92f1149`, `348dd3d` "B1 icon") | The project's own |
| App icon | `ios/AppIcon.svg`, `ios/WhiskerWalk/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png` | Written as SVG code for this project, the PNG made from it (commits `3501561`, `2203154`) | The project's own |
| Test recordings | `test/fixtures/` | Recorded from the game by its own tests. Not shipped | The project's own |

**Pet voices.** `docs/RECORDING-PETS.md` explains how to add recordings of
real pets to `public/sounds/`. None is in the repository today. If one is
added, list it here with who recorded it.

**Words and names.** The Clan Edition borrows the vocabulary of a published
book series (clan names in that style, "kittypet", "loner", "rogue",
"Twolegplace"). That is not a file with a licence, but it belongs on a page
about what is and is not the project's own. The planned on/off switch for
these words is the place where it is handled.

## Origins the repository did not record: the owner's answers (2026-11-17)

1. **`public/places/den.jpg`** is a picture of the game itself, like the
   other place pictures.
2. **The pictures inside `docs/family/clan-edition.html`** (five small cat
   portraits and one larger picture) are pictures of the game. The page is
   not part of the website.
3. **The icons** (`public/icon.svg`, `ios/AppIcon.svg`) were drawn for this
   project with an AI assistant and follow nobody else's design. The
   code-built art and code-made sounds were written the same way.
4. **Sounds and music** are made by the game's own code and were not adapted
   from an existing tune or recipe.
