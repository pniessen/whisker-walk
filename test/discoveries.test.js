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

  it('emits discovery events on the bus', () => {
    const fn = vi.fn();
    const off = bus.on('discovery', fn);
    log.award('pet', 'pet-1', 'a happy purr');
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pet', points: AWARDS.pet, repeat: false })
    );
    off();
  });
});
