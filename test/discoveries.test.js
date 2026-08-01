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
});
