// The Moon's story flow, the pure part (src/world/moonflow.js): the transition table (every step, both word sets), the "Next:" line from the goal kind, which
// transition happened between two looks, the queue (one at a time, with a gap, nothing buried, stale lines dropped), the call-to-action pill's rules and its rhythm,
// and the source scans (line length, banned words, key words, start-up).
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { phrase, PHRASE_IDS, LATER_PHRASE_IDS } from '../src/clanphrases.js';
import * as M from '../src/world/moonmission.js';
import { FLOW_LINES, LINES } from '../src/world/moonwords.js';
import { goalWords } from '../src/world/moonguide.js';
import { FLOW, FLOW_KEYS, GOAL_KINDS, GAP, CTA, MUTED, nextLine, whatNow, rowLines, linesFor, diff, createQueue, ctaFor, createCta } from '../src/world/moonflow.js';
import { keysToPad } from '../src/tv/padwords.js';
import { TOKENS } from '../src/tv/glyphs.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const BOTH = (fn) => { fn('family'); withOffWords(() => fn('everyday')); };
const look = (o = {}) => ({ step: 0, deep: false, card: false, stage: -1, flight: 0, done: false, ...o });

describe('the table', () => {
  it('has a row for every transition of the story, and each row names who says its confirm line, the goal after it and a step', () => {
    expect(FLOW_KEYS).toEqual(['wake', 'plug1', 'awake', 'aimed', 'stamp', 'posted', 'count', 'liftoff', 'waiting', 'replied', 'errand', 'errandDone', 'deep']);
    for (const k of FLOW_KEYS) {
      const row = FLOW[k];
      expect(['base', 'star', 'launch', 'deep', 'job', 'flow'], k).toContain(row.by);
      expect(typeof row.confirm(), k).toBe('string');
      expect(row.confirm().length, k).toBeGreaterThan(0);
      expect(Number.isInteger(row.step), k).toBe(true);
      expect([...GOAL_KINDS, 'done'], k).toContain(row.goal);
      expect(typeof row.prompt(), k).toBe('string');
      for (const l of row.lines) { expect(l.at).toBeGreaterThanOrEqual(0); expect(['why', 'next', 'what', 'more', 'confirm']).toContain(l.k); }
    }
    expect(Object.isFrozen(FLOW)).toBe(true);
  });
  it('the step transitions of the story all have a row: wake 1, the cells, the base 4, Earth found 5, posted 6, sent 7, replied 8', () => {
    const steps = Object.fromEntries(['wake', 'awake', 'aimed', 'posted', 'liftoff', 'replied'].map((k) => [k, FLOW[k].step]));
    expect(steps).toEqual({ wake: M.STEP.pip, awake: M.STEP.awake, aimed: M.STEP.aimed, posted: M.STEP.loaded, liftoff: M.STEP.sent, replied: M.STEP.replied });
  });
  it('the three chapter lines are the owner\'s, in both word sets, and they sit at the chapter starts (Pip awake, the base awake, Earth found)', () => {
    BOTH(() => {
      expect(linesFor('wake', 'cell').map((l) => l.text)).toEqual(['The Moon base is asleep. Find two power cells to wake it up!']);
      expect(linesFor('awake', 'scope')[0].text).toBe('Now Pip wants to send a postcard to Earth. The dish must find Earth first!');
      expect(linesFor('aimed', 'desk')[0].text).toBe('Time to send your postcard to Earth!');
    });
  });
  it('confirm lines are said by the life that owns the step: the words the table points at are the very words that life says', () => {
    expect(FLOW.stamp.confirm()).toBe('Great stamp! Now carry the postcard to the rocket.');
    expect(FLOW.posted.confirm()).toBe('Postcard posted! Next: press the big red button at the launch desk.');
    expect(FLOW.replied.confirm()).toBe('Earth answered! It sent your stamp back.');
    expect(phrase('moon.badge')).toBe('A Moon Badge! You are a Moon Explorer!');
    expect(FLOW.stamp.prompt()).toBe('E — post the postcard in the rocket');
    expect(FLOW.posted.prompt()).toBe('E — press the big red button to launch!');
  });
  it('every row\'s lines come out for the goal kind it is said at; a kind with nothing to say adds nothing', () => {
    for (const k of FLOW_KEYS) for (const kind of [...GOAL_KINDS, 'done']) for (const l of linesFor(k, kind)) expect(l.text, `${k}/${kind}`).toMatch(/\S/);
    expect(linesFor('liftoff', 'reply')[0].text).toBe('Next: wait at Earthrise Rock to see Earth answer.');
    expect(linesFor('liftoff', 'done')).toEqual([]);
    expect(linesFor('replied', 'cave').map((l) => l.text)).toEqual(['What now? A glowing cell waits in the cave. Follow the gold light.', 'Pip has a small errand every walk. Meow to call him.']);
    expect(linesFor('replied', 'job')[0].text).toMatch(/errand today/);
    expect(linesFor('replied', 'done')).toEqual([]);
    expect(linesFor('errandDone', 'done')[0].text).toBe('That is all for today. Pip will have a new errand next walk.');
    expect(linesFor('deep', 'done').map((l) => l.text)).toEqual(['The Deep Cell gives the whole base extra power!', 'That is everything on the Moon! Pip has a new errand every walk.']);
    expect(linesFor('posted', 'button', { second: true })).toEqual([]); // the second rocket does not tell the story's why again
    expect(linesFor('posted', 'button')).toHaveLength(1);
  });
  it('a muted row says nothing (the coordinator\'s switch)', () => {
    MUTED.add('awake');
    try { expect(rowLines('awake')).toEqual([]); expect(linesFor('awake', 'scope')).toEqual([]); } finally { MUTED.delete('awake'); }
    expect(rowLines('awake').length).toBeGreaterThan(0);
  });
});

describe('the Next: line follows the goal, never another', () => {
  const NAMES = { pip: /Pip/, cell: /power cell/, core: /Core/, scope: /Star Hill|telescope/, desk: /Message Desk/, rocket: /rocket/, button: /big red button/, reply: /Earthrise Rock/, cave: /cave/, job: /errand/ };
  const guide = (kind) => {
    const at = { x: 0, z: 0 };
    const rec = { step: kind === 'cave' ? 8 : 4, cells: 3 };
    const g = { kind, cell: 0 };
    return goalWords({ goal: { g, x: 5, z: -30 }, record: rec, scope: 0, job: { kind: 'glove', glove: 'home' }, riding: false, ...at });
  };
  it('names the same thing as the written goal line for every goal kind, in both sets', () => {
    BOTH((set) => {
      for (const kind of GOAL_KINDS) {
        const next = nextLine(kind);
        expect(next, `${set} ${kind}`).toMatch(/^Next: /);
        expect(next, `${set} ${kind}`).toMatch(NAMES[kind]);
        const written = kind === 'job' ? 'errand' : guide(kind);
        expect(written, `${set} ${kind} guide`).toMatch(NAMES[kind]);
      }
      expect(nextLine('done')).toBe('');
      expect(whatNow('cave')).toMatch(/cave/);
      expect(whatNow('job')).toMatch(/errand/);
      expect(whatNow('done')).toBe('');
    });
  });
});

describe('which transition happened', () => {
  const hit = (a, b) => diff(look(a), look(b));
  it('one step each, in order', () => {
    expect(hit({ step: 0 }, { step: 1 })).toEqual(['wake']);
    expect(hit({ step: 1 }, { step: 2 })).toEqual(['plug1']);
    expect(hit({ step: 2 }, { step: 3 })).toEqual([]); // the wake-up beat is playing: nothing yet
    expect(hit({ step: 3 }, { step: 4 })).toEqual(['awake']);
    expect(hit({ step: 4 }, { step: 5 })).toEqual(['aimed']);
    expect(hit({ step: 5 }, { step: 5, card: true })).toEqual(['stamp']);
    expect(hit({ step: 5, card: true }, { step: 6 })).toEqual(['posted']);
    expect(hit({ step: 6 }, { step: 6, flight: 2 })).toEqual(['count']);
    expect(hit({ step: 6, flight: 2 }, { step: 7, flight: 2 })).toEqual(['liftoff']);
    expect(hit({ step: 7 }, { step: 8 })).toEqual(['replied']);
  });
  it('a skipped step says only the highest it reaches (the base and the stars both done: Earth is found, not "the dish must find Earth")', () => {
    expect(hit({ step: 3 }, { step: 5 })).toEqual(['aimed']);
    expect(hit({ step: 0 }, { step: 4 })).toEqual(['awake']);
    expect(hit({ step: 5 }, { step: 8 })).toEqual(['replied']);
  });
  it('the second rocket, the Deep Cell and the errand', () => {
    expect(hit({ step: 8, stage: 0 }, { step: 8, stage: 1 })).toEqual(['stamp']);
    expect(hit({ step: 8, stage: 1 }, { step: 8, stage: 2 })).toEqual(['posted']);
    expect(hit({ step: 8, stage: -1 }, { step: 8, stage: 0 })).toEqual([]);
    expect(hit({ step: 8 }, { step: 8, deep: true })).toEqual(['deep']);
    expect(hit({ step: 8 }, { step: 8, done: true })).toEqual(['errandDone']);
  });
  it('a demo launch, a step that does not move, a step that goes backwards and no look at all say nothing', () => {
    expect(hit({ step: 6 }, { step: 6, flight: 1 })).toEqual([]);
    expect(hit({ step: 6 }, { step: 6 })).toEqual([]);
    expect(hit({ step: 6 }, { step: 4 })).toEqual([]);
    expect(diff(null, look())).toEqual([]);
    expect(diff(look(), null)).toEqual([]);
  });
});

describe('the queue: one at a time, with a gap', () => {
  const run = (q, secs, paused = false) => { const said = []; for (let i = 0; i < secs * 10; i++) { const l = q.update(0.1, paused); if (l) said.push([Math.round((i + 1) * 1) / 10, l]); } return said; };
  it('says lines in order of their time, never closer than the gap, and none is lost', () => {
    const q = createQueue();
    q.push({ at: 0, text: 'a' }); q.push({ at: 0, text: 'b' }); q.push({ at: 0.5, text: 'c' });
    const said = run(q, 12);
    expect(said.map((s) => s[1])).toEqual(['a', 'b', 'c']);
    for (let i = 1; i < said.length; i++) expect(said[i][0] - said[i - 1][0]).toBeGreaterThanOrEqual(GAP - 0.11);
  });
  it('a later transition waits behind an earlier one (it never buries it)', () => {
    const q = createQueue();
    q.push({ at: 3, text: 'first why' });
    run(q, 1);
    q.push({ at: 0, text: 'second' });
    expect(run(q, 12).map((s) => s[1])).toEqual(['second', 'first why']); // 'second' is due now; the other keeps its own time
    const q2 = createQueue();
    q2.push({ at: 0, text: 'one' }); q2.push({ at: 0.2, text: 'two' });
    expect(run(q2, 10).map((s) => s[1])).toEqual(['one', 'two']);
  });
  it('a line whose step has moved on is dropped and costs no gap; a line may be worked out when it is said', () => {
    const q = createQueue();
    let ok = true;
    let word = 'early';
    q.push({ at: 0, text: 'stale', valid: () => ok });
    q.push({ at: 0.1, text: () => word });
    ok = false; word = 'late';
    const said = run(q, 5);
    expect(said.map((s) => s[1])).toEqual(['late']);
    expect(said[0][0]).toBeLessThan(1);
    const q2 = createQueue();
    q2.push({ at: 0, text: () => '' }); // nothing to say now
    expect(run(q2, 2)).toEqual([]);
    expect(q2.length).toBe(0);
  });
  it('holds while paused (a page is open) and says it after', () => {
    const q = createQueue();
    q.push({ at: 0, text: 'x' });
    expect(run(q, 5, true)).toEqual([]);
    expect(q.length).toBe(1);
    expect(run(q, 1).map((s) => s[1])).toEqual(['x']);
  });
  it('a long backlog drops the oldest why/more first and keeps what comes next', () => {
    const q = createQueue();
    q.push({ at: 1, k: 'why', text: 'why1' });
    for (let i = 0; i < 6; i++) q.push({ at: 2 + i, k: 'next', text: `n${i}` });
    expect(q.length).toBe(6);
    expect(q.items.some((i) => i.k === 'why')).toBe(false);
  });
});

describe('the call to action', () => {
  const base = { step: 6, card: false, stage: -1, flight: false, open: false, near: { rocket: false, button: true } };
  it('shows at the big red button with the postcard posted and no launch yet, and at the rocket slot with the postcard in her mouth', () => {
    expect(ctaFor(base)).toBe('button');
    expect(ctaFor({ ...base, step: 5, card: true, near: { rocket: true, button: false } })).toBe('rocket');
  });
  it('is not shown away from the thing, before the postcard is posted, after the launch, during a flight or with a page open', () => {
    expect(ctaFor({ ...base, near: { rocket: false, button: false } })).toBe('');
    expect(ctaFor({ ...base, step: 5 })).toBe('');
    expect(ctaFor({ ...base, step: 7 })).toBe('');
    expect(ctaFor({ ...base, step: 8 })).toBe('');
    expect(ctaFor({ ...base, flight: true })).toBe('');
    expect(ctaFor({ ...base, open: true })).toBe('');
    expect(ctaFor({ ...base, step: 5, card: false, near: { rocket: true, button: false } })).toBe('');
    expect(ctaFor({ ...base, step: 4, card: true, near: { rocket: true, button: false } })).toBe('');
    expect(ctaFor(null)).toBe('');
  });
  it('the second rocket asks the same, only with its own postcard', () => {
    expect(ctaFor({ step: 8, card: true, stage: 1, flight: false, open: false, near: { rocket: true, button: false } })).toBe('rocket');
    expect(ctaFor({ step: 8, card: false, stage: 2, flight: false, open: false, near: { rocket: false, button: true } })).toBe('button');
    expect(ctaFor({ step: 8, card: false, stage: 0, flight: false, open: false, near: { rocket: false, button: true } })).toBe('');
  });
  it('shows 6 s, rests 4 s and comes back every 10 s while she stays; goes the moment she leaves and shows at once when she is back', () => {
    const c = createCta();
    const at = (t, want = 'button') => { let r = ''; for (let i = 0; i < t * 10; i++) r = c.update(0.1, want); return r; };
    expect(c.update(0.1, 'button')).toBe('button');
    expect(at(5.4)).toBe('button'); // 5.5 s
    expect(at(1)).toBe(''); // 6.5 s: resting
    expect(at(3)).toBe(''); // 9.5 s
    expect(at(1)).toBe('button'); // 10.5 s: back
    expect(at(6)).toBe(''); // 16.5 s: resting again
    expect(c.update(0.1, '')).toBe('');
    expect(c.update(0.1, 'button')).toBe('button');
    expect(CTA.show + CTA.hide).toBe(10);
  });
});

describe('the lines', () => {
  const ids = Object.keys(FLOW_LINES);
  it('twenty-seven lines, all lazy (not in the start-up tables), every one short, plain and in the same words in both sets', () => {
    expect(ids.length).toBe(27);
    for (const id of ids) expect(PHRASE_IDS.includes(id) || LATER_PHRASE_IDS.includes(id), `${id} is in the start-up download`).toBe(false);
    for (const id of ids) expect(id).toMatch(/^moon\.flow\./);
    const fam = Object.fromEntries(ids.map((id) => [id, phrase(id)]));
    let every;
    withOffWords(() => { every = Object.fromEntries(ids.map((id) => [id, phrase(id)])); for (const id of ids) expect(bannedIn(phrase(id)), id).toBeNull(); });
    expect(every).toEqual(fam);
    for (const id of ids) {
      expect(fam[id].length, id).toBeLessThanOrEqual(90);
      expect(fam[id], id).not.toMatch(/\b(drown|die|dead|scared|scary|dark|hurt|danger|afraid|lost forever|too late|hurry)\b/i);
      expect(fam[id], id).not.toMatch(/Silverpelt/);
    }
  });
  it('no raw key, mouse or touch word (a pad reads these too), and no line needs a token', () => {
    const RAW = /\b(E|Space|Esc|Enter|WASD|click|Click|tap|Tap|swipe|arrow keys|[Pp]ress (E|Space|Esc|V|C|Enter))\b(?!\w)/;
    BOTH(() => { for (const id of ids) { const t = phrase(id); expect(RAW.test(t), `${id}: ${t}`).toBe(false); if (t.includes('⟦')) for (const tok of t.match(/⟦(\w+)⟧/g)) expect(TOKENS).toContain(tok.slice(1, -1)); expect(keysToPad(t)).toBe(t); } });
  });
  it('the reworded prompts of the stretch are E lines (one Square press on a pad) and the words the owner asked for', () => {
    for (const id of ['moon.rocket.prompt', 'moon.launch.prompt']) expect(phrase(id)).toMatch(/^E — /);
    expect(phrase('moon.rocket.prompt')).toBe('E — post the postcard in the rocket');
    expect(phrase('moon.launch.prompt')).toBe('E — press the big red button to launch!');
    for (const id of ['moon.rocket.prompt', 'moon.launch.prompt']) expect(keysToPad(phrase(id))).toMatch(/^⟦interact⟧ — /);
  });
  it('the existing lines the stretch now reads from are short and in both sets', () => {
    BOTH(() => { for (const id of ['moon.card.got', 'moon.rocket.loaded', 'moon.launch.sent', 'moon.reply.wait', 'moon.reply', 'moon.badge']) { expect(phrase(id).length, id).toBeLessThanOrEqual(90); expect(bannedIn(phrase(id)), id).toBeNull(); } });
    expect(Object.keys(LINES)).not.toContain('moon.flow.ch1'); // (the flow's own lines are kept apart, so the other cues' counts do not move)
  });
});

describe('the start-up download', () => {
  it('only the Moon\'s own files name the flow files (the pack loads them through the area loader, never start-up)', () => {
    for (const f of globSync('src/**/*.js')) {
      const name = f.split('\\').join('/');
      if (/^src\/world\/moon[a-z]*\.js$/.test(name)) continue;
      expect(read(name), name).not.toMatch(/moonflow/);
    }
  });
  it('the flow files import only the Moon\'s own files, the phrase table, the event bus and the TV seam', () => {
    for (const f of ['src/world/moonflow.js', 'src/world/moonflowlive.js']) {
      const imports = [...read(f).matchAll(/^import .*?from '(.+?)';/gm)].map((m) => m[1]);
      for (const i of imports) expect(i, `${f}: ${i}`).toMatch(/^(\.\.\/(clanphrases|events|tvseam)\.js|\.\/moon[a-z]*\.js)$/);
    }
  });
  it('the pure file has no THREE, no DOM, no clock and no random number', () => {
    const src = read('src/world/moonflow.js').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/THREE|document|window\b|Date\.now|performance\.now|Math\.random/);
  });
});
