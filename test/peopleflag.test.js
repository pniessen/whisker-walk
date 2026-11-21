import { describe, it, expect, afterEach } from 'vitest';
import { peopleOn, setPeople } from '../src/peopleflag.js';

afterEach(() => { setPeople(null); delete globalThis.location; });

describe('the people switch', () => {
  it('is off with no address, and on only for ?people=1', () => {
    expect(peopleOn()).toBe(false);
    globalThis.location = { search: '?people=1' };
    expect(peopleOn()).toBe(true);
    globalThis.location = { search: '?people=0' };
    expect(peopleOn()).toBe(false);
    globalThis.location = { search: '?roofs=1' };
    expect(peopleOn()).toBe(false);
  });
  it('setPeople forces it either way, and null goes back to the address', () => {
    globalThis.location = { search: '?people=1' };
    setPeople(false);
    expect(peopleOn()).toBe(false);
    setPeople(true);
    globalThis.location = { search: '' };
    expect(peopleOn()).toBe(true);
    setPeople(null);
    expect(peopleOn()).toBe(false);
  });
});
