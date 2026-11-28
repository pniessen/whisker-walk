// =============================================================================
// THE CRYSTAL CAVE: MOODS, DRAFTS AND SONGS (beauty pass 6). Weather for a place with no sky, all drawing and sound, nothing solid, nothing she must do, her pace never touched:
//   * a six-minute MOOD CYCLE, each mood ninety seconds with a fifteen-second blend: calm (the cave as drawn), resonance (every crystal hums, colours deepen, the shafts glow),
//     aurora (colour bands ripple over the dome and through the glow), deep dream (dim and quiet, glows intense, spore-motes drift up). A pure function of the walk's clock.
//   * CAVE DRAFTS: a gentle wind that comes and goes; it sweeps the motes and mist (decor shader) and streams of pale points, with a soft whistle that follows its strength.
//     Now and then a drip echoes three times.
//   * SONGS: stand still six seconds by a hero crystal and it lights fully and sings a short phrase in its own colour (humNote), with a few motes spiralling up from it.
// One pooled Points and a patched dome material: no mesh, no light, no collider. Reduced motion: calm only, no drafts, no motes (the linger glow and song stay: they are colour and sound).
// LOW/LITE: fewer points. Muted: no node is made. Draws no random number.
// =============================================================================

import * as THREE from 'three';
import { dotTexture } from './crystalparts.js';
import { planBeauty2, ZONE_RGB } from './crystaldecor.js';
import { crystalY } from './crystalplan.js';
import { humNote } from './crystallife.js';
import { HUE_PITCH } from './crystalsound.js';

export const MOOD = Object.freeze({ len: 90, fade: 15, count: 4 });
export const SONG = Object.freeze({ still: 6, speed: 0.3, gap: 14, phrase: Object.freeze([1, 1.25, 1.5, 2, 1.5]), step: 0.5, rise: 2.2 });
const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
// [calm, resonance, aurora, dream] weights (they sum to 1) at the walk's clock t
export function moodAt(t) {
  const u = ((t % (MOOD.len * MOOD.count)) + MOOD.len * MOOD.count) % (MOOD.len * MOOD.count); const i = Math.floor(u / MOOD.len); const k = sm(MOOD.len - MOOD.fade, MOOD.len, u - i * MOOD.len);
  const w = [0, 0, 0, 0]; w[i] = 1 - k; w[(i + 1) % MOOD.count] = k; return w;
}
// the draft: s 0..1 (gusts come about once a minute), ang its heading in radians
export const windAt = (t) => ({ s: sm(0.25, 0.85, 0.5 + 0.5 * Math.sin(t * 0.11 + Math.sin(t * 0.031) * 2)), ang: 0.6 + t * 0.013 + Math.sin(t * 0.05) });
export const heroSites = () => planBeauty2('high').hero;

// createCrystalMood({ scene, decor, audio, tier, reducedMotion }) -> { update(dt, t, catPos), songs, state, dispose() }
export function createCrystalMood({ scene, decor = null, audio = null, tier = null, reducedMotion = false }) {
  const low = !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3);
  const U = decor?.uniforms; const heroes = heroSites();
  const uM = { value: new THREE.Vector4(0, 0, 0, 0) }; // the dome's: aurora, clock, dream, resonance
  const gm = scene.getObjectByName('crystal:ground')?.material; const dome = scene.getObjectByName('crystal:dome'); const dm = dome?.material;
  if (dm) {
    dm.customProgramCacheKey = () => 'crystalDome6';
    dm.onBeforeCompile = (sh) => {
      sh.uniforms.uM = uM;
      sh.vertexShader = `varying vec3 vWp;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWp = position;');
      sh.fragmentShader = `uniform vec4 uM;\nvarying vec3 vWp;\n${sh.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
        float an = atan(vWp.z, vWp.x); float ph = vWp.y * 0.5 + sin(an * 3.0 + uM.y * 0.35) * 1.3 + sin(an * 5.0 - uM.y * 0.2) * 0.6 - uM.y * 0.28;
        float bd = pow(0.5 + 0.5 * sin(ph * 1.7), 2.0) * smoothstep(0.5, 4.0, vWp.y);
        diffuseColor.rgb = diffuseColor.rgb * (1.0 - 0.5 * uM.z) + (0.5 + 0.5 * cos(6.2832 * (ph * 0.16 + vec3(0.0, 0.33, 0.67)))) * bd * uM.x * 0.9 + vec3(0.16, 0.05, 0.26) * uM.w;`);
    };
    dm.needsUpdate = true;
  }
  // the drifting points: streaks in a draft, spores in the dream, and a few that spiral from a crystal she is singing to
  const nSong = reducedMotion ? 0 : 8; const nFlow = reducedMotion ? 0 : (low ? 16 : 36); const N = nFlow + nSong;
  const pos = new Float32Array(Math.max(1, N) * 3).fill(-999); const col = new Float32Array(Math.max(1, N) * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.02, size: 0.16, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
  points.name = 'crystal:drift'; points.frustumCulled = false; points.visible = false; Object.assign(points.userData, { noCast: true, noContactShadow: true, noMerge: true });
  if (N) scene.add(points);
  const fogN = scene.fog?.near ?? 5; const fogF = scene.fog?.far ?? 38; const lights = []; scene.traverse((o) => { if (o.isLight) lights.push([o, o.intensity]); }); const envBase = scene.environmentIntensity ?? 0;
  const BOX = 16; let ox = 0; let oy = 0; let oz = 0;
  let still = 0; let last = null; let on = -1; let sungAt = -1e9; let clock = 0; let ling = 0; let lingAt = null; let songs = 0; let broken = false; let state = { mood: [1, 0, 0, 0], wind: 0, ling: 0 };
  // sound: a resonance hum, the draft's whistle, a drip chain now and then; no node while muted
  let snd = null; let chain = -1;
  const muted = () => !audio || typeof audio.getContext !== 'function' || !!audio.isMuted?.();
  function stopSnd() { if (!snd) return; const { ac, os } = snd; snd = null; try { for (const o of os) o.stop(ac.currentTime + 0.4); } catch { /* closed */ } }
  function sound(w, wd, t) {
    if (broken || reducedMotion) return;
    if (muted()) { stopSnd(); return; }
    try {
      const ac = audio.getContext(); if (!ac) return; const dest = audio.getMaster?.() ?? ac.destination; const now = ac.currentTime;
      if (!snd && (w[1] > 0.03 || wd.s > 0.05)) {
        const hg = ac.createGain(); hg.gain.value = 0; const wg = ac.createGain(); wg.gain.value = 0; hg.connect(dest); wg.connect(dest);
        const os = [196, 294.3].map((f) => { const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(hg); o.start(); return o; });
        const wo = ac.createOscillator(); wo.type = 'sine'; wo.frequency.value = 400; wo.connect(wg); wo.start(); os.push(wo);
        snd = { ac, hg, wg, wo, os };
      }
      if (snd) { snd.hg.gain.setTargetAtTime(0.007 * w[1], now, 0.8); snd.wg.gain.setTargetAtTime(0.0045 * wd.s * wd.s, now, 0.5); snd.wo.frequency.setTargetAtTime(330 + 330 * wd.s + 30 * Math.sin(t * 0.9), now, 0.4); }
      const slot = Math.floor(t / 37); // an occasional drip that echoes three times, quieter each time
      if (slot !== chain && t - slot * 37 > 18) { chain = slot; if (hash(slot, 7) > 0.35) for (let i = 0; i < 3; i++) humNote(audio, 2, 2.0, i * 0.3, { level: 0.1 * (1 - i * 0.3) }); }
    } catch { broken = true; snd = null; }
  }
  function sing(h, idx) {
    if (clock - sungAt < SONG.gap) return; sungAt = clock;
    try { let any = false; SONG.phrase.forEach((r, i) => { if (humNote(audio, (idx + i) % 3, (HUE_PITCH[h.hue] ?? 1) * r, i * SONG.step, { level: 0.8 })) any = true; }); if (any) songs++; } catch { broken = true; }
  }
  return {
    points,
    get songs() { return songs; },
    get state() { return state; },
    update(dt, t, catPos) {
      dt = Math.max(0, Math.min(dt, 0.25)) || 0; clock += dt;
      // the linger: still for SONG.still seconds beside a hero crystal
      if (catPos) {
        if (last && dt > 0) { if (Math.hypot(catPos.x - last.x, catPos.z - last.z) / dt > SONG.speed) { still = 0; on = -1; } else still += dt; }
        last = { x: catPos.x, z: catPos.z };
        if (still >= SONG.still && on < 0) {
          let bi = -1; let bd = 1e9; heroes.forEach((h, i) => { const d = Math.hypot(catPos.x - h.x, catPos.z - h.z); if (d < h.s * 0.55 + 2.4 && d < bd) { bd = d; bi = i; } });
          if (bi >= 0) { on = bi; lingAt = heroes[bi]; sing(lingAt, bi); }
        }
      }
      ling = reducedMotion ? (on >= 0 ? 1 : 0) : on >= 0 ? Math.min(1, ling + dt / 1.2) : Math.max(0, ling - dt / 2.5);
      const w = reducedMotion ? [1, 0, 0, 0] : moodAt(t); const wd = reducedMotion ? { s: 0, ang: 0 } : windAt(t);
      state = { mood: w, wind: wd.s, ling };
      uM.value.set(w[2], t, w[3], w[1]);
      if (U) { U.mood.value.set(w[1], w[2], w[3], wd.s); U.ling.value.set(lingAt?.x ?? 0, lingAt?.z ?? 0, ling, wd.ang); }
      if (!reducedMotion) {
        if (scene.fog) { scene.fog.color.multiplyScalar(1 - 0.6 * w[3] - 0.08 * w[1]); scene.fog.near = fogN * (1 - 0.5 * w[3]); scene.fog.far = fogF * (1 - 0.4 * w[3]); } // (after the colour grade has set it this frame): the dream closes in and darkens
        for (const [l, b] of lights) l.intensity = b * (1 - 0.6 * w[3]); scene.environmentIntensity = envBase * (1 - 0.6 * w[3]); gm?.color.setScalar(1 - 0.45 * w[3]); // dim ambient
        sound(w, wd, t);
        if (N && catPos) {
          points.visible = true;
          const sp = 1.2 + 5 * wd.s; ox += Math.cos(wd.ang) * sp * dt; oz += Math.sin(wd.ang) * sp * dt; oy += 0.3 * dt;
          const wv = wd.s; const dv = w[3];
          for (let i = 0; i < nFlow; i++) {
            const s = i >> 2; const k = i & 3; const tl = k * 0.45 * wv;
            const ux = (((hash(s, 1) * BOX + ox - Math.cos(wd.ang) * tl) % BOX) + BOX) % BOX; const uz = (((hash(s, 2) * BOX + oz - Math.sin(wd.ang) * tl) % BOX) + BOX) % BOX;
            const x = catPos.x + ux - BOX / 2; const z = catPos.z + uz - BOX / 2; const e = Math.sin(Math.PI * ux / BOX) * Math.sin(Math.PI * uz / BOX);
            const y = crystalY(x, z) + 0.5 + ((hash(s, 3) * 2.8 + oy * dv * 3) % 2.8) * (0.4 + 0.6 * dv) + 0.5 * wv * hash(s, 3) + 0.2 * Math.sin(t * 0.8 + i);
            const a = wv * (1 - k * 0.27) * 0.5; const b = dv * (0.55 + 0.35 * Math.sin(t * 1.3 + i * 1.7)); const tealy = i % 2;
            pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
            col[i * 3] = (0.6 * a + (tealy ? 0.3 : 0.7) * b) * e; col[i * 3 + 1] = (0.75 * a + (tealy ? 0.9 : 0.4) * b) * e; col[i * 3 + 2] = (0.9 * a + 0.95 * b) * e;
          }
          for (let i = 0; i < nSong; i++) { // the song's motes: a rising spiral round the lit crystal
            const j = nFlow + i; const h = lingAt; const g = h ? ling : 0;
            if (!h || g < 0.02) { pos[j * 3 + 1] = -999; col[j * 3] = col[j * 3 + 1] = col[j * 3 + 2] = 0; continue; }
            const a = t * 1.5 + i * 0.785; const r = h.s * 0.5 + 0.7; const u = (t * 0.4 + i / nSong) % 1; const rgb = ZONE_RGB[h.hue] ?? [1, 1, 1];
            pos[j * 3] = h.x + Math.cos(a) * r; pos[j * 3 + 1] = crystalY(h.x, h.z) + 0.3 + u * SONG.rise * 1.5; pos[j * 3 + 2] = h.z + Math.sin(a) * r;
            const f = g * Math.sin(u * 3.1416); col[j * 3] = (rgb[0] * 0.6 + 0.4) * f; col[j * 3 + 1] = (rgb[1] * 0.6 + 0.4) * f; col[j * 3 + 2] = (rgb[2] * 0.6 + 0.4) * f;
          }
          geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
        }
      }
    },
    dispose() { stopSnd(); if (scene.fog) { scene.fog.near = fogN; scene.fog.far = fogF; } scene.remove(points); geo.dispose(); points.material.dispose(); for (const [l, b] of lights) l.intensity = b; scene.environmentIntensity = envBase; gm?.color.setScalar(1); if (dm) { dm.onBeforeCompile = () => {}; dm.needsUpdate = true; } },
  };
}
