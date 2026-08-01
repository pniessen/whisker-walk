import { describe, it, expect } from 'vitest';
import { rollWeather, createRainSchedule } from '../src/weather.js';

describe('rollWeather', () => {
  it('maps rng ranges to conditions 50/30/20', () => {
    expect(rollWeather(() => 0.1)).toBe('clear');
    expect(rollWeather(() => 0.49)).toBe('clear');
    expect(rollWeather(() => 0.55)).toBe('rain');
    expect(rollWeather(() => 0.79)).toBe('rain');
    expect(rollWeather(() => 0.85)).toBe('sunset');
  });
});

describe('createRainSchedule', () => {
  it('spans 60-120s of rain then a 30s rainbow window', () => {
    const early = createRainSchedule(() => 0);
    expect(early.stopAt).toBe(60);
    expect(early.rainbowUntil).toBe(90);
    const late = createRainSchedule(() => 1);
    expect(late.stopAt).toBe(120);
    expect(late.rainbowUntil).toBe(150);
  });

  it('phases correctly over time', () => {
    const s = createRainSchedule(() => 0);
    expect(s.phase(10)).toBe('rain');
    expect(s.phase(61)).toBe('rainbow');
    expect(s.phase(95)).toBe('after');
  });
});
