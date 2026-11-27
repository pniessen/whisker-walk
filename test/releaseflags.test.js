// The release switch-on (2026-11-26): the four areas and the gates are ON for everyone in a browser, but a plain address must never
// start a walk in an area (that is the ?xx=1 developer shortcut, read by the *Shortcut functions only).
import { describe, it, expect, afterEach } from 'vitest';
import { teleOn } from '../src/teleflag.js';
import { greenhouseOn, greenhouseShortcut } from '../src/greenhouseflag.js';
import { moonOn, moonShortcut } from '../src/moonflag.js';
import { reefOn, reefShortcut } from '../src/reefflag.js';
import { crystalOn, crystalShortcut } from '../src/crystalflag.js';

const at = (search) => { globalThis.location = { search }; };
afterEach(() => { delete globalThis.location; });

describe('released areas', () => {
  it('a plain address: everything on, no walk shortcut', () => {
    at('');
    expect([teleOn(), greenhouseOn(), moonOn(), reefOn(), crystalOn()]).toEqual([true, true, true, true, true]);
    expect([greenhouseShortcut(), moonShortcut(), reefShortcut(), crystalShortcut()]).toEqual([false, false, false, false]);
  });
  it('?x=1 is the shortcut and ?x=0 turns the area off', () => {
    at('?reef=1&moon=0&gates=0');
    expect(reefShortcut()).toBe(true);
    expect(moonOn()).toBe(false);
    expect(teleOn()).toBe(false);
    expect(crystalShortcut()).toBe(false);
  });
});
