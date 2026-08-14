# Whisker Walk v11–v17 Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship waves v11 (Cat Couture, finish) through v17 (Cozy Den) as one continuous, autonomously-executable program: outfits → juice & polish → alive world → cat athletics → collector's journal → together (sibling multiplayer) → cozy den + music.

**Architecture:** Each phase is a self-contained wave on its own branch, merged to `main` (auto-deploys to GitHub Pages) after a phase-final review and browser verification. Pure logic is TDD'd in Vitest; rendering/audio-node-graph work is verified in the browser per this repo's convention. Save-file growth is **additive** (extend `defaultState` + `sanitizeState`, no version bump) except where a shape changes. No backend/SQL changes anywhere in this plan.

**Tech Stack:** Vite + Three.js + Vitest, vanilla ES modules, WebAudio (no audio assets until Phase 6, and those degrade to synth), Supabase Realtime (existing transport only — no new broadcast kinds).

## Global Constraints

Every task implicitly includes these. Copied from `docs/SESSION-HANDOFF.md` and the live code:

- **Seeded determinism:** never call bare `Math.random()` inside seeded walk generation; thread the injected `walkRng`. Never draw from the shared `walkRng` stream after `startWalk` finishes building the session (a per-frame consumer would desync co-walk clients) — cosmetic per-frame randomness gets its **own** `mulberry32` stream or `Math.random`.
- **Escape at the render site:** every server- or network-derived string goes through `escapeHtml` (main.js:131) or `textContent` before touching `innerHTML`, on top of sanitize-on-load. Never log or render secrets.
- **Ghosts are solo-only:** any new solo-only feature must gate on `roomSeed === undefined` exactly like `spawnGhosts` (main.js:1306).
- **Save discipline:** additive fields → extend `defaultState()` + `sanitizeState()` + tests proving a field-less v4 save loads with defaults; shape changes → `SAVE_VERSION` bump + migration + no-data-loss tests. `sanitizeState` validates every new field individually (type-check, clamp, default) — hostile cloud payloads reach it directly.
- **Settings are the single source of truth:** new settings go in `settings.js` `DEFAULTS` + `sanitize()`, are pushed via `applySettings()` (main.js:243) or read at point-of-use like `reducedMotion`, and get a homebase Settings-tab control.
- **Multiplayer wire:** new gameplay events ride the existing `sendEvent` (`event` broadcast kind) — do NOT add a new broadcast kind (a new kind requires touching `createSupabaseTransport.join`'s subscribe list; the v8 chat bug). New event types must be tolerated by old clients (unknown `ev.type` falls through `applyRemoteEvent` harmlessly — keep it that way).
- **The Supabase SQL contract is frozen.** No new tables, columns, or RPCs.
- **Tests:** `npx vitest run` green (baseline 225 after v11 Task 1; each task may only raise the count), `npx vite build` exit 0, before every commit. Vitest covers pure logic only; rendering/audio graphs are browser-verified.
- **Perf:** mobile is the floor — no per-frame allocations inside the render loop (reuse Vector3s/arrays), new geometry stays low-poly (< ~200 tris per prop), particle counts respect `reducedMotion` and the coarse-pointer tier.
- **`reducedMotion`** skips new particles/screen-motion effects (follow weather.js:50's pattern: mood stays, motion goes).
- **Commits:** one per task minimum, message style `feat:`/`fix:`/`test:`/`docs:`, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Ledger:** append task status to `.superpowers/sdd/2026-08-13-whisker-walk-v11-v17-master/progress.md` after every task (create the dir on first use).

## Execution Protocol (autonomous)

1. **One branch per phase** (`feature/cat-couture` already exists for Phase 1; then `feature/v12-juice`, `feature/v13-alive-world`, `feature/v14-athletics`, `feature/v15-journal`, `feature/v16-together`, `feature/v17-den`), branched from fresh `main`.
2. Per task: fresh implementer subagent → per-task review → fix → commit. Per phase: whole-branch final review (most capable model) → one fix wave → browser verification → merge to `main` → push → confirm the Pages deploy workflow goes green → live-site smoke (load https://pniessen.github.io/whisker-walk/, start a walk).
3. **Browser verification workaround:** automated browsers cannot acquire pointer lock, so the desktop "Start exploring (click)" overlay never dismisses under automation. Verify gameplay via **mobile emulation**: `resize_window` to the mobile preset, reload, tap "Tap to explore" (dispatch pointerdown/pointerup/click on the button via JS), then drive with the joystick/`key` presses and screenshot. Desktop-only paths (pointer-lock chat keys) are verified by code review + the existing unit tests.
4. **Stop-and-ask points** (the only ones): a task requires changing the frozen SQL contract; a browser verification reveals the art direction reads wrong and the fix isn't an exposure/intensity nudge; the `* 2.js` duplicate check in Task 2.0 finds real divergent content.
5. Phases run strictly in order — later phases consume earlier phases' interfaces.

---

# Phase 1 — v11 "Cat Couture" (finish the in-flight wave)

Status on `feature/cat-couture`: Task 1 **done** (`e4def5a`+`078f08b`, 225 tests), Task 2 **committed** (`4710ece`) but not yet reviewed/ledgered, Tasks 3–4 **open**. The full task text lives in `docs/superpowers/plans/2026-08-14-whisker-walk-v11-cat-couture.md` — implementers read it there; this phase's tasks are pointers plus the extra verification the ledger gap demands.

### Task 1.1: Review + ledger v11 Task 2 (already committed)

**Files:** read `src/cat/model.js` (commit `4710ece`); append to `.superpowers/sdd/2026-08-14-whisker-walk-v11-cat-couture/progress.md`.

- [ ] Run a reviewer pass of commit `4710ece` against v11 plan **Task 2** (steps 1–4): per-slot geometry for all 16 items, breed-`scale` multiplication, head/face items on the head group, the hoodie hood up/down rule, Hagrid's explicit per-item skip, and that the Task-1 CONCERN (stale `equipped.outfit` reads in main.js/model.js) is actually resolved — `grep -rn "outfit" src/` must return nothing but comments.
- [ ] `npx vitest run` (≥225) + `npx vite build` green.
- [ ] Fix anything found, commit `fix: v11 task 2 review findings`; record Task 2 status in the v11 ledger.

### Task 1.2: Execute v11 Task 3 (slot-grouped Accessories UI + thumbnails)

Follow `docs/superpowers/plans/2026-08-14-whisker-walk-v11-cat-couture.md` **Task 3** verbatim (grouped headings Collar · Head · Face · Neck · Body · Back · Feet in `src/ui/homebase.js`, `card()` helper unchanged, thumbnails for all new items via `src/thumbnails.js`). Commit per its steps.

### Task 1.3: Execute v11 Task 4 (review, verify, release)

Follow the v11 plan **Task 4** verbatim: full regression, whole-branch final review with its listed focus areas, one fix wave, browser verification screenshots (fully-dressed cat, hood flip, Hagrid in a bowtie, grouped UI — via the mobile-emulation workaround), merge `feature/cat-couture` → `main`, push, confirm Pages deploy green.

---

# Phase 2 — v12 "Juice & Polish"

Branch: `feature/v12-juice` from `main` after Phase 1 merges.

### Task 2.0: Housekeeping — remove the `* 2.js` Finder duplicates

**Files:** delete `src/blocklist 2.js`, `src/cloud 2.js`, `src/ghosts 2.js`, `src/settings 2.js`, `test/blocklist.test 2.js`, `test/cloud.test 2.js`, `test/ghosts.test 2.js`, `test/settings.test 2.js`.

- [ ] **Step 1: Safety diff.** For each pair run `diff "src/cloud 2.js" src/cloud.js` (etc.). If every file is identical to (or a strict subset / older version of) its real counterpart, proceed. If ANY holds content the real file lacks, **stop and surface the diff to the user** — do not delete.
- [ ] **Step 2:** `git rm` the eight files. Run `npx vitest run` — count must be unchanged (vitest was already ignoring them is FALSE — it runs 30 files including dups' tests; after deletion expect fewer test *files* but the same passing behavior; record the new baseline count in the ledger).
- [ ] **Step 3:** `npx vite build` green. Commit `chore: remove Finder-duplicate ' 2.js' files`.

### Task 2.1: Audio master bus (gain → compressor → reverb glue)

**Files:** modify `src/audio.js`; create `test/audio.test.js`.

**Interfaces:**
- Consumes: nothing new.
- Produces: `createAudio({ contextFactory } = {})` — optional injectable factory returning an AudioContext-shaped object (default: `() => new (window.AudioContext || window.webkitAudioContext)()`). Every sound now routes through an internal master chain; `setVolume(v)` sets the master gain live (fixing the documented wart at audio.js:96 where a playing ambient ignored volume changes). All existing method names (`meow`, `purr`, `cluck`, `bell`, `chime`, `bark`, `shutter`, `startAmbient`, `stopAmbient`, `setMuted`, `setVolume`) keep their signatures.

- [ ] **Step 1: Write failing tests** with a minimal fake AudioContext:

```js
// test/audio.test.js
import { describe, it, expect } from 'vitest';
import { createAudio } from '../src/audio.js';

function fakeParam(v = 1) {
  return { value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
}
function fakeNode(extra = {}) {
  const n = { connections: [], connect(t) { n.connections.push(t); return t; }, start() {}, stop() {}, ...extra };
  return n;
}
function fakeCtx() {
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    destination: fakeNode({ isDestination: true }),
    created: { gains: [], oscs: [], compressors: [], convolvers: [] },
    createGain() { const n = fakeNode({ gain: fakeParam(1) }); ctx.created.gains.push(n); return n; },
    createOscillator() { const n = fakeNode({ frequency: fakeParam(440), type: 'sine' }); ctx.created.oscs.push(n); return n; },
    createDynamicsCompressor() { const n = fakeNode({ threshold: fakeParam(), knee: fakeParam(), ratio: fakeParam(), attack: fakeParam(), release: fakeParam() }); ctx.created.compressors.push(n); return n; },
    createConvolver() { const n = fakeNode({ buffer: null }); ctx.created.convolvers.push(n); return n; },
    createBiquadFilter() { return fakeNode({ type: 'lowpass', frequency: fakeParam(), Q: fakeParam() }); },
    createBuffer(ch, len, rate) { return { getChannelData: () => new Float32Array(len), length: len, sampleRate: rate }; },
    createBufferSource() { return fakeNode({ buffer: null, loop: false, playbackRate: fakeParam(1) }); },
  };
  return ctx;
}

describe('audio master bus', () => {
  it('builds master → compressor → destination once, with a convolver reverb send', () => {
    const ctx = fakeCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    audio.chime();
    audio.chime();
    expect(ctx.created.compressors).toHaveLength(1);
    expect(ctx.created.convolvers).toHaveLength(1);
    const comp = ctx.created.compressors[0];
    expect(comp.connections).toContain(ctx.destination);
  });
  it('no sound node connects straight to destination', () => {
    const ctx = fakeCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    audio.meow();
    for (const osc of ctx.created.oscs) {
      expect(osc.connections).not.toContain(ctx.destination);
    }
  });
  it('setVolume drives the master gain live', () => {
    const ctx = fakeCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    audio.chime(); // forces bus creation
    audio.setVolume(0.3);
    const master = ctx.created.gains[0]; // first gain created is the master
    expect(master.gain.value).toBeCloseTo(0.3);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run test/audio.test.js` — FAIL (contextFactory unsupported, nodes go to destination).
- [ ] **Step 3: Implement.** In `createAudio({ contextFactory } = {})`: `ensure()` creates ctx via factory then, once, builds the bus — `master = ctx.createGain()` (created FIRST so tests can find it; `master.gain.value = volume`), `comp = ctx.createDynamicsCompressor()` (threshold −18, knee 20, ratio 4, attack 0.005, release 0.2), `reverb = ctx.createConvolver()` with a generated impulse (stereo-mono 1.2s buffer of `(Math.random()*2−1) * Math.pow(1−i/len, 2.5)`), `wet = ctx.createGain()` (0.16). Wiring: `master → comp → destination`, `master → wet → reverb → comp`. `tone()` and both ambient paths connect their final gain to `master` instead of `ac.destination`, and **stop multiplying `volume` into per-sound gains** — `setVolume(v)` now just sets `master.gain.value = v`. Keep the per-call `volume` parameter of `meow`/`cluck` (that's distance attenuation, still applied per-sound).
- [ ] **Step 4:** `npx vitest run` — all green (audio tests + full suite).
- [ ] **Step 5: Browser check** — start a walk (mobile emulation), confirm sounds still play, no console errors, M mutes.
- [ ] **Step 6:** Commit `feat: audio master bus with compressor and generated-impulse reverb`.

### Task 2.2: Formant cat voices — meow/purr/trill + per-breed voice params

**Files:** create `src/catvoice.js`, `test/catvoice.test.js`; modify `src/audio.js`, `src/main.js`.

**Interfaces:**
- Consumes: `PERSONALITIES` breed ids (10: tabby, siamese, persian, black, calico, mainecoon, zeetoo, rosa, robbie, hagrid).
- Produces: `voiceFor(breed)` → `{ pitch, rate, gain }` (all finite positive numbers; unknown breed → tabby's `{pitch:1, rate:1, gain:1}`). `audio.meow(volume = 1, pitch = 1, voice = {})` (voice = `{pitch, rate, gain}` multipliers layered on top of the explicit args, so existing call sites — distance volume, duet `pitch 1.26` — are untouched). New `audio.trill(volume = 1, pitch = 1)`. `audio.purr(duration = 1.2)` (was argless; argless call keeps working via the default).

- [ ] **Step 1: Failing tests** for the pure module:

```js
// test/catvoice.test.js
import { describe, it, expect } from 'vitest';
import { voiceFor, VOICES } from '../src/catvoice.js';

describe('voiceFor', () => {
  it('covers all ten breeds with finite positive params', () => {
    for (const b of ['tabby','siamese','persian','black','calico','mainecoon','zeetoo','rosa','robbie','hagrid']) {
      const v = voiceFor(b);
      for (const k of ['pitch','rate','gain']) {
        expect(Number.isFinite(v[k]) && v[k] > 0, `${b}.${k}`).toBe(true);
      }
    }
  });
  it('falls back to tabby for unknown breeds', () => {
    expect(voiceFor('unicorn')).toEqual(VOICES.tabby);
  });
  it('matches personality: siamese is higher+faster, persian lower+slower than tabby', () => {
    expect(voiceFor('siamese').pitch).toBeGreaterThan(voiceFor('tabby').pitch);
    expect(voiceFor('siamese').rate).toBeGreaterThan(voiceFor('tabby').rate);
    expect(voiceFor('persian').pitch).toBeLessThan(voiceFor('tabby').pitch);
    expect(voiceFor('persian').rate).toBeLessThan(voiceFor('tabby').rate);
  });
});
```

- [ ] **Step 2:** Run — FAIL (module missing).
- [ ] **Step 3: Implement `src/catvoice.js`:**

```js
// Per-breed voice parameters for the synthesized cat voice (audio.js meow/
// trill). pitch scales every frequency, rate divides durations (faster > 1),
// gain scales loudness. Values are tuned to the PERSONALITIES flavor text.
export const VOICES = {
  tabby:     { pitch: 1.0,  rate: 1.0,  gain: 1.0 },
  siamese:   { pitch: 1.18, rate: 1.35, gain: 1.25 }, // hyper: loud, fast, high
  persian:   { pitch: 0.8,  rate: 0.7,  gain: 0.8 },  // lazy: low, slow, soft
  black:     { pitch: 0.92, rate: 1.0,  gain: 1.0 },
  calico:    { pitch: 1.1,  rate: 1.15, gain: 1.0 },
  mainecoon: { pitch: 0.72, rate: 0.85, gain: 1.1 },  // big cat, big voice
  zeetoo:    { pitch: 1.05, rate: 1.2,  gain: 1.0 },
  rosa:      { pitch: 1.22, rate: 0.9,  gain: 0.9 },
  robbie:    { pitch: 0.85, rate: 1.05, gain: 1.05 },
  hagrid:    { pitch: 1.0,  rate: 1.0,  gain: 1.0 },  // clucks — pitch/rate still honored
};
export function voiceFor(breed) {
  return VOICES[breed] ?? VOICES.tabby;
}
```

- [ ] **Step 4: Rework `audio.meow`** (this is the bleep fix). Replace the two square-wave tones with a formant voice, built on the Task 2.1 bus. Inside `createAudio`, add a private helper and re-implement:

```js
// A "vocal" note: sawtooth source → swept bandpass (the vowel) → gain
// envelope, with a gentle vibrato LFO on the source pitch. This is what
// makes it read as an animal instead of a slide whistle.
function vocal({ f0, f1, f2, filt0, filt1, dur, gain, delay = 0, vibrato = 6.5 }) {
  if (muted) return;
  const ac = ensure();
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.linearRampToValueAtTime(f1, t0 + dur * 0.35); // rise: "mee"
  osc.frequency.linearRampToValueAtTime(f2, t0 + dur);        // fall: "ow"
  const vib = ac.createOscillator();
  const vibGain = ac.createGain();
  vib.frequency.value = vibrato;
  vibGain.gain.value = f0 * 0.035;
  vib.connect(vibGain).connect(osc.frequency);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 4;
  bp.frequency.setValueAtTime(filt0, t0);
  bp.frequency.linearRampToValueAtTime(filt1, t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(bp).connect(g).connect(master);
  osc.start(t0); vib.start(t0);
  osc.stop(t0 + dur + 0.05); vib.stop(t0 + dur + 0.05);
}
```

```js
meow(volume = 1, pitch = 1, voice = {}) {
  const p = pitch * (voice.pitch ?? 1);
  const dur = 0.5 / (voice.rate ?? 1);
  const amp = 0.16 * volume * (voice.gain ?? 1);
  vocal({ f0: 300 * p, f1: 520 * p, f2: 240 * p, filt0: 1150 * p, filt1: 620 * p, dur, gain: amp });
},
trill(volume = 1, pitch = 1) {
  // "brrrup?" — short rising note with a fast pitch wobble
  vocal({ f0: 340 * pitch, f1: 560 * pitch, f2: 620 * pitch, filt0: 900 * pitch, filt1: 1400 * pitch, dur: 0.28, gain: 0.1 * volume, vibrato: 26 });
},
purr(duration = 1.2) {
  if (muted) return;
  const ac = ensure();
  const t0 = ac.currentTime;
  // low rumble: filtered noise + a low sine, both amplitude-wobbled at ~25Hz
  const size = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, size, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 220;
  const rumble = ac.createOscillator();
  rumble.type = 'sine'; rumble.frequency.value = 52;
  const g = ac.createGain();
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(0.11, t0 + 0.15);
  g.gain.setValueAtTime(0.11, t0 + duration - 0.25);
  g.gain.linearRampToValueAtTime(0.0001, t0 + duration);
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.frequency.value = 25;
  lfoGain.gain.value = 0.05;
  lfo.connect(lfoGain).connect(g.gain);
  src.connect(lp).connect(g).connect(master);
  rumble.connect(g);
  src.start(t0); rumble.start(t0); lfo.start(t0);
  src.stop(t0 + duration); rumble.stop(t0 + duration); lfo.stop(t0 + duration);
},
```

- [ ] **Step 5: Wire main.js.** `catVoice` (main.js:267) becomes breed-aware: `const v = voiceFor(session.cat.userData.breed); breed === 'hagrid' ? audio.cluck(1, pitch * v.pitch) : audio.meow(1, pitch, v);` (import `voiceFor` from `./catvoice.js`). Head-scratch purr (main.js:1741) becomes `audio.purr(2.5)`. Stray-notices-you trill: in `awardStrayGreet`, replace the bare `catVoice()` with `audio.trill()` for the STRAY's reply feel is wrong — keep `catVoice()` there; instead add the trill where a stray first comes within 2.5 (the `stray` prompt appearing in `updateInteractions`): when `s.prompt` transitions to kind `'stray'` from something else, `audio.trill(0.6)`. Track via `s.lastPromptKind`.
- [ ] **Step 6:** `npx vitest run` + `npx vite build` green.
- [ ] **Step 7: Browser check:** meow (🐱 button) sounds cat-like, purr on head scratches sustains ~2.5s, trill fires when approaching a stray. No console errors.
- [ ] **Step 8:** Commit `feat: formant-synthesized meow/purr/trill with per-breed voices`.

### Task 2.3: Palette calibration (the deferred Phase-0 by-eye pass)

**Files:** modify `src/main.js` (one line), `src/render/quality.js`, `test/quality.test.js`.

- [ ] **Step 1:** `renderer.toneMappingExposure = 1.0` (main.js:181) → `1.1`.
- [ ] **Step 2:** In `resolveQuality` raise `envIntensity`: high `0.35 → 0.45`, low `0.25 → 0.32`. Update the corresponding assertions in `test/quality.test.js` to the new values.
- [ ] **Step 3:** `npx vitest run` green.
- [ ] **Step 4: By-eye verification (mobile emulation):** screenshot a daytime clear walk, a sunset walk, a rain walk, and a dusk walk (equip glow collar; sunset/rain may need several walk restarts to roll — `rollWeather`: clear <0.5, rain <0.8, else sunset). Daylight should read warm and saturated, not gray. If still flat, adjust ONLY `toneMappingExposure` within [1.0, 1.2] and `envIntensity` high within [0.35, 0.55]; anything beyond that range → stop and surface screenshots to the user.
- [ ] **Step 5:** Commit `feat: calibrate tone-mapping exposure and IBL intensity`.

### Task 2.4: FX system — score popups + particle bursts

**Files:** create `src/fx.js`, `test/fx.test.js`; modify `src/main.js`.

**Interfaces:**
- Consumes: THREE, a `scene` with add/remove.
- Produces: `createFx(scene, { reducedMotion = false, makeText } = {})` → `{ popup(position, text), burst(position, color, count = 10), update(dt), active() /* count, for tests */, dispose() }`. `makeText(text)` returns a THREE.Object3D for the popup (default builds a Sprite from a canvas — injectable so tests avoid canvas 2D in jsdom). Positions are `THREE.Vector3`s (cloned internally; callers may pass `cat.position` directly).

- [ ] **Step 1: Failing tests:**

```js
// test/fx.test.js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createFx } from '../src/fx.js';

const fakeScene = () => ({ children: [], add(o) { this.children.push(o); }, remove(o) { this.children = this.children.filter((c) => c !== o); } });
const fakeText = () => new THREE.Object3D();

describe('createFx', () => {
  it('popup lives ~1.1s, rises, then is removed from the scene', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: fakeText });
    fx.popup(new THREE.Vector3(1, 0, 2), '+5');
    expect(fx.active()).toBe(1);
    const before = scene.children[0].position.y;
    fx.update(0.5);
    expect(scene.children[0].position.y).toBeGreaterThan(before);
    fx.update(1.0);
    expect(fx.active()).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
  it('burst spawns count particles that die within a second', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: fakeText });
    fx.burst(new THREE.Vector3(0, 0, 0), 0xffffff, 8);
    expect(fx.active()).toBe(1); // one Points object
    fx.update(1.0);
    expect(fx.active()).toBe(0);
  });
  it('reducedMotion drops bursts but keeps popups', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { reducedMotion: true, makeText: fakeText });
    fx.burst(new THREE.Vector3(), 0xffffff);
    expect(fx.active()).toBe(0);
    fx.popup(new THREE.Vector3(), '+5');
    expect(fx.active()).toBe(1);
  });
});
```

- [ ] **Step 2:** Run — FAIL. **Step 3: Implement `src/fx.js`:** internal list of effects `{ obj, life, ttl, kind, velocities? }`. Popup: `makeText(text)` object at `position.clone().add(0, 0.9, 0)`, `ttl 1.1`, rises `1.2 * dt`, material opacity fades in last 40% when the object has one. Default `makeText`: 256×64 canvas, bold 40px sans-serif, `#fff` text with `#00000088` stroke → `THREE.CanvasTexture` (set `colorSpace = THREE.SRGBColorSpace`) → `SpriteMaterial { transparent: true, depthTest: false }` → Sprite scaled `(1.4, 0.35, 1)`. Burst: one `THREE.Points` of `count` positions at origin point with random unit velocities (upward-biased: `y = Math.abs(y) + 0.5`), `PointsMaterial { color, size: 0.09, transparent: true }`, ttl 0.7, positions advance by velocity with `vy −= 3*dt` gravity, opacity fades. `update(dt)` advances and removes dead (dispose geometry/material on removal). `dispose()` removes all.
- [ ] **Step 4:** Tests green.
- [ ] **Step 5: Wire main.js.** In `startWalk`: `session.fx = createFx(scene, { reducedMotion: settings.get('reducedMotion') });`. In the module-level `bus.on('discovery', …)` handler (main.js:755) add: `if (session?.fx && points > 0) session.fx.popup(session.cat.position, `+${points} 🐾`);` (destructure `points` from the event — discoveries.js already emits it). Sparkle bursts: in `handleInteract`, after a successful collect → `s.fx.burst(s.cat.position, 0xf2c14e, 12)`; after dig treasure → same in gold; goal complete (in `noteGoal` when `res.completed`) → `session.fx.burst(session.cat.position, 0x8ae08a, 14)`. Dust poof: in `updateAvatar`, detect pounce landing — when `s.pounceTime` goes from `> 0` to `<= 0` this frame → `s.fx.burst(cat.position, 0xcbb8a0, 8)`; also on perch hop-down (`doPounceOrClimb`'s hop-down branch). Render loop: `session.fx.update(dt)` next to the other updates; `endWalk`: `session.fx.dispose()` before scene traversal.
- [ ] **Step 6:** Full suite + build green. **Step 7: Browser check:** collect a yarn ball → sparkle + floating "+10 🐾". **Step 8:** Commit `feat: score popups and particle bursts (fx system)`.

### Task 2.5: Event sounds — collect arpeggio + jackpot fanfare

**Files:** modify `src/audio.js`, `src/main.js`.

- [ ] **Step 1:** Add to audio api (both built from `tone()`, which now routes through the bus):

```js
collectArp() {
  tone(660, 0.09, { type: 'triangle', gain: 0.07 });
  tone(880, 0.09, { type: 'triangle', gain: 0.07, delay: 0.07 });
  tone(1320, 0.16, { type: 'triangle', gain: 0.08, delay: 0.14 });
},
fanfare() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => tone(f, i === 3 ? 0.35 : 0.12, { type: 'triangle', gain: 0.09, delay: i * 0.11 }));
},
```

- [ ] **Step 2:** In the `bus.on('discovery')` handler (main.js:755), replace the flat `audio.chime()` with a type map: `jackpot → audio.fanfare()`, `collectible`/`treasure` → `audio.collectArp()`, `goal` → `audio.chime()` twice (`delay` via second call `tone` already supports; simply call `audio.chime()` — keep it), everything else → `audio.chime()`.
- [ ] **Step 3:** Suite + build green; browser check a collect and (if rolled) a goal. Commit `feat: collect arpeggio and jackpot fanfare`.

### Task 2.6: Phase 2 review, verify, release

- [ ] Full regression + build. Whole-branch final review focused on: no per-sound `volume` double-application after the bus refactor (distance-scaled remote meows still quieter); fx never leaks geometry (dispose on removal AND endWalk); no per-frame allocation in `fx.update`; `reducedMotion` respected; exposure/env values match tests.
- [ ] One fix wave if findings. Browser verification (mobile emulation): full walk with sounds, popups, bursts; screenshot daytime + sunset.
- [ ] Merge → `main`, push, Pages deploy green, live-site smoke.

---

# Phase 3 — v13 "Alive World"

Branch: `feature/v13-alive-world`.

### Task 3.1: World density — sidewalks, yards, scatter

**Files:** modify `src/world/builder.js`, `src/world/neighborhood.js`, `src/world/park.js`, `src/world/seaside.js`.

- [ ] **Step 1: New builder helpers** (same idioms as builder.js — `mat()`, `box()`, groups):

```js
export function sidewalk(x1, z1, x2, z2, w = 1.2) {
  // a lighter strip beside a street — reuses path() geometry with pavement color
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat(0xd8d0c0));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
  m.position.set((x1 + x2) / 2, 0.008, (z1 + z2) / 2);
  return m;
}
export function leafLitter(x, z, seed = 1) {
  const g = new THREE.Group();
  const colors = [0xc8823a, 0xb05a2a, 0xd8a04e];
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.09, 5), mat(colors[(seed + i) % 3]));
    leaf.rotation.x = -Math.PI / 2;
    leaf.position.set(x + Math.sin(seed * 3 + i * 2.1) * 0.8, 0.015, z + Math.cos(seed * 2 + i * 1.7) * 0.8);
    g.add(leaf);
  }
  return g;
}
export function bike(x, z, rotY = 0) {
  const g = new THREE.Group();
  for (const wz of [-0.45, 0.45]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 6, 12), mat(0x3a3a42));
    wheel.position.set(0, 0.28, wz);
    g.add(wheel);
  }
  const frame = box(0.06, 0.06, 0.9, 0xd06048);
  frame.position.y = 0.45; frame.rotation.x = 0.2;
  g.add(frame);
  const bars = box(0.4, 0.06, 0.06, 0x3a3a42);
  bars.position.set(0, 0.62, -0.45);
  g.add(bars);
  g.position.set(x, 0, z); g.rotation.y = rotY;
  return g;
}
```

- [ ] **Step 2: Neighborhood pass** (hand-authored, matching the existing style — fixed arrays, colliders for solids): sidewalks flanking both streets (`sidewalk(±3.2, -50, ±3.2, 50)` and the east-west pair); a low front fence (`fenceRun`) along two lots; +6 bushes, +4 trees (with colliders r 0.6), +4 `flowerPatch`, 5 `leafLitter` clusters under trees, one `bike(−14, 8, 0.9)` (collider r 0.5), 2 more `rock`s. Keep the street itself clear (movement space).
- [ ] **Step 3: Park + seaside pass** (smaller): park +4 trees +4 bushes +3 leafLitter + 2 flowerPatch; seaside +3 rocks + 2 bushes + driftwood (a rotated thin `box(1.6, 0.15, 0.25, 0x9a8468)` at the sand line).
- [ ] **Step 4:** `npx vitest run` + build green (worlds have no unit tests — they're data). **Browser check:** walk the neighborhood; the street reads *lived-in*; frame-rate unchanged on the coarse tier (resize to mobile, watch for jank while moving).
- [ ] **Step 5:** Commit `feat: world density pass — sidewalks, fences, scatter props`.

### Task 3.2: Sky life — drifting clouds + bird flyovers

**Files:** create `src/skylife.js`, `test/skylife.test.js`; modify `src/main.js`.

**Interfaces:**
- Produces: `createSkyLife(scene, { rng, reducedMotion = false })` → `{ update(dt), dispose() }`. `rng` is a dedicated stream (NOT the shared `walkRng` — see Global Constraints); main.js passes `mulberry32((roomSeed ?? Math.floor(Math.random() * 2 ** 31)) ^ 0x5eaf00d)`. Pure helper exported for tests: `advanceClouds(clouds, dt, halfSpan)` where `clouds` is `[{ x, z, speed }]` — moves `x += speed * dt`, wraps to `−halfSpan` past `+halfSpan`.

- [ ] **Step 1: Failing test:**

```js
// test/skylife.test.js
import { describe, it, expect } from 'vitest';
import { advanceClouds } from '../src/skylife.js';

describe('advanceClouds', () => {
  it('drifts +x and wraps around the span', () => {
    const clouds = [{ x: 0, z: 5, speed: 2 }, { x: 59, z: -10, speed: 2 }];
    advanceClouds(clouds, 1, 60);   // rule: x += speed*dt; if (x > halfSpan) x -= halfSpan*2
    expect(clouds[0].x).toBeCloseTo(2);
    expect(clouds[1].x).toBeCloseTo(-59); // 59 → 61 → wrapped to −59
  });
});
```

- [ ] **Step 2:** FAIL, then implement: 6 cloud groups (2–3 flattened white `IcosahedronGeometry(2.2, 0)` meshes, `litMaterial(0xffffff)`, `scale.y = 0.45`) at `y = 22 + rng()*6`, positions seeded by `rng`, speeds `0.4 + rng()*0.5`. Bird flyover: every 40–80s (`rng`), 3 small dark cones fly a straight line across the sky at y 14, despawn past bounds; skip when `reducedMotion`. `update(dt)` mutates only positions.
- [ ] **Step 3:** main.js `startWalk`: `session.skyLife = createSkyLife(scene, { rng: mulberry32(((roomSeed ?? (Math.random() * 2 ** 31)) >>> 0) ^ 0x5eaf00d), reducedMotion: settings.get('reducedMotion') });` — note the seed derivation keeps co-walk clients' clouds identical without touching `walkRng`. Update in the render loop; `dispose` in `endWalk`.
- [ ] **Step 4:** Suite + build green, browser check (clouds visibly drift). Commit `feat: drifting clouds and bird flyovers`.

### Task 3.3: Dusk warm windows

**Files:** modify `src/world/builder.js` (tag windows), `src/main.js` (dusk swap).

- [ ] **Step 1:** In `builder.house()`, tag each window mesh: `win.userData.window = true;`.
- [ ] **Step 2:** In `startWalk`'s `if (duskActive)` block (main.js:1018), after the sky/fog/sun lines: traverse the scene and swap tagged windows to a warm emissive — `scene.traverse((o) => { if (o.userData?.window) o.material = litMaterial(0xffe0a0, { emissive: 0x8a6a20 }); });` (bloom-friendly on the high tier; the composer threshold 0.85 keeps it subtle; the swapped-out material is disposed by endWalk's scene traversal like every other material). The v11 hoodie perk ("cozier dusk") already reads warmer for free.
- [ ] **Step 3:** Build green; browser check a dusk walk (glow collar equipped) — windows glow. Commit `feat: warm window glow on dusk walks`.

### Task 3.4: Layered ambience

**Files:** modify `src/audio.js`, `src/main.js`; extend `test/audio.test.js`.

**Interfaces:**
- Produces: `startAmbient(areaKey, { dusk = false, rain = false } = {})` (second arg new, optional — existing callers unaffected). Internally builds an array of layer objects each `{ stop() }`; `stopAmbient()` stops all.

- [ ] **Step 1: Failing test** (extend `test/audio.test.js`): calling `startAmbient('neighborhood', { dusk: true })` then `stopAmbient()` stops every started source — with the fake ctx, count `createBufferSource` results whose `stop` was called (add a `stopped` flag to the fake's nodes).
- [ ] **Step 2:** Implement layers, each a private builder returning `{ stop }`:
  - `windLayer()` — looped 2s noise buffer → lowpass 300 → gain 0.03 with 0.07Hz LFO (same technique as the existing seaside waves at audio.js:83, lower and quieter). Used for `neighborhood` and `park`.
  - `wavesLayer()` — the existing seaside code, extracted unchanged.
  - `gullLayer()` — interval 6–14s, 45% chance: two descending `vocal`-style cries (`tone(1400, 0.25, { type: 'sawtooth', gain: 0.02, slideTo: 900 })` ×2 offset 0.3s). Seaside only.
  - `cricketLayer()` — interval 700ms, 70% chance: 3 rapid ticks `tone(4200, 0.02, { gain: 0.012, delay: i * 0.045 })`. Dusk only, any area.
  - `birdsongLayer()` — the existing interval birdsong, extracted; suppressed when `rain` or `dusk`.
  - `rainLayer()` — looped noise → highpass 400 → lowpass 2800 → gain 0.045. When `rain`.
  Composition: seaside = waves + gulls (+crickets if dusk); others = wind + (rain ? rainLayer : birdsong) (+crickets if dusk). All connect to `master`.
- [ ] **Step 3:** main.js:1326 becomes `audio.startAmbient(areaId, { dusk: duskActive, rain: weather.condition === 'rain' });`.
- [ ] **Step 4:** Suite + build green; browser check: neighborhood has soft wind, rain walk has rain wash, dusk has crickets. Commit `feat: layered location/weather/dusk ambience`.

### Task 3.5: Phase 3 review, verify, release

- [ ] Regression + build; final review focus: collider coverage on new solid props (walk into each — no clipping), draw-call growth acceptable on mobile tier, skylife's rng isolation from `walkRng` (grep: no `walkRng` reference in skylife wiring beyond seed derivation), ambience layers all stopped by `stopAmbient` (no leaked intervals/sources across walks — start 3 walks in a row and listen).
- [ ] Fix wave if needed; browser verification + screenshots (daytime density, dusk windows); merge → `main`, deploy green, live smoke.

---

# Phase 4 — v14 "Cat Athletics"

Branch: `feature/v14-athletics`.

### Task 4.1: Zoomies — sprint state with drift + FOV kick

**Files:** modify `src/player.js`, `src/main.js`; create `test/player-zoom.test.js`.

**Interfaces:**
- Produces: pure export from player.js — `zoomState(prev, dt, { active, stalking, speedRatio })` → `{ charging, zooming, time }`; and on the player api: `player.zooming` (bool getter). Zoom rules: full-speed input (`active && !stalking && speedRatio > 0.85`) charges for 1.5s, then `zooming = true` (pace ×1.55, velocity lerp factor halved for drift); any stop/stalk resets instantly.

- [ ] **Step 1: Failing tests:**

```js
// test/player-zoom.test.js
import { describe, it, expect } from 'vitest';
import { zoomState } from '../src/player.js';

const RUN = { active: true, stalking: false, speedRatio: 1 };
describe('zoomState', () => {
  it('charges to zooming after 1.5s of full-speed running', () => {
    let s = { charging: false, zooming: false, time: 0 };
    s = zoomState(s, 1.0, RUN);
    expect(s.zooming).toBe(false);
    s = zoomState(s, 0.6, RUN);
    expect(s.zooming).toBe(true);
  });
  it('resets on stalking or stopping', () => {
    let s = zoomState({ charging: true, zooming: true, time: 2 }, 0.1, { ...RUN, stalking: true });
    expect(s.zooming).toBe(false);
    expect(s.time).toBe(0);
    s = zoomState({ charging: true, zooming: true, time: 2 }, 0.1, { ...RUN, active: false });
    expect(s.zooming).toBe(false);
  });
});
```

- [ ] **Step 2:** FAIL, then implement `zoomState` (pure) and integrate in `player.update`: keep `let zoom = { charging: false, zooming: false, time: 0 }`; compute `speedRatio = velocity.length() / (pace * api.speedFactor || 1)`; when zooming, target speed uses `pace * 1.55` and the lerp exponent halves (`1 - Math.pow(0.001, dt)` → `1 - Math.pow(0.03, dt)` — floatier). Expose `get zooming() { return zoom.zooming; }`. Reset in `setAvatar`/`disable`.
- [ ] **Step 3: main.js juice:** in the render loop, ease `camera.fov` toward `player.zooming ? 77 : 70` at `dt * 4` and `camera.updateProjectionMatrix()` only when it changed > 0.01. Sparkle trail: throttle `session.fx.burst(session.cat.position, 0xfff2c0, 4)` to every 0.12s while zooming (skip on `reducedMotion`; note the v11 cape perk's "zoomie sparkle trail" — if the cape's own trail landed in v11, gate this generic trail to `!cape` so they don't double). Audio: `audio.zoomWind()` — a 0.25s soft noise whoosh (noise buffer → bandpass 900 → gain 0.02) fired on the transition into zooming.
- [ ] **Step 4:** Suite + build green; browser check (hold joystick forward 2s → speed-up + FOV widen + trail). Commit `feat: zoomies sprint with drift, FOV kick, and trail`.

### Task 4.2: Parkour — perch chains, rooftops, elevated collectibles

**Files:** modify `src/main.js` (`doPounceOrClimb`, collectible prompt/mesh y), `src/world/neighborhood.js`, `src/world/park.js`, `src/world/seaside.js`; create `test/climbing.test.js`.

**Interfaces:**
- Produces: pure export from main.js is not testable — so create the rule in `src/climbing.js`: `canReach(perch, catPos, currentY)` → bool. Rule: horizontal distance < (perch.y > 1 ? 2.6 : 1.2) **and** `perch.y - currentY <= 1.6` (you climb up in ≤1.6 steps; any drop down is allowed). `areaData.collectibles` entries may now carry `y` (default 0); the collect prompt additionally requires `Math.abs((session.perched?.y ?? 0) - (c.y ?? 0)) < 0.9`.

- [ ] **Step 1: Failing tests** (`test/climbing.test.js`): ground → fence (y 0.85) reachable from y 0; roof (y 3.1) NOT reachable from y 0; roof reachable from car roof (y 1.35 → within 1.6 of 2.9? 2.9−1.35 = 1.55 ✓); use exact numbers from the world data below.
- [ ] **Step 2:** Implement `src/climbing.js` (6 lines), swap `doPounceOrClimb`'s inline reach check (main.js:858-864) to `canReach(pp, session.cat.position, player.perchY)`.
- [ ] **Step 3: World data.** Neighborhood: fence-top perches along the dog-yard fence (`{ x: 22, z: -28, y: 0.85 }`, `{ x: 18, z: -24, y: 0.85 }`); a climb chain to a roof — `{ x: -4, z: 20, y: 1.35 }` (existing car) → `{ x: -8, z: 18, y: 2.9, label: 'rooftop scout', vantage: true }` → ridge `{ x: -12, z: 15.5, y: 4.1, label: 'king of the roof', vantage: true }` (2.9−1.35=1.55 ✓, 4.1−2.9=1.2 ✓). Elevated collectible: `{ id: 'yarn-roof', x: -12, z: 15.5, y: 4.1, label: 'a legendary silver yarn ball' }` and mesh position uses `c.y ?? 0.2`. Park/seaside: one two-step chain + one elevated collectible each (park: bench → tree-branch perch y 2.2; seaside: rock y 0.7 → dune ledge y 1.9).
- [ ] **Step 4:** Suite + build green; browser check: climb the chain with repeated ␣ presses, grab the roof yarn. Commit `feat: parkour perch chains with rooftop collectibles`.

### Task 4.3: Stalk-and-pounce hunting

**Files:** modify `src/critters.js`, `src/goals.js`, `src/discoveries.js`, `src/main.js`; extend `test/goals.test.js` expectations if they enumerate the pool.

**Interfaces:**
- Consumes: `critters.list` entries (`{ type, group, fleeing, … }`), `player.stalking`, `s.pounceTime`.
- Produces: `critters.markStalked(catPos, isStalking)` — called per-frame; sets `c.stalkClose = true` on any grounded skittish critter (`squirrel`, `bird`, `mouse`) when the stalking player is within 3 units, cleared when the player exits 6 units not stalking. `critters.pounceCatch(pos)` → `null | { type, wasStalked }` — catches the nearest fleeing-or-idle grounded skittish critter within 0.9 of `pos` (marks it caught: it flees fast and becomes uncatchable for 20s; **no critter is removed/harmed** — it's tag, not hunting-hunting: the toast language is "you pounced X! it scampers off"). New critter type `mouse`: tiny (scale 0.5 squirrel geometry, gray), fast flee, 2 spawns per area added to each world's `critterSpawns`.
- New award type `hunt: 12` in `AWARDS`; new goal `{ id: 'pounce-play', text: 'Pounce-tag 2 critters', type: 'hunt', target: 2 }` in `GOAL_POOL`.

- [ ] **Step 1: Failing test** for the pure part of critters if a pure helper exists; critters.js is scene-coupled, so instead TDD the goal-pool addition (extend `test/goals.test.js`: pool contains `pounce-play` with type `hunt`) and rely on browser verification for the catch feel.
- [ ] **Step 2:** Implement critters changes + world `mouse` spawns.
- [ ] **Step 3: main.js.** In `updateAvatar`, each frame: `s.critters.markStalked(cat.position, player.stalking)`. In the existing pounce-catch block (main.js:1514), alongside `catchAt`: `const hunted = s.critters.pounceCatch(cat.position); if (hunted) { const bonus = hunted.wasStalked ? ' — a perfect sneak!' : ''; log.award('hunt', `hunt-${hunted.type}`, `you pounce-tagged ${labelFor(hunted.type)}!${bonus}`); if (hunted.wasStalked) { s.slowmoTime = 0.8; audio.fanfare(); } }`. Slow-mo: add `slowmoTime: 0` to the session literal; in the render loop compute `const wdt = s.slowmoTime > 0 ? dt * 0.35 : dt` and pass `wdt` to `critters.update`, `strayCats.update`, and `skyLife.update` ONLY (player/camera stay real-time — motion-safety); decrement `s.slowmoTime -= dt`. Add `mouse: 'a quick little mouse'` to `labelFor`.
- [ ] **Step 4:** Suite + build green; browser check: stalk (joystick soft push = stalk magnitude) a squirrel close, pounce → award + brief slow-mo. Commit `feat: stalk-and-pounce critter tag with slow-mo reward`.

### Task 4.4: Movement audio + landing squash

**Files:** modify `src/audio.js`, `src/cat/animator.js`, `src/main.js`.

- [ ] **Step 1: Audio.** `pounceWhoosh()` — 0.18s noise → bandpass 700→300 sweep, gain 0.04. `landThump()` — `tone(90, 0.1, { type: 'sine', gain: 0.08, slideTo: 55 })`. `step()` — `tone(1900, 0.012, { gain: 0.006 })` (near-subliminal tick).
- [ ] **Step 2: Wire.** `doPounceOrClimb`'s pounce branch → `audio.pounceWhoosh()`. The landing detection from Task 2.4 (pounceTime crossing 0) → `audio.landThump()` next to the dust burst. Footsteps: in `updateAvatar`, accumulate `s.stepPhase += speed * dt * 2.2; if (s.stepPhase > 1 && speed > 1.5) { s.stepPhase = 0; audio.step(); }` (init `stepPhase: 0` in the session literal).
- [ ] **Step 3: Animator squash.** In `animateCat`, add a `'land'` state before the `walking` block: `body.scale.set(bsx * 1.14, bsy * 0.78, bsz * 1.05); body.position.y = base.bodyY - 0.05; return;`. main.js: add `landTime: 0` to the session; set `s.landTime = 0.12` at the pounce-landing detection; in the pose chain insert `else if (s.landTime > 0) pose = 'land';` right after the `pounce` branch, decrement `s.landTime -= dt`.
- [ ] **Step 4:** Suite + build green; browser check feel. Commit `feat: pounce whoosh, land thump, squash frame, soft footsteps`.

### Task 4.5: Phase 4 review, verify, release

- [ ] Regression + build; final review focus: slow-mo can never freeze remotes' interpolation (only local ambient systems get `wdt`; `remotes.update` gets real `dt`); zoom + stalk interactions (stalk cancels zoom instantly); climbing chain reachability numbers match `canReach`; co-walk determinism untouched (mouse spawns are in static world data → same for both clients; `pounceCatch` is local-only — no wire events, no shared canon state consumed).
- [ ] Fix wave; browser verify (climb chain, hunt, zoomies); merge → deploy → live smoke.

---

# Phase 5 — v15 "Collector's Journal"

Branch: `feature/v15-journal`.

### Task 5.1: Additive save fields — journal, golden, streak, kitten (TDD, data-safety task)

**Files:** modify `src/progression.js`; extend `test/progression.test.js`.

**Interfaces:**
- Produces (all additive — **no version bump**; a v4 save missing these fields loads with defaults through `sanitizeState`):
  - `state.journal` — `{ [critterType: string]: count }`, types restricted to `JOURNAL_TYPES` (exported: `['bird','squirrel','butterfly','duck','seagull','crab','dog','villager','firefly','mouse']`).
  - `state.golden` — `string[]` of found golden-mouse ids (validated against a `KNOWN_GOLD` set imported from `src/goldmice.js` — see Task 5.3; to avoid a cycle, `goldmice.js` exports only data at module top).
  - `state.streak` — `{ last: string|null (YYYY-MM-DD), count: int ≥ 0 }`.
  - `state.kitten` — `{ stage: int 0..3 }`.
  - Methods: `recordSighting(type)` (increments journal, saves; ignores unknown types), `recordGolden(id)` → bool (false if already found/unknown), `recordStreakWalk(todayStr)` → `{ count, bonus }` (same day → `{count, bonus: 0}`; consecutive day → count+1; gap → count=1; bonus = `Math.min(5 * count, 25)` awarded only when the day changed — the CALLER adds the points so the toast can show them), `setKittenStage(n)` (clamped 0..3, monotonic — never decreases).

- [ ] **Step 1: Failing tests** (extend `test/progression.test.js`; follow its existing fake-storage pattern):

```js
it('v4 save without journal/golden/streak/kitten loads with defaults', () => {
  const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, points: 50, equipped: { cat: 'tabby' } }) });
  const p = createProgression(storage);
  expect(p.state.journal).toEqual({});
  expect(p.state.golden).toEqual([]);
  expect(p.state.streak).toEqual({ last: null, count: 0 });
  expect(p.state.kitten).toEqual({ stage: 0 });
  expect(p.state.points).toBe(50); // nothing else disturbed
});
it('sanitizes hostile new fields', () => {
  const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
    journal: { bird: 3, dragon: 9, squirrel: '<img>' }, golden: ['gm-neigh-1', 'nope', 7],
    streak: { last: 12, count: -3 }, kitten: { stage: 99 } }) });
  const p = createProgression(storage);
  expect(p.state.journal).toEqual({ bird: 3 });         // unknown type + non-numeric dropped
  expect(p.state.golden).toEqual(['gm-neigh-1']);       // unknown/non-string dropped
  expect(p.state.streak).toEqual({ last: null, count: 0 });
  expect(p.state.kitten).toEqual({ stage: 3 });         // clamped
});
it('recordStreakWalk: same-day, consecutive, and gap', () => {
  const p = createProgression(fakeStorage({}));
  expect(p.recordStreakWalk('2026-08-13')).toEqual({ count: 1, bonus: 5 });
  expect(p.recordStreakWalk('2026-08-13')).toEqual({ count: 1, bonus: 0 });
  expect(p.recordStreakWalk('2026-08-14')).toEqual({ count: 2, bonus: 10 });
  expect(p.recordStreakWalk('2026-08-20')).toEqual({ count: 1, bonus: 5 });
});
```

(Consecutive-day check: parse both as `Date.UTC` from the YYYY-MM-DD parts and compare the difference to exactly 86_400_000 ms — no timezone math.)

- [ ] **Step 2:** FAIL → implement in `defaultState()` + `sanitizeState()` (each field individually, per the existing style) + the four methods. `migrateV3ToV4` needs no change (it funnels through `sanitizeState`).
- [ ] **Step 3:** Full suite green (cloud/summarize tests unaffected). Commit `feat: journal/golden/streak/kitten save fields with sanitize (additive, no version bump)`.

### Task 5.2: Critter journal — recording + Album-tab UI

**Files:** create `src/journal.js`, `test/journal.test.js`; modify `src/main.js`, `src/ui/homebase.js`.

**Interfaces:**
- Produces: `CRITTER_INFO` — array of `{ id, emoji, name, hint }` for the 10 `JOURNAL_TYPES` ids (e.g. `{ id: 'mouse', emoji: '🐭', name: 'Quick Mouse', hint: 'Stalk quietly, then pounce!' }` — write all ten with kid-friendly hints). `renderJournalHtml(journal, goldenFound, goldenTotal)` → HTML string: a grid where a spotted entry shows emoji + name + `×count`, an unspotted one shows `❓` + its hint; footer line `🥇 Golden mice: {goldenFound}/{goldenTotal}`. All content is from the static catalog — no user/network strings — but keep counts through `Number.isFinite` coercion anyway.

- [ ] **Step 1: Failing tests** (`test/journal.test.js`): spotted entries render name+count, unspotted render `❓` and the hint, golden footer renders `2/9`, a hostile count (`{ bird: '<script>' }`) renders as unspotted (coerced 0).
- [ ] **Step 2:** Implement. **Step 3: Record sightings** in main.js — the two `awardOnce('critter', 'spot-…')` sites (main.js:1545 and :1551 area; the stray one stays out — strays aren't journal critters) plus `catchAt`/`pounceCatch` awards: call `progression.recordSighting(c.type)` next to the critter-spot `awardOnce` (only when the award actually paid: `if (log.awardOnce(...) > 0) progression.recordSighting(c.type)`).
- [ ] **Step 4: Album tab** (`src/ui/homebase.js`): add a "Critter Journal 📖" section above the photo grid rendering `renderJournalHtml(s.journal, s.golden.length, GOLD_TOTAL)` (import `GOLD_TOTAL` from goldmice.js after Task 5.3 — for THIS task pass `(s.golden ?? []).length, 9` literal and swap in 5.3).
- [ ] **Step 5:** Suite + build green; browser check the Album tab. Commit `feat: critter journal with Album-tab grid`.

### Task 5.3: Golden mice

**Files:** create `src/goldmice.js`, `test/goldmice.test.js`; modify `src/main.js`, `src/ui/homebase.js` (swap the literal from 5.2), `src/progression.js` (import KNOWN_GOLD — see 5.1 note).

**Interfaces:**
- Produces: `GOLD_MICE` — `{ [areaId]: Array<{ id, x, z, y }> }`, 3 per area, ids `gm-<area>-<n>`; positions at parkour destinations from Task 4.2 (neighborhood: roof ridge `(-12, 15.5, 4.1)`, dog-yard fence corner `(26, -28, 0.85)`, billboard top `(7, -14, 3.3)` — add a matching perch `{x: 7, z: -14, y: 3.3}` if the billboard lacks one; park + seaside: at their chain tops + one ground-level hidden spot each). `KNOWN_GOLD` — `Set` of all 9 ids. `GOLD_TOTAL = 9`. `createGoldMice(scene, areaId, foundIds)` → `{ list, update(t), checkFind(catPos, perchY) → found | null, dispose() }` — spawns only un-found mice (tiny gold mouse: `SphereGeometry(0.12)` body + cone nose + thin tail box, `litMaterial(0xf2c14e, { emissive: 0x9a7a20 })`, gentle bob in `update`); `checkFind` returns a mouse when the cat is within 1.0 horizontally and 0.9 vertically (compare against `perchY`).
- New award type `legend` already exists (50 points) — golden mice use it.

- [ ] **Step 1: Failing tests:** `GOLD_MICE` integrity (9 total, unique ids, every id in `KNOWN_GOLD`, each has finite x/z/y); `checkFind` respects the vertical gate (a ground cat can't grab the roof mouse).
- [ ] **Step 2:** Implement. **Step 3: Wire main.js:** in `startWalk` (solo AND room — golden mice are personal, position-static, award-local; no wire events, so co-walk safe): `session.goldMice = createGoldMice(scene, areaId, new Set(progression.state.golden));`. In the render loop: `const gm = session.goldMice.checkFind(session.cat.position, player.perchY); if (gm && progression.recordGolden(gm.id)) { log.awardOnce('legend', gm.id, 'a GOLDEN MOUSE! 🥇'); session.fx.burst(session.cat.position, 0xf2c14e, 18); audio.fanfare(); session.goldMice.remove(gm.id); }` (add `remove(id)` to the api: despawn that mesh). Dispose in `endWalk`.
- [ ] **Step 4:** homebase golden footer now uses `GOLD_TOTAL`. Suite + build green; browser check: climb to the fence-corner mouse. Commit `feat: nine hidden golden mice at parkour spots`.

### Task 5.4: The lost-kitten quest chain (multi-walk story)

**Files:** create `src/kitten.js`, `test/kitten.test.js`; modify `src/main.js`, `src/ui/homebase.js`.

**Interfaces:**
- Consumes: `state.kitten.stage` (0..3, from 5.1), `buildCat(breed)` (scaled 0.5 — same as quests.js's kitten), scent-puff visual idiom.
- Produces: `kittenPlan(stage, areaId)` (pure) → `null | { kind: 'trail' } | { kind: 'meet' } | { kind: 'home' }` — trail on stage 0, meet on stage 1, home (kitten hangs out near spawn) on stage 3; stage 2 → home too (2 is transient: set at the end of the meet walk, promoted to 3 at that walk's summary). Neighborhood-only for stages 0–1 (`areaId !== 'neighborhood'` → null unless stage ≥ 2). `createKittenEncounter(scene, plan, spawn)` → `{ group|null, update(dt, catPos), promptAt(catPos) → string|null, interact() → 'advanced'|null, dispose() }`:
  - **trail:** 5 small paw-print decals (flat dark circles, 0.06r, paired) leading from the crossroads toward `KITTEN_SPOT = { x: -18, z: -6 }`; at the spot, `promptAt` within 2 → `'E — investigate the tiny mew'`; `interact()` → toast text handled by main; no kitten visible.
  - **meet:** kitten (`buildCat('calico')`, scale 0.5) at `KITTEN_SPOT`, mewing (audio.trill at 1.5× pitch every 6–9s via a passed-in `onMew` callback so kitten.js stays audio-free); `promptAt` within 2 → `'E — comfort the kitten'`; after `interact()`, the kitten follows: `update` lerps it toward `catPos` at max speed 2.4, stopping at 1.1 distance.
  - **home:** kitten wanders a 4-unit radius around the area spawn; `promptAt` within 2 → `'E — nuzzle Mochi'`; `interact()` → award-once nuzzle.
- [ ] **Step 1: Failing tests** (`test/kitten.test.js`): `kittenPlan` stage/area matrix (0+neighborhood → trail; 0+park → null; 1+neighborhood → meet; 2 or 3 anywhere → home).
- [ ] **Step 2:** Implement kitten.js. **Step 3: Wire main.js.** Solo walks only (`roomSeed === undefined` — a co-walk kitten would desync canon): build from `kittenPlan(progression.state.kitten.stage, areaId)`. Prompt integration: in `updateInteractions` after the ghost check, `if (!s.prompt && s.kittenEnc) { const kp = s.kittenEnc.promptAt(catP); if (kp) { s.prompt = { kind: 'kitten' }; setPrompt(kp); } }`. In `handleInteract`: `kind === 'kitten'` → `const r = s.kittenEnc.interact(); ` stage 0 → `progression.setKittenStage(1); hud.toast('A tiny mew… but nothing here. Maybe next walk. 🐾'); log.award('quest', 'kitten-trail', 'you followed the tiny paw prints');` stage 1 → `progression.setKittenStage(2); hud.toast('The kitten trusts you! She follows close. 🐱'); log.award('quest', 'kitten-meet', 'a lost kitten befriended');` stage ≥ 2 (home) → `log.awardOnce('pet', 'kitten-nuzzle', 'a nuzzle from Mochi');`. In `endWalk`, if stage === 2: `progression.setKittenStage(3);` and inject a line into the summary card: `<div class="best-line">Mochi the kitten followed you home! 🐱</div>`. Homebase hero (Play tab): when stage === 3 show a static line `🐱 Mochi lives with you now` (in `src/ui/homebase.js` near the rank line — static string, no escaping need).
- [ ] **Step 4:** Suite + build green; browser-play the whole chain across 3 walks (stage persists in the save). Commit `feat: lost-kitten quest chain across walks`.

### Task 5.5: Daily streak + photo polish

**Files:** modify `src/main.js`, `src/ui/homebase.js`, `src/album.js`, `src/style.css`.

- [ ] **Step 1: Streak wiring.** In `endWalk`, before the summary is built: `const today = new Date().toISOString().slice(0, 10); const streak = progression.recordStreakWalk(today); if (streak.bonus > 0) { progression.addPoints(streak.bonus); }` and add to the summary card when bonus > 0: `<div class="best-line">🔥 day ${streak.count} streak — +${streak.bonus} bonus 🐾</div>`. Homebase hero: when `state.streak.count >= 2` render `🔥 ${count}-day streak` next to the rank (static numbers through `asFiniteNonNeg`).
- [ ] **Step 2: Photo polish.** `album.add` stores `date: new Date().toISOString().slice(0, 10)` (extend `sanitizeAlbumPayload` to keep only `YYYY-MM-DD`-shaped strings, else drop the field); album grid cards get a `photo-framed` CSS class — cream border + slight rotate alternating `:nth-child(odd)`, plus a caption line `label · area · date` (label/area already escaped by the existing render path — keep that; date is sanitize-shaped).
- [ ] **Step 3:** Extend `test/album.test.js`: hostile `date` (`{date: '<img>'}`) is dropped, valid date survives a round-trip. Suite + build green; browser check summary streak line + album frames. Commit `feat: daily streak bonus and framed album photos`.

### Task 5.6: Phase 5 review, verify, release

- [ ] Regression + build; final review focus: **save safety** (the 5.1 hostile-payload tests genuinely cover every new field; cloud round-trip: save-to-cloud → load-from-cloud preserves journal/golden/streak/kitten — add a test in `test/progression.test.js` proving `replaceFromPayload` keeps them); kitten solo-only gating; goal/points inflation acceptable (golden mice are 50 each ×9 — one-time, fine).
- [ ] Fix wave; browser verify; merge → deploy → live smoke.

---

# Phase 6 — v16 "Together"

Branch: `feature/v16-together`.

### Task 6.1: Ghost chat replies — named-cat voices reachable

**Files:** modify `src/main.js` (`sendPhrase` in startWalk).

- [ ] **Step 1:** In `sendPhrase` (main.js:1224), after the stray-target block: if no stray answered, target the nearest ghost — `const ghost = session.ghosts.nearest(catP, 5); if (ghost) { const seed = (seedFromCode(session.walkStamp ?? '') + hashName(ghost.petName)) >>> 0; const line = replyFor(ghost.breed, phraseId, seed); setTimeout(() => { if (session && session.ghosts.list.includes(ghost)) chatBubbles.show(ghost.group, line); }, 600); }` — `replyFor` already has the zeetoo/rosa/robbie/hagrid voices (v10); ghost.breed comes from the profile. **`line` is generated locally from the static catalog — safe; but `ghost.petName` is server-derived: it is NOT rendered here (only hashed), keep it that way.** No greet award from ghost chat (ghost greets stay on the E-boop path — don't double-award).
- [ ] **Step 2:** Suite + build green. Browser check needs a friend ghost — use the node-bot/second-context setup from Task 6.5, or verify by code review + defer the live check to 6.5. Commit `feat: ghosts answer chat in their named-cat voices`.

### Task 6.2: Co-walk verbs — pounce-tag, mutual grooming, duo goal

**Files:** modify `src/main.js`, `src/discoveries.js` (AWARDS), `src/goals.js`; create `test/verbs.test.js`.

**Interfaces:**
- New AWARDS: `tag: 8`, `groom: 6`, `duogoal: 20`.
- New event types on the existing `event` kind (old clients ignore unknown types — verified: `applyRemoteEvent` falls through): `{ type: 'pounce-tag', toId }`, `{ type: 'tag-back', toId }`, `{ type: 'goal-progress', goalId }`.
- Pure helper in `src/verbs.js`: `tagState(prev, ev, now)` — a chain tracker like `noteBat`: `{ withId, taggedAt, awaiting }`; `pounce-tag` received → `awaiting: true` for 30s; our own pounce-tag toward the same player while `awaiting` → complete. `groomTimer(prev, dt, { bothGrooming, close })` → `{ time, done }` (done at 2s, resets when apart/not grooming).

- [ ] **Step 1: Failing tests** (`test/verbs.test.js`): tag chain completes only within the 30s window and only with the same partner; groom timer needs both conditions continuously (a 1.9s hold then a break restarts).
- [ ] **Step 2:** Implement `src/verbs.js`. **Step 3: Wire main.js.**
  - **Pounce-tag:** at pounce-landing detection, find the nearest remote within 1.3; if found send `{ type: 'pounce-tag', toId }` and run local `tagState`; in `applyRemoteEvent` handle `pounce-tag`/`tag-back` addressed to us — on chain completion both sides `log.awardOnce('tag', `tag-${otherId}`, `tag with ${petNameFor(s, otherId)}! 🏃`)` + toast "Tag! Pounce them back! 🐾" on the first touch. Convergence mirrors the boop pattern (awardOnce dedupes).
  - **Grooming:** per-frame in `updateAvatar` (room walks only): for each remote `r`, `bothGrooming = s.pose === 'groom' && r.pose === 'groom'`, `close = r.group.position.distanceTo(cat.position) < 1.2`; run `groomTimer`; on done → `log.awardOnce('groom', `groom-${r.playerId}`, `mutual grooming with ${petNameFor(s, r.playerId)} 🫧`)` (each side detects locally from synced poses — no event needed; awardOnce dedupes).
  - **Duo goal:** in `startWalk`, when `roomSeed !== undefined`, after `createGoals(walkRng)` replace `goals.goals[0]` with `{ id: 'duo-greet', text: 'Together: greet 5 cats', type: 'friend', target: 5, duo: true, progress: 0, done: false }` (both clients compute identically — same seeded goals, same replacement). In `noteGoal`, when a `friend`-type note advances a `duo` goal locally, also `session.net?.sendEvent({ v: 1, id: session.playerId, type: 'goal-progress', goalId: 'duo-greet' })`; `applyRemoteEvent` `goal-progress` → `session.goals.note('friend')`-equivalent for the duo goal only — implement as `noteDuoRemote(goalId)` on the goals object: advance the matching duo goal without re-broadcasting (no echo loop). Completion pays the normal goal award plus `log.awardOnce('duogoal', 'duo-greet', 'a goal completed TOGETHER! 🤝')`.
- [ ] **Step 4:** Suite + build green. Commit `feat: pounce-tag, mutual grooming, duo goals`.

### Task 6.3: Daily zoomies race

**Files:** create `src/race.js`, `test/race.test.js`; modify `src/main.js`, `src/progression.js` (+ tests), `src/ui/homebase.js`.

**Interfaces:**
- `raceCourse(pois, seed)` (pure) → 5 waypoints seeded-shuffled from the area's `pois` (mulberry32(seed) Fisher-Yates, take 5; pois arrays all have ≥ 8). Daily seed: `seedFromCode(dateStr + '-' + areaId)`.
- `createRace(scene, course, spawn)` → `{ state: 'idle'|'running'|'done', update(dt, catPos), promptAt(catPos) → string|null, begin(), timeMs, currentRing, dispose() }`. Visual: start pad (flat ring at `spawn` offset `(2, 0, -3)`), rings = `TorusGeometry(1.1, 0.08)` upright at each waypoint, next ring emissive-bright, passed rings dim; crossing = horizontal distance < 1.2. Timer runs `state === 'running'`; last ring → `done`.
- Progression (additive field, same discipline as 5.1 incl. hostile-payload test): `state.race = { date: string|null, area: string|null, bestMs: number|null }`; `recordRace(dateStr, areaId, ms)` → `{ isBest }` (new date/area resets best).
- [ ] **Step 1: Failing tests:** `raceCourse` determinism (same seed → same 5, different seed → different order), no duplicate waypoints; `recordRace` same-day improvement + next-day reset; sanitize hostile race field.
- [ ] **Step 2:** Implement race.js + progression field. **Step 3: Wire main.js:** solo AND room walks (same daily seed on every device — siblings race the same course; in rooms both clients build it from the same date+area so it's naturally shared). Build in `startWalk`: `session.race = createRace(scene, raceCourse(areaData.pois, seedFromCode(today + '-' + areaId)), areaData.spawn);`. Prompt: `promptAt` on the start pad → `'E — start today’s zoomies race! 🏁'` → `begin()`; HUD objective shows `Race: ring ${currentRing}/5` while running; on done → `const r = progression.recordRace(today, areaId, session.race.timeMs); hud.toast(r.isBest ? \`🏁 ${fmt(timeMs)} — today's best!\` : \`🏁 ${fmt(timeMs)}\`); log.awardOnce('goal', 'race-done', 'the daily zoomies race');` with `fmt = (ms) => (ms / 1000).toFixed(1) + 's'`. Homebase Play tab: `Today's race best: 12.4s 🏁` when `state.race.date === today` (numbers through `asFiniteNonNeg`). Update/dispose in the loop/endWalk.
- [ ] **Step 4:** Suite + build green; browser-run a race. Commit `feat: seeded daily zoomies race with local best time`.

### Task 6.4: Sampled pet voices (with synth fallback)

**Files:** create `src/samples.js`, `test/samples.test.js`, `docs/RECORDING-PETS.md`, `public/sounds/manifest.json` (empty list `{"files": []}` initially); modify `src/audio.js`, `src/main.js`.

**Interfaces:**
- `createSamples(baseUrl, { fetchFn = fetch, decode } = {})` → `{ ready: Promise, has(name), play(name, { rate = 1, volume = 1 }) }`. Loads `${baseUrl}sounds/manifest.json` (`{ files: ["zeetoo.mp3", …] }`); each file lazily fetched + decoded on first `play`, cached. Any failure (404, offline, decode error) → `has()` false / `play()` no-op — **synth always remains the fallback**. `decode` is injectable for tests (default routes through a new `audio.decodeAndPlayBuffer` hook: `audio.playBuffer(audioBuffer, { rate, volume })` — a BufferSource with `playbackRate` into the master bus — plus `audio.getContext()` exposing `ensure()` for decoding).
- Naming: `<breed>.mp3|m4a|ogg` for the family cats (`zeetoo`, `rosa`, `robbie`, `hagrid`).
- [ ] **Step 1: Failing tests** (fake fetchFn): missing manifest → `has('zeetoo')` false and `play` doesn't throw; manifest with `zeetoo.mp3` → `has('zeetoo')` true; hostile manifest (`files: ['../../evil', 7]`) → entries not matching `/^[a-z0-9-]+\.(mp3|m4a|ogg)$/` dropped.
- [ ] **Step 2:** Implement. **Step 3: Wire:** main.js creates `const samples = createSamples(import.meta.env.BASE_URL, { decode: (buf) => audio.getContext().decodeAudioData(buf) })` at init; `catVoice` (and the remote-meow handler at main.js:1876) check `samples.has(breed)` first: `samples.play(breed, { rate: 0.95 + Math.random() * 0.1, volume })`, falling through to synth when absent. **Step 4:** `docs/RECORDING-PETS.md`: how the family records (phone voice memo, 1–2s, quiet room), converts (`.m4a` is fine as-is), drops files into `public/sounds/`, lists them in `manifest.json`, commits — with the exact JSON shape. Note in the doc: files in `public/` deploy verbatim under `/whisker-walk/sounds/`; offline/PWA users without the cached file just hear the synth voice.
- [ ] **Step 5:** Suite + build green (manifest ships empty — behavior identical until the family records). Commit `feat: sampled pet-voice support with synth fallback + recording guide`.

### Task 6.5: Phase 6 review, verify, release (live two-client test)

- [ ] Regression + build; final review focus: **no new broadcast kinds** (grep `sendChat|broadcast` — verbs/goal-progress all ride `sendEvent`); tag/groom/duo award convergence can't double-award (awardOnce keys); duo goal can't echo-loop (`noteDuoRemote` never re-broadcasts); race determinism (course identical for a given date+area on two clients); `samples` never blocks boot (all async, all caught).
- [ ] **Live two-client acceptance test** using the node-bot pattern from the handoff (§6: Supabase transport join with a `zzz-claude-` ME prefix so the bot never hosts): host a room in the browser, join with the bot, verify pounce-tag round-trip, goal-progress advancing the duo goal on both sides, and a chat phrase → ghost/remote bubbles. This is the v8 lesson: **wire changes get live round-trips, not just unit tests.**
- [ ] Fix wave; browser verify; merge → deploy → live smoke.

---

# Phase 7 — v17 "Cozy Den"

Branch: `feature/v17-den`.

### Task 7.1: Den save fields + furniture catalog (TDD, data-safety first)

**Files:** create `src/den.js`, `test/den.test.js`; modify `src/progression.js` (+ tests).

**Interfaces:**
- `DEN_ITEMS` (in den.js): `{ rug: { name: 'Sunbeam Rug', price: 30 }, cattree: { name: 'Deluxe Cat Tree', price: 60 }, fishtank: { name: 'Bubbling Fish Tank', price: 45 }, bed: { name: 'Donut Bed', price: 25 }, lamp: { name: 'Warm Lamp', price: 20 }, scratcher: { name: 'Scratching Post', price: 20 } }`. `DEN_SPOTS`: 6 fixed anchor ids `['rug-spot','corner-a','corner-b','window','shelf','center']` with positions used by the world builder.
- Progression (additive): `state.den = { owned: string[], placed: { [spotId]: itemId } }` (sanitize: owned filtered to DEN_ITEMS keys; placed entries kept only when the spot id and item id are known AND the item is owned). `state.walks.den` — add `den: 0` to `defaultState().walks` (the sanitize loop over `Object.keys(d.walks)` then handles it; **this prevents the `completeWalk` NaN** when den walks land in 7.2). Methods: `buyDenItem(id)` → bool (points check like `buy`), `placeDenItem(spotId, itemId|null)`.
- [ ] **Step 1: Failing tests:** hostile den payload (`owned: ['rug','nuke']`, `placed: { 'rug-spot': 'cattree' /* not owned */, 'evil': 'rug' }`) sanitizes to owned `['rug']`, placed `{}`; buy/place happy path; v4 save without `den`/`walks.den` gets defaults.
- [ ] **Step 2:** Implement. Suite green. Commit `feat: den furniture catalog and save fields`.

### Task 7.2: The den world + walk gating

**Files:** create `src/world/den.js`; modify `src/main.js`, `src/ui/homebase.js`.

**Interfaces:**
- `den.build(scene, { placed })` → the standard areaData shape: `name: 'Your Den'`, small bounds `{ minX: -8, maxX: 8, minZ: -8, maxZ: 8 }`, `spawn { x: 0, z: 6 }`, warm interior (wood floor `ground(18, 0x9a7048)`, three walls as tall boxes, a window wall showing sky, fireplace box with an emissive ember mesh), furniture built per `placed` at `DEN_SPOTS` positions (procedural low-poly per item: rug = flat cylinder, cat tree = stacked cylinders+platforms **with perches** `[{x, z, y: 1.6, label: 'top of the cat tree', vantage: true}]`, fish tank = glass box with 2 tiny fish meshes that circle in… keep fish static — no update hook in world data, they can be angled as if mid-swim), `boxes: [{ x: -5, z: -5 }]` (a cardboard box, obviously), empty `critterSpawns`/`collectibles`/`moments`/`scenics`/`tippables`/`puddles`, `pois: []`, `skyDusk` same palette as neighborhood.
- main.js: `AREAS.den = den` requires build signature compatibility — den.build takes `(scene, opts)`; call it specially: in `startWalk`, `const isDen = areaId === 'den'; const areaData = isDen ? AREAS.den.build(scene, { placed: progression.state.den.placed }) : AREAS[areaId].build(scene);`.
- **Walk gating** in `startWalk` when `isDen`: skip weather (leave the default no-op), skip `rollSecrets/createSecrets` (use `{ list: [], update() {} }`), skip quest giver block, `createStrayCats(scene, areaData, 0, walkRng)`, skip goals — `session.goals = null` and guard: `noteGoal` already guards (`session?.goals` → make it `session?.goals?.note` safe), `hud.setGoals(null)`, `endWalk`'s `goalsDone` → `session.goals ? …filter(…).length : 0` and the summary hides the goals stat for den. Skip race/goldMice/kitten-trail (kitten stage ≥ 2 **does** appear — `kittenPlan(stage, 'den')` → `home` when stage ≥ 2; extend the 5.4 pure test). Ghost visits DO spawn (it's solo — reuse `spawnGhosts` as-is; a friend's pet curled up in your den is the payoff). `endWalk` `completeWalk` now safe via `walks.den` (7.1).
- Homebase: a `Visit your den 🏠` button next to Start (Play tab) → `beginWalkFromHomebase` variant: `startWalk({ areaOverride: 'den' })` — **den never enters room walks** (the button is hidden while a room is pending) and never persists as `state.area` (areaOverride semantics already do this — main.js:974). Plus a "Your Den" section in the Play tab: DEN_ITEMS cards (reuse the `card()` idiom: price, Buy via `buyDenItem`) and per-spot placement `<select>`s (options = owned items + "empty") calling `placeDenItem` — all static catalog strings.
- [ ] **Step 1:** Implement world + gating + UI. **Step 2:** Suite + build green (the gating guards must not break existing tests). **Step 3: Browser check:** buy a rug + cat tree, place them, visit the den, climb the cat tree, box-sit award fires, kitten present (if stage 3), no goals HUD. Commit `feat: the den — walkable furnished home base`.

### Task 7.3: Generative lofi music

**Files:** create `src/music.js`, `test/music.test.js`; modify `src/audio.js` (expose `getContext()` + master hookup if not already from 6.4), `src/settings.js` (+test), `src/ui/homebase.js`, `src/main.js`.

**Interfaces:**
- Settings: new `musicVolume: 0.5` in DEFAULTS (clamped 0..1 like `volume`); Settings-tab slider labeled `Music 🎵`; `applySettings` pushes `music.setVolume(settings.get('musicVolume'))`.
- Pure, TDD'd: `composePhrase(rng, { mood = 'day' } = {})` → `{ steps: Array<{ beat: number (0..7), note: number (semitones above root), len: number }>, root: number (Hz), chord: number[] }` — 8-beat phrase, 4–7 notes from the pentatonic `[0, 3, 5, 7, 10]` (+12 allowed), root 220Hz for `day`, 246.94 (+2 st) for `sunset`, note density 0.4× for `rain`, root 174.61 (−4 st) + slower feel flag for `dusk`.
- `createMusic(getCtx, getMaster)` → `{ start(seed, mood), stop(), setVolume(v), playing }`. Scheduler: `setInterval` 120ms lookahead scheduling 0.25s ahead at 70bpm (beat = 60/70 ÷ 2 for 8ths); each phrase drawn from its own `mulberry32(seed + phraseIndex)`; instruments (all into a music-gain node → master): pluck = triangle osc, exp decay 0.35, lowpass 1800; bass = sine at root/2, every bar; pad = two detuned (±4 cents) triangles playing the chord, 1.2s attack, every 2 bars, gain 0.02.
- [ ] **Step 1: Failing tests** (`test/music.test.js`): `composePhrase` determinism (same rng seed → identical phrase), every note in the allowed pentatonic set, rain mood produces fewer notes than day for the same seed sequence, roots match moods. Settings test: `musicVolume` clamps and defaults.
- [ ] **Step 2:** Implement. **Step 3: Wire:** main.js creates `const music = createMusic(() => audio.getContext(), () => audio.getMaster())` (add `getMaster()` to audio); `startWalk` end: `music.start(roomSeed ?? seedFromCode(walkStamp), duskActive ? 'dusk' : weather.condition === 'rain' ? 'rain' : weather.condition === 'sunset' ? 'sunset' : 'day')` — in rooms the shared roomSeed gives both players the same song. Den uses mood `'day'` with its own seed. `endWalk` → `music.stop()`. `applySettings` pushes volume; volume 0 → `stop()`/don't start (cheap opt-out).
- [ ] **Step 4:** Suite + build green; browser check: music plays during a walk, slider works live, M-mute silences it (it's on the master bus). Commit `feat: seeded generative lofi with mood-aware phrases`.

### Task 7.4: Final release — docs + program wrap-up

- [ ] Regression + build; whole-branch final review (focus: den gating leaves normal walks bit-identical when den is untouched; den never reachable in a room; music scheduler fully stopped on endWalk — no orphaned intervals; settings sanitize).
- [ ] Fix wave; browser verify (den tour screenshots, music on).
- [ ] Merge → deploy → live smoke.
- [ ] Update `docs/SESSION-HANDOFF.md` (new §3 wave entries v12–v17, new key-files rows: `fx.js`, `catvoice.js`, `skylife.js`, `climbing.js`, `goldmice.js`, `journal.js`, `kitten.js`, `verbs.js`, `race.js`, `samples.js`, `den.js` + `world/den.js`, `music.js`; new save fields note; the pointer-lock verification workaround) and `docs/ROADMAP.md` (mark waves shipped). Commit `docs: v12–v17 shipped — update handoff and roadmap`.

---

## Plan Self-Review Notes

- **Spec coverage vs. docs/ROADMAP.md:** v11 finish → Phase 1; palette/particles/popups/bus/meow/purr/per-breed/arpeggio → Phase 2 (Tasks 2.1–2.5); density/clouds+birds/dusk windows/ambience layers → Phase 3 (fireflies already exist — noted, not duplicated); zoomies/parkour/hunting/movement-audio/camera juice → Phase 4; journal/golden/kitten/streak/photo polish → Phase 5; verbs/race/ghost-replies/samples+real pets → Phase 6; den/music → Phase 7. Roadmap items intentionally descoped: photo *sticker picker* (reduced to automatic frames + captions, Task 5.5 — a picker adds UI surface with little play value); server-side rate-limiting + save-carries-identity (frozen SQL contract — out of this plan, stays on the backlog).
- **Placeholder scan:** no TBDs; every code step carries the actual code or exact integration lines with main.js line anchors. Two intentional referrals: Phase 1 points at the complete, approved v11 plan file (a standalone document the implementer opens — not a sibling task), and Task 6.5 uses the handoff's documented node-bot pattern.
- **Type consistency spot-checks:** `voiceFor` → `{pitch, rate, gain}` consumed identically in 2.2 catVoice wiring; `createFx` api (`popup/burst/update/active/dispose`) consistent across 2.4, 4.1, 4.3, 5.3; `canReach(perch, catPos, currentY)` matches the 4.2 call `canReach(pp, session.cat.position, player.perchY)`; `recordStreakWalk(todayStr) → {count, bonus}` matches 5.5's caller; `raceCourse(pois, seed)`/`createRace(scene, course, spawn)` consistent 6.3; `kittenPlan(stage, areaId)` reused in 7.2's den extension; save fields named identically in 5.1/5.6/6.3/7.1 sanitize and their consumers.
- **Data-safety ordering:** every phase that touches the save opens with its sanitize/TDD task (5.1, 6.3's progression slice, 7.1) before any consumer, mirroring v11's Task-1-first rule. Additive-field strategy (no version bumps) is justified because `sanitizeState` already defaults missing fields per-field; tests in 5.1/7.1 prove a bare v4 payload survives.
- **Determinism audit:** skylife and music use derived/independent seeds, never the shared `walkRng` stream post-startWalk; golden mice/race/kitten are static-data or date-seeded (identical across clients); hunting is local-only with no canon side effects; duo-goal progress is the one new shared-state path and rides `sendEvent` with an explicit no-re-broadcast rule.
- **Known live-verification gaps:** desktop pointer-lock paths can't be driven by automation (protocol §3); phases 6's multiplayer features get the mandatory live bot round-trip instead.
