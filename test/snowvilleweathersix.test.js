import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const W = await import('../src/world/snowvilleweather.js');
const { createSnowvilleLight } = await import('../src/world/snowvillelight.js');

const at = (h) => new Date(2026, 11, 5, h, 0);
const cam = () => { const c = new THREE.PerspectiveCamera(); c.position.set(0, 3, 14); c.lookAt(0, 1, 5); c.updateMatrixWorld(); return c; };
const lit = (o) => Array.from(o.geometry.attributes.aS.array).filter((v) => v > 0).length;
const rig = () => { const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xe8e0ea, 22, 120); const sun = new THREE.DirectionalLight(0xffffff, 2); const fill = new THREE.HemisphereLight(0x8d8c93, 0x445566, 0.6); return { scene, sun, fill }; };
const named = (scene, n) => scene.children.find((o) => o.name === n);

describe('snowville beauty pass 6: weather and atmosphere as events', () => {
  it('the hour of the day: night, morning and midday weights are pure and smooth', () => {
    expect(W.nightAt(23)).toBe(1); expect(W.nightAt(2)).toBe(1); expect(W.nightAt(12)).toBe(0); expect(W.nightAt(20)).toBeGreaterThan(0); expect(W.nightAt(20)).toBeLessThan(1);
    expect(W.morningAt(8)).toBe(1); expect(W.morningAt(13)).toBe(0); expect(W.morningAt(3)).toBe(0);
    expect(W.hourOf(23.5, 3600)).toBeCloseTo(0.5, 5);
    expect(W.envAt(0, 80)).toBe(0); expect(W.envAt(40, 80)).toBe(1); expect(W.envAt(80, 80)).toBe(0);
    expect([0, 1, 2, 3].map(W.eventKind)).toEqual(['blizzard', 'blizzard', 'blizzard', 'hush']);
    const n = W.weatherAt(13); expect(n.bg).toBe(1); expect(n.sun).toBe(1); expect(n.far).toBe(1); expect(n.glow).toBe(1);
    const b = W.weatherAt(13, 'blizzard', 1); expect(b.far).toBeLessThan(0.6); expect(b.near * 22).toBeGreaterThan(10); expect(b.glow).toBeGreaterThan(1.5);
  });
  it('midday with no event draws and changes nothing; dispose puts everything back', () => {
    const { scene, sun, fill } = rig(); const w = W.createWeather({ scene, sun, fill, now: at(13) });
    expect(scene.children.filter((o) => o.isPoints).map((o) => o.name).sort()).toEqual(['snowville:sparkle', 'snowville:weather']);
    for (const o of scene.children) { expect(o.userData.noCast).toBe(true); expect(o.isMesh).toBeFalsy(); }
    w.update(0.1, 5, { x: -2, y: 0, z: 12 }, cam());
    expect(scene.fog.far).toBe(120); expect(sun.intensity).toBe(2); expect(scene.children.every((o) => !o.visible)).toBe(true);
    w.state.h0 = 22; w.update(0.1, 6, { x: -2, y: 0, z: 12 }, cam());
    expect(scene.fog.far).toBeLessThan(120); expect(sun.intensity).toBeLessThan(1); expect(scene.backgroundIntensity).toBeLessThan(0.5);
    w.dispose(); expect(scene.fog.far).toBe(120); expect(scene.fog.near).toBe(22); expect(sun.intensity).toBeCloseTo(2, 6); expect(fill.intensity).toBeCloseTo(0.6, 6); expect(scene.backgroundIntensity).toBeCloseTo(1, 6);
    expect(fill.color.getHex()).toBe(0x8d8c93); expect(scene.children).toHaveLength(0);
  });
  it('a frosty night draws stars, the moon and sparkle; a morning thaw draws steam, drips and shine', () => {
    const { scene, sun, fill } = rig(); const night = W.createWeather({ scene, sun, fill, now: at(23) });
    night.update(0.1, 3, { x: -2, y: 0, z: 12 }, cam());
    const sp = named(scene, 'snowville:sparkle'); expect(lit(sp)).toBeGreaterThan(80); expect(sp.visible).toBe(true);
    night.dispose();
    const s2 = rig(); const morn = W.createWeather({ scene: s2.scene, sun: s2.sun, fill: s2.fill, now: at(8) });
    morn.update(0.1, 3, { x: -2, y: 0, z: 12 }, cam());
    expect(lit(named(s2.scene, 'snowville:weather'))).toBeGreaterThan(30); expect(s2.sun.intensity).toBeGreaterThan(2); expect(s2.scene.fog.far).toBeGreaterThan(120);
    morn.dispose();
  });
  it('the events: a blizzard thickens the air but keeps the fog back; a hush ducks the sound and rings one bell', () => {
    const { scene, sun } = rig(); const gain = { value: 0.8 }; const osc = [];
    const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({ connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), type: '' });
    const ac = { currentTime: 0, destination: {}, createGain: node, createOscillator: () => { const o = node(); osc.push(o); return o; } };
    const audio = { isMuted: () => false, getContext: () => ac, getMaster: () => ({ gain }) };
    const w = W.createWeather({ scene, sun, audio, now: at(13) }); w.state.next = 1e9;
    const c = cam(); const p = { x: -2, y: 0, z: 12 };
    expect(w.trigger('blizzard')).toBe(true);
    let t = 10; let clinks = 0; for (let i = 0; i < 900; i++) { t += 0.1; ac.currentTime = t; w.update(0.1, t, p, c); if (i === 300) { expect(lit(named(scene, 'snowville:weather'))).toBeGreaterThan(200); expect(scene.fog.near).toBeGreaterThan(8); expect(w.glow).toBeGreaterThan(1.5); } }
    clinks = osc.length; expect(clinks).toBeGreaterThan(0); expect(w.state.kind).toBe(null); expect(scene.fog.far).toBe(120);
    expect(w.trigger('hush')).toBe(true); let low = 1; let bell = 0;
    for (let i = 0; i < 300; i++) { t += 0.1; ac.currentTime = t; w.update(0.1, t, p, c); low = Math.min(low, gain.value); if (i === 200) bell = osc.length; }
    expect(low).toBeLessThan(0.4); expect(bell - clinks).toBeGreaterThanOrEqual(3); // (the bell's three partials)
    for (let i = 0; i < 400; i++) { t += 0.1; w.update(0.1, t, p, c); }
    expect(gain.value).toBeCloseTo(0.8, 5); expect(w.state.last).toBe('hush');
    w.dispose();
  });
  it('the schedule: nothing before the first, then every fourth event is a hush; muted asks for no audio context', () => {
    const { scene, sun } = rig(); let asked = 0; const audio = { isMuted: () => true, getContext: () => { asked++; return {}; }, getMaster: () => null };
    const w = W.createWeather({ scene, sun, audio, now: at(13) }); const c = cam(); const p = { x: 0, y: 0, z: 30 };
    for (let t = 1; t < W.EVENTS.first; t += 2) w.update(2, t, p, c); expect(w.state.kind).toBe(null);
    const kinds = []; let was = null;
    for (let t = W.EVENTS.first; t < 6000; t += 1) { w.update(1, t, p, c); if (w.state.kind && w.state.kind !== was) kinds.push(w.state.kind); was = w.state.kind; }
    expect(kinds.length).toBeGreaterThanOrEqual(6); expect(kinds.slice(0, 4)).toEqual(['blizzard', 'blizzard', 'blizzard', 'hush']); expect(asked).toBe(0);
    w.dispose();
  });
  it('reduced motion: the hour looks the same but still, and no event ever starts; lite draws fewer dots', () => {
    const a = rig(); const w = W.createWeather({ scene: a.scene, sun: a.sun, fill: a.fill, reducedMotion: true, now: at(23) });
    expect(w.trigger('blizzard')).toBe(false); w.update(0.1, 400, { x: 0, y: 0, z: 30 }, cam()); const s1 = Array.from(named(a.scene, 'snowville:sparkle').geometry.attributes.color.array);
    w.update(0.1, 900, { x: 0, y: 0, z: 30 }, cam()); expect(Array.from(named(a.scene, 'snowville:sparkle').geometry.attributes.color.array)).toEqual(s1); expect(w.state.kind).toBe(null);
    w.dispose();
    const b = rig(); const hi = W.createWeather({ scene: b.scene, now: at(23) }); const c = rig(); const lo = W.createWeather({ scene: c.scene, low: true, now: at(23) });
    expect(named(c.scene, 'snowville:sparkle').geometry.attributes.aS.count).toBeLessThan(named(b.scene, 'snowville:sparkle').geometry.attributes.aS.count); hi.dispose(); lo.dispose();
  });
  it('the light wires it in: the halos glow stronger in the blizzard, a clear night calls the aurora, everything goes on dispose', () => {
    const { scene, sun, fill } = rig(); const l = createSnowvilleLight({ scene, sun, fill, now: at(23) });
    const c = cam(); for (let i = 0; i < 400; i++) l.update(0.1, 20 + i * 0.1, { x: -2, y: 0, z: 12 }, c);
    expect(l.weather.night).toBeGreaterThan(0.9); expect(l.wonder.state.events).toBeGreaterThan(0);
    const before = scene.children.length; l.dispose(); expect(scene.children.length).toBeLessThan(before); expect(scene.children.filter((o) => o.name.startsWith('snowville:weather') || o.name === 'snowville:sparkle')).toHaveLength(0);
  });
});
