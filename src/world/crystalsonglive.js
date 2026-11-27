// =============================================================================
// THE SINGING CHAMBER ON A WALK (milestone C5). createSongLive(ctx) draws the seven pads (crystalsongparts.js: two draws, none on LOW's halo), lets them sing when she steps
// on them (each pad its own soft pentatonic note on humNote's root, from tone() here; humNote itself is not touched, and a muted walk is silent), and runs the three echo tunes:
// standing in the chamber, "Wake the singing stones" starts the first tune not yet learned; the chamber plays 3 to 5 notes with the pads lighting in order; she steps the same
// pads to echo it. There is NO fail sound: a wrong step, or a long wait, only lets the pads fade and the phrase plays again. Finishing a tune sets its bit in state.crystal.songs
// once and sends ONE `wc-song` event (never a single note); the third tune also gives a soft light-show flourish and the journal page ccsong. A partner's finished tune
// (credit) sets the same bit here, lights its notes in order and, on the third, gives the flourish and the page too. Walking away mid-tune lets it go; nothing is saved.
// REDUCED MOTION freezes the pads' slow breath and snaps every light on and off (the flourish is a still glow of all seven); LOW drops the halo. Draws no random number and
// reads no clock (the walk's own dt only). Adds no light.
// =============================================================================
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { crystalY } from './crystalplan.js';
import * as S from './crystalsongplan.js';
import { drawSong } from './crystalsongparts.js';
import './crystalsongwords.js';

const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
export const songRung = (tier) => (tier && (tier.shadows === false || tier.name === 'low' || (tier.rung ?? 0) >= 3) ? 'low' : 'high');
export const LIT_HOLD = 0.9; // seconds a pad stays lit after a note
export const BLOOM_HOLD = 3.2; // the flourish's last glow
export const FLOURISH_GAP = 0.2; // seconds between the flourish's notes

/** One soft note for pad `pad`, on the walk's audio context: a sine and a quiet octave, a short pluck. Asks for nothing when muted (no context, no node). */
export function tone(audio, pad, vol = 0.035) {
  if (!audio || typeof audio.getContext !== 'function' || audio.isMuted?.() || !S.NOTES[pad]) return false;
  const ac = audio.getContext();
  if (!ac) return false;
  const dest = audio.getMaster?.() ?? ac.destination;
  const now = ac.currentTime;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
  g.connect(dest);
  for (const [k, mul] of [[1, 1], [2, 0.22]]) {
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = 'sine';
    o.frequency.value = S.NOTES[pad] * k;
    og.gain.value = mul;
    o.connect(og); og.connect(g);
    o.start(now);
    o.stop(now + 1.7);
  }
  return true;
}

// createSongLive(ctx) -> { promptAt, interact, update, credit, meshes, state, dispose }
// ctx: { scene, audio, progression, reducedMotion, tier, sendEvent }
export function createSongLive(ctx) {
  const { scene, audio = null, reducedMotion = false } = ctx;
  const progression = ctx.progression ?? null;
  const send = typeof ctx.sendEvent === 'function' ? ctx.sendEvent : () => {};
  const drawn = drawSong(songRung(ctx.tier));
  for (const m of drawn.meshes) scene.add(m);
  const lit = new Array(S.PAD_COUNT).fill(0); // seconds of light left
  const held = new Array(S.PAD_COUNT).fill(false); // the echo's right steps so far stay softly lit
  const disp = new Array(S.PAD_COUNT).fill(0);
  const painted = new Array(S.PAD_COUNT).fill(-1);
  let cues = []; // { at, pad (-1: every pad), vol, vis } the flourish and a partner's tune
  let cueClock = 0;
  let clock = 0;
  let run = null;
  let runIdx = 0;
  let plays = 0;
  let lastPad = -1;
  let cat = null;
  let disposed = false;

  const songs = () => progression?.state?.crystal?.songs | 0;
  const setSongs = (v) => {
    if (!progression?.state) return;
    progression.state.crystal = { ...(progression.state.crystal ?? {}), songs: v };
    progression.addPoints?.(0); // the save's own "persist now": it adds nothing
  };
  const page = () => { try { progression?.recordSighting?.('ccsong'); } catch { /* a stand-in save */ } };
  const clearHeld = () => held.fill(false);
  const light = (pad) => { lit[pad] = LIT_HOLD; };
  const note = (pad, vol) => { tone(audio, pad, vol); light(pad); };

  const flourish = () => {
    const base = cueClock;
    cues = S.PADS.map((p) => ({ at: base + 0.2 + p.i * FLOURISH_GAP, pad: p.i, vol: 0.026, vis: !reducedMotion }));
    cues.push({ at: base + 0.2 + S.PAD_COUNT * FLOURISH_GAP + 0.1, pad: -1, vol: 0, vis: true });
  };
  const ghost = (tuneIdx) => { // a partner's tune, played softly in order
    const tune = S.TUNES[tuneIdx];
    cues = tune.map((pad, i) => ({ at: cueClock + 0.3 + i * 0.6, pad, vol: 0.022, vis: true }));
  };
  const reached = (before, after) => !S.allLearned(before) && S.allLearned(after);

  function finish(i) {
    const before = songs();
    run = null; clearHeld();
    if (S.learned(before, i)) { plays++; for (const p of S.PADS) lit[p.i] = 1.6; return; } // a replay for fun: only a glow
    const after = S.learn(before, i);
    setSongs(after);
    send({ kind: 'wc-song', tune: i });
    if (reached(before, after)) { flourish(); page(); say('crystal-song-all', phrase('crystal.wc.song.all')); } else { for (const p of S.PADS) lit[p.i] = 1.4; say('crystal-song-learned', phrase('crystal.wc.song.learned')); }
  }

  function handle(events) {
    for (const e of events) {
      if (e.k === 'phrase') note(e.pad, 0.026);
      else if (e.k === 'ok') held[e.pad] = true;
      else if (e.k === 'miss' || e.k === 'timeout' || e.k === 'replay') clearHeld();
      else if (e.k === 'done') finish(runIdx);
    }
  }

  const levelFor = (i, t) => {
    const base = S.breath(t, i, reducedMotion);
    const lightLevel = lit[i] > 0 ? (reducedMotion ? 1 : Math.min(1, lit[i] / LIT_HOLD)) : 0;
    return Math.max(base, held[i] ? 0.8 : 0, lightLevel);
  };

  for (let i = 0; i < S.PAD_COUNT; i++) { disp[i] = levelFor(i, 0); painted[i] = disp[i]; }
  drawn.paint(disp);
  return {
    meshes: drawn.meshes,
    get run() { return run; },
    get levels() { return disp.slice(); },
    get draws() { return drawn.meshes.length; },
    get triangles() { return drawn.meshes.reduce((s, m) => s + m.geometry.attributes.position.count / 3, 0); },
    promptAt(catPos) {
      if (disposed || run || !catPos) return null;
      return S.inChamber(catPos.x, catPos.z) ? phrase('crystal.wc.song.prompt') : null;
    },
    interact() {
      if (disposed || run || !cat || !S.inChamber(cat.x, cat.z)) return null;
      runIdx = S.nextTune(songs(), plays);
      run = S.newRun(S.TUNES[runIdx]);
      clearHeld();
      say('crystal-song-listen', phrase('crystal.wc.song.listen'));
      return 'song';
    },
    credit(ev) {
      if (disposed || ev?.kind !== 'wc-song' || !Number.isInteger(ev.tune) || ev.tune < 0 || ev.tune >= S.TUNE_COUNT) return null;
      const before = songs();
      if (S.learned(before, ev.tune)) return null;
      const after = S.learn(before, ev.tune);
      setSongs(after);
      say('crystal-song-partner', phrase('crystal.wc.song.partner'));
      if (reached(before, after)) { flourish(); page(); } else ghost(ev.tune);
      return 'song';
    },
    update(dt, t, catPos) {
      if (disposed) return;
      const d = dt > 0 ? Math.min(dt, 1) : 0;
      clock += d;
      cueClock += d;
      if (catPos) cat = catPos;
      // she steps onto a pad (hopping over one does not count)
      if (cat) {
        const onFloor = !Number.isFinite(cat.y) || cat.y - crystalY(cat.x, cat.z) < 0.4;
        const pad = onFloor ? S.padAt(cat.x, cat.z) : -1;
        if (pad !== lastPad) {
          lastPad = pad;
          if (pad >= 0) { note(pad, 0.035); if (run) handle(S.stepPad(run, pad)); }
        }
        if (run && !S.inChamber(cat.x, cat.z, S.LEAVE_R)) { run = null; clearHeld(); } // walked away: the tune is let go, nothing saved
      }
      if (run) handle(S.advance(run, d));
      // the cues that are due
      if (cues.length) {
        const due = cues.filter((c) => c.at <= cueClock);
        if (due.length) {
          cues = cues.filter((c) => c.at > cueClock);
          for (const c of due) {
            if (c.pad < 0) { for (let i = 0; i < S.PAD_COUNT; i++) lit[i] = BLOOM_HOLD; continue; }
            if (c.vol > 0) tone(audio, c.pad, c.vol);
            if (c.vis) light(c.pad);
          }
        }
      }
      for (let i = 0; i < S.PAD_COUNT; i++) if (lit[i] > 0) lit[i] = Math.max(0, lit[i] - d);
      // the pads' glow: up at once, down softly (reduced motion: straight to the level)
      let dirty = false;
      for (let i = 0; i < S.PAD_COUNT; i++) {
        const want = levelFor(i, clock);
        disp[i] = reducedMotion || want >= disp[i] ? want : disp[i] + (want - disp[i]) * Math.min(1, d * 5);
        if (Math.abs(disp[i] - painted[i]) > 0.004) dirty = true;
      }
      if (dirty) { drawn.paint(disp); for (let i = 0; i < S.PAD_COUNT; i++) painted[i] = disp[i]; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      run = null;
      for (const m of drawn.meshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
