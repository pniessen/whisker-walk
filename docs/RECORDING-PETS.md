# Recording the real cats (and Hagrid)

Whisker Walk normally makes up its cat sounds with a little synthesizer —
that's the "meow" you hear by default. This page is about swapping that
synth voice out for a real one: a phone recording of Zeetoo, Rosa, Robbie,
or Hagrid, played back whenever their character makes a sound in-game.

You don't need any audio editing skill for this. Five minutes, a phone, and
a quiet room is plenty.

## 1. Record a short clip

- Use your phone's voice memo app (or any camera app that also saves audio).
- Aim for **1–2 seconds** — a single meow, chirp, or (for Hagrid) cluck.
  Longer is fine, it'll just get cut short by the animation that plays it.
- Find a **quiet room** — the game plays this clip completely dry (no fridge
  hum, no TV, no wind), so background noise carries right through.
- Get a couple of takes if you can, and pick the clearest one.

## 2. Get the file into the right shape

- Export or share the recording as an audio file. Voice memo apps on iPhone
  save as `.m4a` by default — that's fine, no conversion needed.
- Supported formats: **`.mp3`**, **`.m4a`**, **`.ogg`**.
- Rename the file to match exactly one of these (lowercase, no spaces):
  - `zeetoo.m4a` (or `.mp3` / `.ogg`)
  - `rosa.m4a`
  - `robbie.m4a`
  - `hagrid.m4a`

  Only lowercase letters, digits, and hyphens are allowed in the name
  itself (before the extension) — `zeetoo.m4a` is good, `Zeetoo Meow.m4a`
  is not.

## 3. Drop it into the project

Copy the file into `public/sounds/` in this repo, alongside this doc:

```
public/sounds/zeetoo.m4a
```

## 4. List it in the manifest

Open `public/sounds/manifest.json` and add the filename to the `files`
list. The file starts out empty:

```json
{
  "files": []
}
```

After adding Zeetoo's recording, it looks like:

```json
{
  "files": ["zeetoo.m4a"]
}
```

Add as many as you have — you don't need all four at once:

```json
{
  "files": ["zeetoo.m4a", "rosa.m4a", "robbie.m4a", "hagrid.m4a"]
}
```

Only files listed here are ever loaded. A file sitting in `public/sounds/`
but missing from this list is simply ignored — the game keeps using the
synth voice for that cat.

## 5. Commit and push

```
git add public/sounds/zeetoo.m4a public/sounds/manifest.json
git commit -m "sound: add Zeetoo's real voice"
git push
```

The next deploy picks it up automatically — nothing else to configure.
Files under `public/` are served exactly as-is, so `public/sounds/zeetoo.m4a`
ends up live at `/whisker-walk/sounds/zeetoo.m4a`.

## What happens if something's missing

The game always has the synth voice as a fallback, so there's no way to
break sound by getting this wrong:

- Typo the filename in the manifest, or forget to add the file? The game
  just can't find it and quietly falls back to the synth meow — no error,
  no broken audio.
- A player has the app installed offline (PWA) from before you added a new
  recording, and hasn't reconnected yet? Same thing — they hear the synth
  voice until their copy re-syncs with the new file.
- Recorded Hagrid too? He'll cluck for real instead of the synth cluck,
  same as any other cat.
