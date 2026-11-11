import { describe, it, expect } from 'vitest';
import {
  DEVICE_GLOBAL, DEVICE_EVENT, sanitizeProfile, readDeviceProfile, isHot, modelFamily, startRungFor,
  describeProfile,
} from '../src/render/deviceprofile.js';

// What the iPhone and iPad app tells the game about its device
// (ios/WhiskerWalk/DeviceProfile.swift), and what the game makes of it.

// An iPad: no Taptic Engine, so the app says haptics: false.
const iPad7 = { model: 'iPad7,11', memoryGB: 2.9, thermal: 'nominal', lowPower: false, haptics: false };

describe('the names the app and the game agree on', () => {
  it('match the Swift side', () => {
    expect(DEVICE_GLOBAL).toBe('__whiskerDevice');
    expect(DEVICE_EVENT).toBe('whisker-device');
  });
});

describe('sanitizeProfile', () => {
  it('passes a well-formed profile through', () => {
    expect(sanitizeProfile(iPad7)).toEqual(iPad7);
    expect(sanitizeProfile(Object.freeze({ ...iPad7, thermal: 'serious', lowPower: true })))
      .toEqual({ ...iPad7, thermal: 'serious', lowPower: true });
  });
  it('is null when there is nothing to go on', () => {
    for (const raw of [undefined, null, 0, '', 'iPad7,11', [], [iPad7], {}, { thermal: 'serious' }, { model: 7, memoryGB: 'lots' }]) {
      expect(sanitizeProfile(raw)).toBeNull();
    }
  });
  it('drops unknown fields, the event\'s memoryWarning among them', () => {
    expect(sanitizeProfile({ ...iPad7, memoryWarning: true, extra: 1 })).toEqual(iPad7);
  });
  it('a field of the wrong type takes its harmless value', () => {
    expect(sanitizeProfile({ model: 'iPad7,11' })).toEqual({ model: 'iPad7,11', memoryGB: null, thermal: 'nominal', lowPower: false, haptics: false });
    expect(sanitizeProfile({ ...iPad7, thermal: 'molten', lowPower: 'yes' })).toEqual(iPad7);
    expect(sanitizeProfile({ ...iPad7, memoryGB: NaN }).memoryGB).toBeNull();
    expect(sanitizeProfile({ ...iPad7, memoryGB: -3 }).memoryGB).toBeNull();
    expect(sanitizeProfile({ ...iPad7, memoryGB: Infinity }).memoryGB).toBeNull();
  });
  it('haptics is true only when the app says exactly true (an iPhone), and changes no starting rung', () => {
    const iPhone = { model: 'iPhone18,1', memoryGB: 11.2, thermal: 'nominal', lowPower: false, haptics: true };
    expect(sanitizeProfile(iPhone)).toEqual(iPhone);
    for (const haptics of [undefined, false, 'true', 1, {}]) {
      expect(sanitizeProfile({ ...iPhone, haptics }).haptics).toBe(false);
    }
    expect(readDeviceProfile({ __whiskerDevice: Object.freeze({ ...iPhone }) }).haptics).toBe(true);
    for (const p of [iPad7, { ...iPad7, model: 'iPad13,1', memoryGB: 2.9 }, iPhone, { ...iPhone, model: 'iPhone10,6', memoryGB: 2.8 }]) {
      expect(startRungFor({ ...p, haptics: true })).toBe(startRungFor({ ...p, haptics: false }));
    }
  });
  it('a model that is not a short plain word is no model', () => {
    for (const model of ['<script>', 'iPad7,11; drop', 'a'.repeat(33), '', 'iPad 7']) {
      expect(sanitizeProfile({ model, memoryGB: 3 })).toEqual({ model: '', memoryGB: 3, thermal: 'nominal', lowPower: false, haptics: false });
    }
  });
});

describe('readDeviceProfile', () => {
  it('reads the object the app left on the window', () => {
    expect(readDeviceProfile({ __whiskerDevice: Object.freeze({ ...iPad7 }) })).toEqual(iPad7);
  });
  it('is null in a browser, where nothing left one', () => {
    expect(readDeviceProfile({})).toBeNull();
    expect(readDeviceProfile(undefined)).toBeNull();
    expect(readDeviceProfile(null)).toBeNull();
    expect(readDeviceProfile({ __whiskerDevice: 'iPad' })).toBeNull();
  });
  it('never throws', () => {
    const hostile = {};
    Object.defineProperty(hostile, '__whiskerDevice', { get() { throw new Error('no'); } });
    expect(readDeviceProfile(hostile)).toBeNull();
  });
});

describe('isHot', () => {
  it('serious and critical are hot; nominal, fair and anything else are not', () => {
    expect(isHot('serious')).toBe(true);
    expect(isHot('critical')).toBe(true);
    expect(isHot('nominal')).toBe(false);
    expect(isHot('fair')).toBe(false);
    expect(isHot(undefined)).toBe(false);
    expect(isHot('hot')).toBe(false);
  });
});

describe('modelFamily', () => {
  it('splits an iPhone or iPad identifier', () => {
    expect(modelFamily('iPad7,11')).toEqual({ kind: 'iPad', major: 7, minor: 11 });
    expect(modelFamily('iPhone18,1')).toEqual({ kind: 'iPhone', major: 18, minor: 1 });
  });
  it('is null for anything else', () => {
    for (const m of ['', 'arm64', 'x86_64', 'iPod9,1', 'iPad7', 'iPad,11', 'MacBookPro18,3', undefined, 7]) {
      expect(modelFamily(m)).toBeNull();
    }
  });
});

describe('startRungFor — the starting-rung table (estimates until real readings exist)', () => {
  const start = (model, memoryGB) => startRungFor({ model, memoryGB, thermal: 'nominal', lowPower: false });

  it('no profile, or one that says nothing, starts at the top exactly as before', () => {
    expect(startRungFor(null)).toBe(0);
    expect(startRungFor(undefined)).toBe(0);
    expect(startRungFor({})).toBe(0);
    expect(startRungFor('iPad7,11')).toBe(0);
  });
  it('an unrecognised or future model with plenty of memory starts at the top', () => {
    expect(start('arm64', 16)).toBe(0);
    expect(start('iPad99,1', 16)).toBe(0);
    expect(start('iPhone30,2', 12)).toBe(0);
    expect(start('', 8)).toBe(0);
  });
  it('A10-class iPads start at LOW: the iPad 7th generation, the weakest target', () => {
    expect(start('iPad7,11', 2.9)).toBe(3);
    expect(start('iPad7,12', 2.9)).toBe(3);
    expect(start('iPad7,5', 1.9)).toBe(3);  // iPad 6th generation
    expect(start('iPad7,3', 3.7)).toBe(3);  // iPad Pro 10.5 (A10X): same row, on purpose
    expect(start('iPad6,11', 1.9)).toBe(3); // older still
    expect(start('iPhone9,3', 1.9)).toBe(3);
  });
  it('A11 and A12 start on rung 2', () => {
    expect(start('iPhone10,6', 2.8)).toBe(2);
    expect(start('iPhone11,8', 2.8)).toBe(2);
    expect(start('iPad11,6', 2.9)).toBe(2); // iPad 8th generation
    expect(start('iPad11,3', 2.9)).toBe(2); // iPad Air 3
  });
  it('A12X/Z and A13 start on rung 1', () => {
    expect(start('iPad8,9', 5.6)).toBe(1);
    expect(start('iPad12,1', 2.9)).toBe(1); // iPad 9th generation
    expect(start('iPhone12,1', 3.7)).toBe(1);
  });
  it('A14 and newer start at the top, the measured iPhone 18 Pro among them', () => {
    expect(start('iPad13,18', 3.7)).toBe(0); // iPad 10th generation, "4 GB"
    expect(start('iPad14,1', 3.7)).toBe(0);
    expect(start('iPhone14,5', 3.7)).toBe(0);
    expect(start('iPhone18,1', 11.2)).toBe(0);
  });
  it('under 4 GB never starts above rung 1, whatever the chip', () => {
    expect(start('iPad13,1', 2.9)).toBe(1);
    expect(start('iPhone99,1', 2.9)).toBe(1);
    expect(start('', 2.9)).toBe(1);
    expect(start('arm64', 3.3)).toBe(1);
    // A "4 GB" device reports about 3.7: not under 4 GB.
    expect(start('iPad13,1', 3.7)).toBe(0);
    // ...and it never RAISES a rung the chip already put lower.
    expect(start('iPad7,11', 2.9)).toBe(3);
  });
  it('memory unknown leaves the chip\'s row alone', () => {
    expect(startRungFor({ model: 'iPad13,1' })).toBe(0);
    expect(startRungFor({ model: 'iPad7,11' })).toBe(3);
  });
  it('never starts below LOW: the rungs under it are earned by real frame times', () => {
    for (const model of ['iPad1,1', 'iPad7,11', 'iPhone1,1', 'iPhone9,1']) {
      expect(start(model, 0.5)).toBeLessThanOrEqual(3);
    }
  });
  it('heat and Low Power Mode are not part of the table', () => {
    expect(startRungFor({ ...iPad7, thermal: 'critical', lowPower: true })).toBe(3);
    expect(startRungFor({ model: 'iPhone18,1', memoryGB: 11.2, thermal: 'critical', lowPower: true })).toBe(0);
  });
});

describe('describeProfile', () => {
  it('is one readable line, or nothing', () => {
    expect(describeProfile(iPad7)).toBe('iPad7,11 · 2.9 GB · thermal nominal · low power off');
    expect(describeProfile({ model: '', memoryGB: null, thermal: 'serious', lowPower: true }))
      .toBe('unknown model · ? GB · thermal serious · low power on');
    expect(describeProfile(null)).toBe('');
  });
});

describe('a memory warning lets go of the menu pictures', () => {
  it('releaseThumbnails is safe to call at any time, any number of times', async () => {
    const { releaseThumbnails } = await import('../src/thumbnails.js');
    expect(() => { releaseThumbnails(); releaseThumbnails(); }).not.toThrow();
  });
});
