import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { bus } from '../src/events.js';

describe('createDiscoveryLog', () => {
  let progression, log;
  beforeEach(() => {
    progression = { addPoints: vi.fn() };
    log = createDiscoveryLog(progression);
    log.startWalk();
  });

  it('awards full points on first discovery, half on repeats', () => {
    expect(log.award('critter', 'bird-1', 'a songbird')).toBe(AWARDS.critter);
    expect(log.award('critter', 'bird-1', 'a songbird')).toBe(Math.max(1, Math.round(AWARDS.critter / 2)));
    expect(progression.addPoints).toHaveBeenCalledTimes(2);
  });

  it('awardOnce pays only the first time per walk', () => {
    expect(log.awardOnce('scenic', 'overlook', 'the overlook')).toBe(AWARDS.scenic);
    expect(log.awardOnce('scenic', 'overlook', 'the overlook')).toBe(0);
    expect(progression.addPoints).toHaveBeenCalledTimes(1);
  });

  it('startWalk resets repeat tracking', () => {
    log.award('critter', 'bird-1', 'a songbird');
    log.startWalk();
    expect(log.award('critter', 'bird-1', 'a songbird')).toBe(AWARDS.critter);
  });

  it('awards friend points for greeting a stray cat once per walk', () => {
    expect(AWARDS.friend).toBe(6);
    expect(log.awardOnce('friend', 'friend-stray-0', 'a new cat friend')).toBe(AWARDS.friend);
    expect(log.awardOnce('friend', 'friend-stray-0', 'a new cat friend')).toBe(0);
  });

  it('emits discovery events on the bus', () => {
    const fn = vi.fn();
    const off = bus.on('discovery', fn);
    log.award('pet', 'pet-1', 'a happy purr');
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pet', points: AWARDS.pet, repeat: false })
    );
    off();
  });

  it('defines the v2 award values', () => {
    expect(AWARDS.play).toBe(5);
    expect(AWARDS.quest).toBe(25);
    expect(AWARDS.photo).toBe(8);
    expect(AWARDS.secret).toBe(12);
    expect(AWARDS.legend).toBe(50);
    expect(AWARDS.rainbow).toBe(15);
  });

  it('defines the v3 award values', () => {
    expect(AWARDS.mischief).toBe(4);
    expect(AWARDS.sits).toBe(8);
    expect(AWARDS.treasure).toBe(12);
  });

  it('defines the v4 award values', () => {
    expect(AWARDS.goal).toBe(15);
    expect(AWARDS.jackpot).toBe(40);
    expect(AWARDS.gift).toBe(10);
  });

  it('defines the v5 co-walk award values', () => {
    expect(AWARDS.rally).toBe(6);
    expect(AWARDS.nappile).toBe(10);
    expect(AWARDS.duet).toBe(5);
    expect(AWARDS.boop).toBe(5);
  });

  it('defines the v6 co-walk verb award values', () => {
    expect(AWARDS.tag).toBe(8);
    expect(AWARDS.groom).toBe(6);
    expect(AWARDS.duogoal).toBe(20);
  });
});

describe('v18 feat tallies', () => {
  // pay() is the single hook point that feeds state.feats — the counters the
  // skill feat predicates in src/skills.js read. These pin that exactly one
  // counter moves by exactly one per paid award, and that an unpaid award
  // (awardOnce's second call in the same walk) moves nothing.
  let progression, log;
  beforeEach(() => {
    progression = { addPoints: vi.fn(), recordFeat: vi.fn() };
    log = createDiscoveryLog(progression);
    log.startWalk();
  });

  it('increments exactly one counter by one per award', () => {
    log.award('mischief', 'tip-bin', 'a gravity check 🐾');
    expect(progression.recordFeat).toHaveBeenCalledTimes(1);
    expect(progression.recordFeat).toHaveBeenCalledWith('mischief');
  });

  it('counts a repeat award too — the tally is lifetime, not per-key', () => {
    log.award('mischief', 'tip-bin', 'a gravity check 🐾');
    log.award('mischief', 'tip-bin', 'a gravity check 🐾');
    expect(progression.recordFeat).toHaveBeenCalledTimes(2);
  });

  it('does not count an awardOnce that paid nothing', () => {
    log.awardOnce('scenic', 'perch-roof', 'the rooftop');
    log.awardOnce('scenic', 'perch-roof', 'the rooftop');
    expect(progression.recordFeat).toHaveBeenCalledTimes(1);
    expect(progression.recordFeat).toHaveBeenCalledWith('scenic');
  });

  it('tolerates a progression without recordFeat (older/stand-in collaborators)', () => {
    const bare = { addPoints: vi.fn() };
    const bareLog = createDiscoveryLog(bare);
    bareLog.startWalk();
    expect(() => bareLog.award('gift', 'gift-mochi', 'a gift')).not.toThrow();
    expect(bare.addPoints).toHaveBeenCalledTimes(1);
  });

  it('tallies before emitting, so a discovery listener sees the updated count', () => {
    // Ordering matters for the in-walk unlock celebration (Task 2.7): it
    // listens on the 'discovery' bus event and asks skills.js whether a feat
    // just completed, which is only true if the tally already landed.
    const order = [];
    progression.recordFeat = vi.fn(() => order.push('tally'));
    const off = bus.on('discovery', () => order.push('emit'));
    createDiscoveryLog(progression).award('gift', 'gift-mochi', 'a gift');
    off();
    expect(order).toEqual(['tally', 'emit']);
  });
});
