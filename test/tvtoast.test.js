import { describe, it, expect } from 'vitest';
import { toastLifeMs } from '../src/ui/toastlife.js';
import { tvToastTiming } from '../src/tv/toasttime.js';
import { MAX_TOASTS, MIN_SHOWN_MS } from '../src/ui/hud.js';

describe('toast timing', () => {
  it('phones, tablets and desktops keep today\'s timing', () => {
    expect(toastLifeMs('Hi')).toBe(3000);
    expect(toastLifeMs(Array(30).fill('word').join(' '))).toBe(9000);
    expect(MAX_TOASTS).toBe(2);
    expect(MIN_SHOWN_MS).toBe(2500);
  });
  it('a TV: 2.2 s + 0.04 s a character, 2.5 to 5 s, one at a time, ripe after 1.5 s', () => {
    expect(tvToastTiming.cap).toBe(1);
    expect(tvToastTiming.ripe).toBe(1500);
    expect(tvToastTiming.life('Hi')).toBe(2500);
    expect(tvToastTiming.life('x'.repeat(40))).toBe(3800);
    expect(tvToastTiming.life('x'.repeat(200))).toBe(5000);
  });
  it('a goal or a discovery keeps the long end; a crowded queue shortens the rest', () => {
    expect(tvToastTiming.life('Goal complete: Get a head scratch')).toBe(5000);
    expect(tvToastTiming.life('You spotted a butterfly')).toBe(5000);
    expect(tvToastTiming.life('Controller connected', 2)).toBe(1500);
    expect(tvToastTiming.life('Controller connected', 1)).toBeGreaterThan(2400);
  });
});
