import { describe, it, expect, afterEach } from 'vitest';
import { peopleOn, setPeople } from '../src/peopleflag.js';

afterEach(() => { setPeople(null); delete globalThis.location; });

describe('the people switch', () => {
  it('is on with no address, and off only for ?people=0', () => {
    expect(peopleOn()).toBe(true);
    globalThis.location = { search: '' };
    expect(peopleOn()).toBe(true);
    globalThis.location = { search: '?people=1' };
    expect(peopleOn()).toBe(true);
    globalThis.location = { search: '?people=0' };
    expect(peopleOn()).toBe(false);
    globalThis.location = { search: '?perf&people=0&rung=3' };
    expect(peopleOn()).toBe(false);
    globalThis.location = { search: '?roofs=1' };
    expect(peopleOn()).toBe(true);
  });
  it('stays on for anything but 0 after people=', () => {
    globalThis.location = { search: '?people=' };
    expect(peopleOn()).toBe(true);
    globalThis.location = { search: '?people=off' };
    expect(peopleOn()).toBe(true);
  });
  it('is on when the address cannot be read', () => {
    globalThis.location = { get search() { throw new Error('no address'); } };
    expect(peopleOn()).toBe(true);
  });
  it('setPeople forces it either way, and null goes back to the address', () => {
    globalThis.location = { search: '?people=1' };
    setPeople(false);
    expect(peopleOn()).toBe(false);
    setPeople(true);
    globalThis.location = { search: '?people=0' };
    expect(peopleOn()).toBe(true);
    setPeople(null);
    expect(peopleOn()).toBe(false);
    globalThis.location = { search: '' };
    expect(peopleOn()).toBe(true);
  });
});
