// The guided first walk's script (src/tutorial.js; design section 3).
import { describe, it, expect } from 'vitest';
import { createTutorial, guidedStart, STEP, WALK_M, NUDGE_S, CHIP_AFTER_S, DONE_LINE_S, HOME_RING_S } from '../src/tutorial.js';

const kinds = (fx) => fx.map((e) => e.t);
// Runs `secs` seconds in quarter-second ticks and gathers the effects.
function run(t, secs, facts = {}) {
  const out = [];
  for (let s = 0; s < secs; s += 0.25) out.push(...t.update(0.25, { moved: 0, active: false, guideDist: 3, canFeed: true, hasTreasure: true, ...facts }));
  return out;
}
const begun = (opts) => { const t = createTutorial(opts); t.update(0, { moved: 0, canFeed: true, hasTreasure: true }); return t; };

describe('each step ends on its own event and on nothing else', () => {
  it('step 1 ends when the cat has walked two metres, never by waiting less than 30 s', () => {
    const t = begun();
    expect(t.step).toBe(STEP.walk);
    run(t, 9);
    expect(t.step).toBe(STEP.walk);
    t.update(0.25, { moved: WALK_M - 0.1, active: true });
    expect(t.step).toBe(STEP.walk);
    const fx = t.update(0.25, { moved: WALK_M, active: true });
    expect(t.step).toBe(STEP.hello);
    expect(kinds(fx)).toEqual(['step', 'trail']);
  });

  it('step 2 ends on a hello to the guide; a hello to another cat is counted but does not end it', () => {
    const t = begun({ step: STEP.hello });
    expect(t.view().id).toBe('guide.go');
    t.note('greet', { guide: false });
    expect(t.step).toBe(STEP.hello);
    expect(t.view().id).toBe('guide.hello-other');
    expect(t.view({ prompt: 'hello' })).toMatchObject({ id: 'guide.hello', ring: 'prompt' });
    for (const what of ['meow', 'pounce', 'collect', 'feed']) t.note(what, { guide: false });
    expect(t.step).toBe(STEP.hello);
    t.note('greet', { guide: true });
    expect(t.step).toBe(STEP.fish);
  });

  it('step 3 ends on a fish for the guide, step 4 on a treasure, step 5 on a pounce', () => {
    const t = begun({ step: STEP.fish, did: { hello: true } });
    expect(t.view({ prompt: 'fish' })).toMatchObject({ id: 'guide.fish', ring: 'prompt' });
    expect(t.view().ring).toBe(null); // no ring without the button it points at
    t.note('feed', { guide: false });
    expect(t.step).toBe(STEP.fish);
    expect(kinds(t.note('feed', { guide: true }))).toEqual(['step', 'lead']);
    expect(t.step).toBe(STEP.follow);
    expect(t.view().id).toBe('guide.follow');
    expect(t.view({ prompt: 'pickup' })).toMatchObject({ id: 'guide.pick-up', ring: 'prompt' });
    expect(kinds(t.note('collect'))).toEqual(['step', 'demo']);
    expect(t.step).toBe(STEP.pounce);
    expect(t.view()).toMatchObject({ id: 'guide.pounce', ring: 'pounce' });
    expect(kinds(t.note('pounce'))).toEqual(['step', 'finish']);
    expect(t.step).toBe(STEP.finish);
    expect(t.open).toBe(false);
    expect(t.finished).toBe(true);
  });

  it('no step from 2 to 5 ever ends by waiting', () => {
    for (const step of [STEP.hello, STEP.fish, STEP.follow, STEP.pounce]) {
      const t = begun({ step, did: { hello: step > STEP.hello, fish: step > STEP.fish, treasure: step > STEP.follow } });
      run(t, 300);
      expect(t.step).toBe(step);
    }
  });
});

describe('a later step done early is counted', () => {
  it('a pounce in step 1 stays in step 1 (the guide meows back) and step 5 is passed over', () => {
    const t = begun();
    expect(kinds(t.note('pounce'))).toEqual(['meow']);
    expect(t.step).toBe(STEP.walk);
    t.update(0.25, { moved: 3 });
    t.note('greet', { guide: true });
    t.note('feed', { guide: true });
    const fx = t.note('collect');
    expect(t.step).toBe(STEP.finish); // straight past the pounce
    expect(kinds(fx)).toEqual(['step', 'finish']);
  });

  it('a treasure picked up early passes step 4 over; a hello in step 1 ends steps 1 and 2', () => {
    const t = begun();
    t.note('collect');
    t.note('greet', { guide: true });
    expect(t.step).toBe(STEP.fish);
    t.note('feed', { guide: true });
    expect(t.step).toBe(STEP.pounce);
  });

  it('a guide that cannot be fed, or a walk with no treasure left, passes that step over', () => {
    const t = begun({ step: STEP.hello });
    t.note('greet', { guide: true });
    expect(t.step).toBe(STEP.fish);
    t.update(0.25, { canFeed: false, hasTreasure: false });
    expect(t.step).toBe(STEP.pounce);
  });
});

describe('the nudges after 10, 20 and 30 seconds of nothing', () => {
  it('step 1: a meow and three steps, then the second line, then she comes all the way and hello can begin', () => {
    const t = begun();
    expect(kinds(run(t, NUDGE_S - 0.5))).toEqual([]);
    expect(kinds(run(t, 1))).toEqual(['meow', 'steps']);
    expect(t.view()).toMatchObject({ id: 'guide.walk', more: null, ring: 'move', thumb: 'slide' });
    run(t, NUDGE_S);
    expect(t.view().more).toBe('guide.walk-more');
    expect(t.step).toBe(STEP.walk);
    const fx = run(t, NUDGE_S);
    expect(kinds(fx)).toEqual(['come', 'step', 'trail']);
    expect(t.step).toBe(STEP.hello);
  });

  it('doing something starts the count again, and each nudge is given once', () => {
    const t = begun();
    run(t, NUDGE_S - 1);
    t.update(0.25, { moved: 0.5, active: true });
    expect(kinds(run(t, NUDGE_S - 1))).toEqual([]);
    expect(kinds(run(t, 1.5))).toEqual(['meow', 'steps']);
    t.update(0.25, { moved: 0.6, active: true });
    expect(kinds(run(t, NUDGE_S + 1))).toEqual([]); // not the first nudge again
  });

  it('step 2: two steps and the trail again, then she walks into reach', () => {
    const t = begun({ step: STEP.hello });
    expect(kinds(run(t, NUDGE_S + 0.5))).toEqual(['steps', 'trail']);
    expect(kinds(run(t, NUDGE_S))).toEqual(['come']);
    expect(kinds(run(t, 60))).toEqual([]);
  });

  it('step 3: she rubs against the cat and the ring grows; step 4: halfway back with a meow, then all the way; step 5: she pounces again, then the thumb taps', () => {
    const fish = begun({ step: STEP.fish, did: { hello: true } });
    expect(kinds(run(fish, NUDGE_S + 0.5))).toEqual(['rub']);
    expect(fish.view().grow).toBe(false);
    expect(kinds(run(fish, NUDGE_S))).toEqual(['rub']);
    expect(fish.view().grow).toBe(true);

    const follow = begun({ step: STEP.follow, did: { hello: true, fish: true } });
    expect(kinds(run(follow, NUDGE_S + 0.5))).toEqual(['halfback', 'meow']);
    expect(kinds(run(follow, NUDGE_S))).toEqual(['back']);

    const pounce = begun({ step: STEP.pounce, did: { hello: true, fish: true, treasure: true } });
    expect(kinds(run(pounce, NUDGE_S + 0.5))).toEqual(['demo']);
    run(pounce, NUDGE_S);
    expect(pounce.view()).toMatchObject({ grow: true, thumb: 'tap' });
  });

  it('step 4: a minute away from the guide shrinks the bubble to a paw chip; coming back opens it', () => {
    const t = begun({ step: STEP.follow, did: { hello: true, fish: true } });
    run(t, CHIP_AFTER_S - 2, { guideDist: 30, active: true });
    expect(t.view().chip).toBe(null);
    run(t, 3, { guideDist: 30, active: true });
    expect(t.view().chip).toBe('paw');
    run(t, 0.5, { guideDist: 8, active: true });
    expect(t.view().chip).toBe(null);
  });
});

describe('the finish, skip, and coming back', () => {
  it('the finish line, then how to go home with the ring, then the same line as a chip', () => {
    const t = begun({ step: STEP.pounce, did: { hello: true, fish: true, treasure: true } });
    t.note('pounce');
    expect(t.view()).toMatchObject({ id: 'guide.done', ring: null, chip: null });
    run(t, DONE_LINE_S + 0.25);
    expect(t.step).toBe(STEP.home);
    expect(t.view()).toMatchObject({ id: 'guide.home', ring: 'pause', chip: null });
    run(t, HOME_RING_S + 0.25);
    expect(t.step).toBe(STEP.free);
    expect(t.view()).toMatchObject({ id: 'guide.home', ring: null, chip: 'line' });
    run(t, 600);
    expect(t.step).toBe(STEP.free);
    expect(kinds(t.note('pounce'))).toEqual([]); // nothing more to teach
  });

  it('skip: one call, the lesson is over, nothing shows and nothing more happens', () => {
    const t = begun({ step: STEP.hello });
    expect(t.skip()).toBe(true);
    expect(t.skipped).toBe(true);
    expect(t.open).toBe(false);
    expect(t.view()).toBe(null);
    expect(kinds(run(t, 60))).toEqual([]);
    expect(kinds(t.note('greet', { guide: true }))).toEqual([]);
    expect(t.skip()).toBe(false); // never asked twice
  });

  it('a walk left half way carries its step and what was done, and carries on from there', () => {
    const t = begun();
    t.note('pounce');
    t.update(0.25, { moved: 3 });
    t.note('greet', { guide: true });
    const snap = JSON.parse(JSON.stringify(t.snapshot()));
    expect(snap).toEqual({ step: STEP.fish, did: { moved: true, hello: true, fish: false, treasure: false, pounce: true } });
    const back = createTutorial(snap);
    const fx = back.update(0.25, { canFeed: true, hasTreasure: true });
    expect(kinds(fx)).toEqual(['step']);
    expect(back.step).toBe(STEP.fish);
    back.note('feed', { guide: true });
    back.note('collect');
    expect(back.step).toBe(STEP.finish); // the early pounce still counts
  });

  it('a walk picked up again at step 4 or 5 gives that step its opening again (she leads, she shows)', () => {
    expect(kinds(createTutorial({ step: STEP.follow, did: { hello: true, fish: true } }).update(0.25, {}))).toEqual(['step', 'lead']);
    expect(kinds(createTutorial({ step: STEP.pounce, did: { hello: true, fish: true, treasure: true } }).update(0.25, {}))).toEqual(['step', 'demo']);
  });

  it('guidedStart: a new save gets the whole walk, a walk left half way one more try from step 2, anyone else nothing', () => {
    expect(guidedStart(null)).toEqual({ step: STEP.walk });
    expect(guidedStart('part')).toEqual({ step: STEP.hello });
    for (const first of ['done', 'skipped', 'old', undefined, 'banana']) expect(guidedStart(first)).toBe(null);
  });
});
