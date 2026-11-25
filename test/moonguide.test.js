// The Moon's written guide (guide cues), the pure part (src/world/moonguide.js): the goal line's words at every stage in both word sets, the compass word from the plan's own
// coordinates (+x east, -z north), the words beside Pip's picture, the edge arrow's geometry against a real camera's projection, and what the files may and may not do.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as P from '../src/world/moonplan.js';
import * as M from '../src/world/moonmission.js';
import * as J from '../src/world/moonjob.js';
import { phrase } from '../src/clanphrases.js';
import '../src/world/moonwords.js';
import { LINES } from '../src/world/moonwords.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { compassKey, atWords, goalWords, chipWords, round5, makeView, viewOf, makeArrow, arrowFor, edgePoint, projectPoint, ARRIVED, NEAR_LANDER } from '../src/world/moonguide.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const pt = (p) => ({ x: p.x, z: p.z });
const gp = (g, p) => ({ g, x: p.x, z: p.z, y: 0 });
const rampMouth = P.rampPoint(0.04, 0);
const HILL = { x: P.STAR_HILL.x, z: P.STAR_HILL.z };

describe('where: a compass word from the plan\'s own coordinates', () => {
  it('+x is east and -z is north (the spawn looks north from behind the lander)', () => {
    expect(compassKey(0, -10)).toBe('n');
    expect(compassKey(10, 0)).toBe('e');
    expect(compassKey(0, 10)).toBe('s');
    expect(compassKey(-10, 0)).toBe('w');
    expect(compassKey(10, -10)).toBe('ne');
    expect(compassKey(-10, -10)).toBe('nw');
    expect(compassKey(10, 10)).toBe('se');
    expect(compassKey(-10, 10)).toBe('sw');
  });
  it('the named places of the story, from the lander, say what a child walking sees', () => {
    const AT = (p) => atWords(p.x, p.z);
    expect(AT(P.RIDGE_CELL)).toBe('north of the lander'); // the tall rocks: far ahead of the spawn
    expect(AT(P.ROVER_CELL)).toBe('north-east of the lander'); // the far beacon
    expect(AT(P.CORE)).toMatch(/^west|^north-west/); // the dome
    expect(AT(P.DEPOT)).toBe('east of the lander');
    expect(AT(P.STAR_HILL)).toBe('north-west of the lander');
    expect(AT(P.ROCKET_SLOT)).toBe('north-east of the lander');
    expect(AT(P.LAUNCH_DESK)).toBe('north-east of the lander');
    expect(AT(P.ROCK_LEDGES[0])).toBe('north of the lander');
    expect(AT(P.MOUTH_FRONT)).toBe('north-west of the lander');
    expect(AT(P.JUMP_LANE.z ? { x: P.JUMP_LANE.x0, z: P.JUMP_LANE.z } : P.LANDER)).toBe('north of the lander');
    expect(AT({ x: P.LANDER.x + 3, z: P.LANDER.z + 4 })).toBe('close to the lander');
    expect(NEAR_LANDER).toBeGreaterThan(8);
  });
  it('the words agree with the bearing a ruler would give: a point 60 m away in each of eight ways', () => {
    for (const [dx, dz, w] of [[0, -60, 'north'], [42, -42, 'north-east'], [60, 0, 'east'], [42, 42, 'south-east'], [0, 60, 'south'], [-42, 42, 'south-west'], [-60, 0, 'west'], [-42, -42, 'north-west']]) {
      expect(atWords(P.LANDER.x + dx, P.LANDER.z + dz)).toBe(`${w} of the lander`);
    }
  });
  it('round5 rounds metres to the nearest five', () => {
    expect([0, 1, 2.4, 2.6, 7, 12, 38, 41, 43.5, 999].map(round5)).toEqual([0, 0, 0, 5, 5, 10, 40, 40, 45, 1000]);
    expect(round5(NaN)).toBe(0);
    expect(round5(-5)).toBe(0);
  });
});

// each stage of the story, as the goal the base looks at and the save's record
const rec = (step, cells, extra = {}) => ({ record: M.normalize({ step, cells }), scope: 0, ...extra });
const STAGES = [
  ['Pip asleep', { goal: gp({ kind: 'pip' }, P.PIP_SLEEP), ...rec(0, 0) }, /Wake Pip/],
  ['the Ridge cell, none in', { goal: gp({ kind: 'cell', cell: 0 }, P.RIDGE_CELL), ...rec(1, 0) }, /Find a power cell \(0 of 2\): on the tall rocks, north of the lander\./],
  ['the Rover cell, one in', { goal: gp({ kind: 'cell', cell: 1 }, P.ROVER_CELL), ...rec(2, 1) }, /\(1 of 2\): at the far beacon, north-east of the lander\./],
  ['a cell in her mouth', { goal: gp({ kind: 'core', cell: 0 }, P.CORE), ...rec(1, 0) }, /Take the power cell to the Core in the dome, (west|north-west) of the lander\./],
  ['both in, the beat not seen', { goal: gp({ kind: 'done' }, { x: P.BOARD.x + 1.6, z: P.BOARD.z }), ...rec(3, 3) }, /Both power cells are in! Go to the dome/],
  ['the base awake: Star Hill, nothing traced', { goal: gp({ kind: 'scope' }, rampMouth), ...rec(4, 3) }, /Climb Star Hill, north-west of the lander\. Join the stars: Mouse, then Cat\./],
  ['the Mouse traced', { goal: gp({ kind: 'scope' }, rampMouth), ...rec(4, 3), scope: 1 }, /Climb Star Hill, .* Now join the Cat stars\./],
  ['the Cat traced', { goal: gp({ kind: 'scope' }, rampMouth), ...rec(4, 3), scope: 2 }, /Now join the Mouse stars\./],
  ['on the hill', { goal: gp({ kind: 'scope' }, HILL), ...rec(4, 3) }, /The telescope is at the top of the hill\. Join the/],
  ['Earth found: the Message Desk', { goal: gp({ kind: 'desk' }, P.MESSAGE_DESK), ...rec(5, 3) }, /Write a postcard at the Message Desk in the dome, /],
  ['the postcard in her mouth', { goal: gp({ kind: 'rocket' }, P.ROCKET_SLOT), ...rec(5, 3) }, /Take the postcard to the rocket and post it, north-east of the lander\./],
  ['the postcard in the rocket', { goal: gp({ kind: 'button' }, P.LAUNCH_DESK), ...rec(6, 3) }, /Press the big red button at the launch desk, north-east of the lander\./],
  ['sent: wait for the reply', { goal: gp({ kind: 'reply' }, P.ROCK_LEDGES[0]), ...rec(7, 3) }, /Wait on Earthrise Rock, north of the lander\. Earth will answer!/],
  ['the cave', { goal: gp({ kind: 'cave' }, P.MOUTH_FRONT), ...rec(8, 3) }, /A glowing cell waits in the cave, north-west of the lander\./],
  ['in the tunnel', { goal: gp({ kind: 'cave' }, P.DEEP_CELL), ...rec(8, 3) }, /Follow the tunnel to the glowing cell\./],
  ['the Deep Cell in her mouth', { goal: gp({ kind: 'core', cell: M.DEEP }, P.CORE), ...rec(8, 3) }, /Take the Deep Cell to the Core in the dome, /],
  ['everything done', { goal: gp({ kind: 'done' }, { x: P.BOARD.x + 1.6, z: P.BOARD.z }), ...rec(8, 7) }, /The base is awake! Look around/],
];
const JOBS = [
  ['pebbles, none', { kind: 'pebbles', taken: 0 }, /Pip needs glowing pebbles \(0 of 3\)\. Look /, P.PEBBLES[0]],
  ['pebbles, three', { kind: 'pebbles', taken: 3 }, /Put the pebbles in Pip’s tray, /, J.SAMPLE_TRAY],
  ['rounds, on foot', { kind: 'rounds', next: 0 }, /Hop in Dot at the depot, east of the lander\. Drive past the lit posts\./, P.DOT_PARK],
  ['rounds, driving', { kind: 'rounds', next: 2 }, /Drive Dot past the lit posts in order \(2 of 5\)\./, J.ROUND_POSTS[2], true],
  ['guest, far', { kind: 'guest' }, /Climb Star Hill, north-west of the lander\. Trace the new star picture\./, rampMouth],
  ['guest, on the hill', { kind: 'guest' }, /The telescope is at the top of the hill\. Trace the new star picture\./, HILL],
  ['bound', { kind: 'bound' }, /Jump farther than your best on the hop lane, north of the lander\./, { x: P.JUMP_LANE.x0, z: P.JUMP_LANE.z }],
  ['rocket 0', { kind: 'rocket', stage: 0 }, /Write another postcard at the Message Desk, /, P.MESSAGE_DESK],
  ['rocket 1', { kind: 'rocket', stage: 1 }, /Post the new postcard in the rocket, north-east of the lander\./, P.ROCKET_SLOT],
  ['rocket 2', { kind: 'rocket', stage: 2 }, /Press the big red button at the launch desk, /, P.LAUNCH_DESK],
  ['glove', { kind: 'glove', glove: 'home' }, /Earth lost a glove\. Find it, /, J.GLOVE_SPOTS[0]],
  ['glove carried', { kind: 'glove', glove: 'carried' }, /Take the glove to Pip\./, P.PIP_SLEEP],
];
const jobInfo = (job, p, riding = false) => ({ goal: gp({ kind: 'job', icon: '?' }, p), ...rec(8, 3), job, riding });

describe('the goal line: WHAT and WHERE at every stage, in both word sets', () => {
  it('says each stage the way a 9 year old reads it (Clan set)', () => {
    for (const [name, info, re] of STAGES) expect(goalWords(info), name).toMatch(re);
    for (const [name, job, re, p, riding] of JOBS) expect(goalWords(jobInfo(job, p, riding)), name).toMatch(re);
  });
  it('reads the same in the everyday set but for the one Silverpelt line, with no series word anywhere', () => {
    const clan = STAGES.map(([, info]) => goalWords(info));
    withOffWords(() => {
      STAGES.forEach(([name, info, re], i) => {
        const w = goalWords(info);
        expect(w, name).toMatch(re);
        expect(bannedIn(w), name).toBeNull();
        expect(w).not.toMatch(/Silverpelt/);
        if (!/Silverpelt/.test(clan[i])) expect(w, name).toBe(clan[i]);
      });
      for (const [name, job, , p, riding] of JOBS) expect(bannedIn(goalWords(jobInfo(job, p, riding))), name).toBeNull();
    });
    expect(clan.filter((w) => /Silverpelt/.test(w)).length).toBeGreaterThan(0);
  });
  it('nothing to say means nothing: no goal, an unknown kind, a job with no kind, the story told and the cave done', () => {
    expect(goalWords(null)).toBe('');
    expect(goalWords({ goal: null })).toBe('');
    expect(goalWords({ goal: gp({ kind: 'nonsense' }, P.CORE), ...rec(4, 3) })).toBe('');
    expect(goalWords(jobInfo({}, P.CORE))).toBe('');
  });
  it('is never longer than the lazy-line limit, and short enough for two lines on a phone beside the map (76 characters), whichever way the compass points', () => {
    const dirs = ['north of', 'north-east of', 'east of', 'south-east of', 'south of', 'south-west of', 'west of', 'north-west of'].map((d, i) => [Math.sin((i * Math.PI) / 4) * 60, -Math.cos((i * Math.PI) / 4) * 60]);
    const all = (fn) => { for (const [dx, dz] of dirs) fn({ x: P.LANDER.x + dx, z: P.LANDER.z + dz }); fn({ x: P.LANDER.x + 2, z: P.LANDER.z + 2 }); };
    const check = () => {
      const lens = [];
      all((p) => {
        for (const [, info] of STAGES) lens.push(goalWords({ ...info, goal: { ...info.goal, x: p.x, z: p.z } }).length);
        for (const [, job, , , riding] of JOBS) lens.push(goalWords(jobInfo(job, p, riding)).length);
      });
      return Math.max(...lens);
    };
    expect(check()).toBeLessThanOrEqual(76);
    withOffWords(() => expect(check()).toBeLessThanOrEqual(76));
  });
  it('every line of the guide is in the lazy table and used, short, free of scolding and of banned words', () => {
    const used = new Set([...read('src/world/moonguide.js').matchAll(/phrase\('(moon\.(?:guide|chip)\.[a-z0-9.]+)'\)/g)].map((m) => m[1]));
    const defined = Object.keys(LINES).filter((k) => /^moon\.(guide|chip)\./.test(k));
    expect([...used].sort()).toEqual(defined.sort()); // none unused, none missing
    for (const id of defined) {
      expect(phrase(id).length, id).toBeLessThanOrEqual(90);
      expect(phrase(id), id).not.toMatch(/\b(drown|die|dead|scared|scary|dark|hurt|danger|afraid|lost forever|too late|hurry|fail)\b/i);
    }
    withOffWords(() => { for (const id of defined) expect(bannedIn(phrase(id)), id).toBeNull(); });
    expect(defined.length).toBe(36);
  });
});

describe('the words beside Pip\'s picture', () => {
  it('say what the picture means', () => {
    const w = (kind, extra) => chipWords({ kind, ...extra }, extra?.job);
    expect(w('cell')).toBe('Pip needs a power cell');
    expect(w('scope')).toBe('Pip wants to look at Earth');
    expect(w('desk')).toBe('Time to send a postcard');
    expect(w('pip')).toMatch(/Wake him/);
    expect(w('core')).toMatch(/Core/);
    expect(w('rocket')).toMatch(/rocket/);
    expect(w('button')).toMatch(/red button/);
    expect(w('reply')).toMatch(/answer/);
    expect(w('cave')).toMatch(/glowing cell/);
    expect(w('done')).toMatch(/awake/);
    for (const kind of J.JOB_KINDS) expect(chipWords({ kind: 'job' }, kind), kind).toMatch(/\S/);
    expect(chipWords({ kind: 'job' }, 'nonsense')).toBe('');
    expect(chipWords(null)).toBe('');
    expect(chipWords({ kind: 'nonsense' })).toBe('');
  });
  it('the cave and the pebbles share a picture (a gem) but not their words: the chip reads the goal, not the picture', () => {
    expect(chipWords({ kind: 'cave', icon: '💎' })).not.toBe(chipWords({ kind: 'job', icon: '💎' }, 'pebbles'));
  });
  it('are short, clean, and the same in both sets', () => {
    const kinds = ['pip', 'cell', 'core', 'scope', 'desk', 'rocket', 'button', 'reply', 'cave', 'done'];
    const now = [...kinds.map((k) => chipWords({ kind: k })), ...J.JOB_KINDS.map((k) => chipWords({ kind: 'job' }, k))];
    withOffWords(() => {
      const off = [...kinds.map((k) => chipWords({ kind: k })), ...J.JOB_KINDS.map((k) => chipWords({ kind: 'job' }, k))];
      expect(off).toEqual(now);
      for (const w of off) { expect(w.length).toBeLessThanOrEqual(34); expect(bannedIn(w)).toBeNull(); }
    });
  });
});

describe('the edge arrow\'s geometry, against a real camera', () => {
  const cam = (x, y, z, yawDeg, { fov = 50, aspect = 16 / 9, pitchDeg = 0 } = {}) => {
    const c = new THREE.PerspectiveCamera(fov, aspect, 0.1, 500);
    c.position.set(x, y, z);
    c.rotation.set((pitchDeg * Math.PI) / 180, (yawDeg * Math.PI) / 180, 0, 'YXZ');
    c.updateMatrixWorld(true);
    return c;
  };
  const ndc = (c, p) => new THREE.Vector3(p.x, p.y, p.z).project(c);
  it('reads the same forward, right and up as the camera\'s own matrices, at any turn and tilt', () => {
    for (const yaw of [0, 33, 90, 170, -75, -180]) {
      for (const pitch of [0, -12, 20]) {
        const c = cam(3, 2.9, 44, yaw, { pitchDeg: pitch });
        const v = viewOf(c);
        const f = new THREE.Vector3(); c.getWorldDirection(f);
        expect(v.fx).toBeCloseTo(f.x, 6); expect(v.fy).toBeCloseTo(f.y, 6); expect(v.fz).toBeCloseTo(f.z, 6);
        const r = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion);
        expect(v.rx).toBeCloseTo(r.x, 6); expect(v.rz).toBeCloseTo(r.z, 6);
        const u = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);
        expect(v.uy).toBeCloseTo(u.y, 6);
      }
    }
  });
  it('"on screen" agrees with the real projection (inside 88 percent of the view) and the projected pixel agrees to a hair', () => {
    let on = 0; let off = 0;
    for (const yaw of [0, 40, -100, 180]) {
      const c = cam(0, 2.9, 45, yaw);
      const v = viewOf(c);
      const out = makeArrow();
      for (let i = 0; i < 400; i++) {
        const g = { x: -60 + ((i * 37) % 120), y: ((i * 7) % 9), z: -70 + ((i * 53) % 140) };
        arrowFor(v, { x: 0, z: 45 }, g, out);
        const n = ndc(c, g);
        const inFront = (g.x - v.x) * v.fx + (g.y - v.y) * v.fy + (g.z - v.z) * v.fz > 0.3;
        const inside = inFront && Math.abs(n.x) < 0.88 && Math.abs(n.y) < 0.88;
        // (the real projection's own `z < 1` is "in front"; ours asks for a hand's breadth ahead)
        if (Math.abs(Math.abs(n.x) - 0.88) > 0.02 && Math.abs(Math.abs(n.y) - 0.88) > 0.02) expect(out.onScreen, `${yaw} ${i}`).toBe(inside);
        inside ? on++ : off++;
        const p = projectPoint(v, g.x, g.y, g.z, 1000, 500);
        if (inFront) { expect(p.ok).toBe(true); expect(p.x).toBeCloseTo((n.x * 0.5 + 0.5) * 1000, 3); expect(p.y).toBeCloseTo((-n.y * 0.5 + 0.5) * 500, 3); } else expect(p.ok).toBe(false);
      }
    }
    expect(on).toBeGreaterThan(50);
    expect(off).toBeGreaterThan(50);
  });
  it('turns with her: a goal due north is ahead, to her right when she faces west, behind her facing south, to her left facing east', () => {
    const goal = { x: 0, y: 1.5, z: -70 };
    const out = makeArrow();
    const at = (yaw) => arrowFor(viewOf(cam(0, 2.9, 45, yaw)), { x: 0, z: 45 }, goal, out).rel;
    expect(at(0)).toBeCloseTo(0, 6); // facing north (-z)
    expect(at(90)).toBeCloseTo(Math.PI / 2, 6); // facing west: north is on her right
    expect(Math.abs(at(180))).toBeCloseTo(Math.PI, 6); // facing south
    expect(at(-90)).toBeCloseTo(-Math.PI / 2, 6); // facing east: north is on her left
    // a goal due east: facing north it is on the right
    expect(arrowFor(viewOf(cam(0, 2.9, 45, 0)), { x: 0, z: 45 }, { x: 70, y: 1, z: 45 }, out).rel).toBeCloseTo(Math.PI / 2, 6);
  });
  it('hides when the goal is on screen or within 8 m; shows (with her own distance) when it is off to the side', () => {
    const out = makeArrow();
    const v = viewOf(cam(0, 2.9, 49.4, 0));
    expect(arrowFor(v, { x: 0, z: 45 }, { x: 0, y: 1.5, z: -70 }, out).show).toBe(false); // dead ahead, small but on screen
    expect(out.onScreen).toBe(true);
    expect(arrowFor(v, { x: 0, z: 45 }, { x: 60, y: 1.5, z: 40 }, out).show).toBe(true);
    expect(out.dist).toBeCloseTo(Math.hypot(60, 5), 6);
    expect(arrowFor(v, { x: 0, z: 45 }, { x: 6, y: 1.5, z: 45 }, out).show).toBe(false); // within 8 m of her paws, even though it is behind the camera's side
    expect(arrowFor(v, { x: 0, z: 45 }, { x: 9, y: 1.5, z: 45 }, out).show).toBe(true);
    expect(ARRIVED).toBe(8);
  });
  it('the arrow sits on the edge of its rectangle, on the side it points to, never on the bottom middle', () => {
    const rect = { l: 40, t: 100, r: 920, b: 380 };
    const out = { x: 0, y: 0 };
    for (const rel of [0, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 2.4, -2.4]) {
      edgePoint(rel, rect, out);
      expect(out.x).toBeGreaterThanOrEqual(rect.l - 1e-6); expect(out.x).toBeLessThanOrEqual(rect.r + 1e-6);
      expect(out.y).toBeGreaterThanOrEqual(rect.t - 1e-6); expect(out.y).toBeLessThanOrEqual(rect.b + 1e-6);
      const onEdge = Math.abs(out.x - rect.l) < 1e-6 || Math.abs(out.x - rect.r) < 1e-6 || Math.abs(out.y - rect.t) < 1e-6 || Math.abs(out.y - rect.b) < 1e-6;
      expect(onEdge, String(rel)).toBe(true);
    }
    expect(edgePoint(0, rect, out).y).toBe(rect.t);
    expect(edgePoint(Math.PI / 2, rect, out).x).toBe(rect.r);
    expect(edgePoint(-Math.PI / 2, rect, out).x).toBe(rect.l);
    edgePoint(Math.PI, rect, out);
    expect(Math.abs(out.x - 480)).toBeCloseTo(440, 6); // straight behind goes to a bottom corner
    expect(out.y).toBeCloseTo(rect.b, 6);
    edgePoint(Math.PI - 0.3, rect, out); // nearly behind: nearly the corner, moving smoothly
    const near = out.x;
    edgePoint(Math.PI - 0.9, rect, out);
    expect(Math.abs(near - 480)).toBeGreaterThan(Math.abs(out.x - 480));
  });
  it('allocates nothing once its objects exist (the same objects come back)', () => {
    const v = makeView(); const a = makeArrow(); const e = { x: 0, y: 0 }; const p = { ok: false, x: 0, y: 0, depth: 0 };
    const c = cam(1, 2, 3, 20);
    expect(viewOf(c, v)).toBe(v);
    expect(arrowFor(v, { x: 0, z: 0 }, { x: 30, y: 0, z: 30 }, a)).toBe(a);
    expect(edgePoint(1, { l: 0, t: 0, r: 100, b: 100 }, e)).toBe(e);
    expect(projectPoint(v, 0, 0, 0, 100, 100, p)).toBe(p);
  });
});

describe('what the guide files may and may not do', () => {
  const pure = read('src/world/moonguide.js');
  const live = read('src/world/moonguidelive.js');
  const code = (s) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  it('the pure file has no THREE, no DOM, no random number, no clock and no save write', () => {
    const c = code(pure);
    expect(c).not.toMatch(/from 'three'|document|window|Math\.random|Date\.now|performance|setTimeout|setInterval|localStorage|\.addPoints|state\.moon\s*=/);
  });
  it('the live file builds no THREE object, no mesh and no texture (its own DOM only), draws no random number, saves nothing, and its only clock is the pause watchdog', () => {
    const c = code(live);
    expect(c).not.toMatch(/from 'three'|THREE\.|new Mesh|CanvasTexture|Math\.random|\.addPoints|state\.moon\s*=|localStorage/);
    expect(c.match(/Date\.now/g)?.length).toBe(3); // when it was made, each frame, the watchdog's look
    expect(c).not.toMatch(/requestAnimationFrame|setTimeout/);
  });
  it('the per-frame functions make no object, array or closure (a string only when the arrow or the chip really moved)', () => {
    const frame = (name, to) => { const a = live.indexOf(`function ${name}`); return live.slice(a, live.indexOf(to, a)); };
    for (const body of [frame('frameArrow', 'function frameChip'), frame('frameChip', '// ---- hooks')]) {
      const c = code(body);
      expect(c, 'no array or object literal in a frame').not.toMatch(/=\s*\[|=\s*\{\s*\w+:|new \w+\(|\.map\(|\.filter\(|=>/);
      expect(c.match(/`/g)?.length ?? 0, 'a string is built only where the arrow or the chip is really redrawn (after the unchanged check)').toBeLessThanOrEqual(4);
    }
  });
  it('a plain two-source-file addition: only Moon files name the guide files (the area loader reaches the life through moon.js)', () => {
    for (const f of ['src/main.js', 'src/world/moon.js', 'src/world/moonlife.js']) {
      const s = read(f);
      if (f === 'src/world/moonlife.js') expect(s).toMatch(/moonguidelive\.js/);
      else expect(s).not.toMatch(/moonguide/);
    }
  });
});
