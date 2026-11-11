// What the iPhone and iPad app tells the game about the device it is on, and
// what the game makes of it. No DOM and no three import: a leaf module,
// unit-tested headless (test/deviceprofile.test.js).
//
// The app shell (ios/WhiskerWalk/DeviceProfile.swift) sets one frozen object
// before the game boots,
//   window.__whiskerDevice = { haptics, model, memoryGB, thermal, lowPower }
// and sends a 'whisker-device' CustomEvent on window with the same fields
// whenever the thermal state or Low Power Mode changes, plus
// memoryWarning: true when iOS says memory is short. `haptics` is whether the
// device can buzz (an iPhone yes, an iPad no: it has no Taptic Engine), for
// src/haptics.js; nothing here reads it.
//
// In Safari and on desktop there is no such object and no such event, and
// everything here answers the way the game behaved before the bridge existed:
// no profile, start at the top, nothing temporary.

import { LOW_RUNG } from './quality.js';

export const DEVICE_GLOBAL = '__whiskerDevice';
export const DEVICE_EVENT = 'whisker-device';

const THERMAL = ['nominal', 'fair', 'serious', 'critical'];

// Whatever arrives is treated as untrusted text: the page's own code is not
// the only thing that can set a global. Returns a plain profile, or null when
// there is nothing usable (no object, or no model and no memory figure).
// Unknown fields are dropped; a field of the wrong type takes its harmless
// value (no model, memory unknown, nominal, not low power, no haptics).
export function sanitizeProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const model = typeof raw.model === 'string' && /^[A-Za-z0-9,_-]{1,32}$/.test(raw.model) ? raw.model : '';
  const memoryGB = typeof raw.memoryGB === 'number' && Number.isFinite(raw.memoryGB) && raw.memoryGB > 0 && raw.memoryGB < 4096
    ? raw.memoryGB : null;
  if (!model && memoryGB === null) return null;
  return {
    model,
    memoryGB,
    thermal: THERMAL.includes(raw.thermal) ? raw.thermal : 'nominal',
    lowPower: raw.lowPower === true,
    haptics: raw.haptics === true,
  };
}

// The profile the shell left for this page, or null. Never throws: a getter
// that throws, or no window at all, is "no profile".
export function readDeviceProfile(win = globalThis) {
  try {
    return sanitizeProfile(win?.[DEVICE_GLOBAL]);
  } catch {
    return null;
  }
}

// 'serious' and 'critical' are the two states iOS documents as "reduce your
// work now": the system is already slowing the device to cool it.
export function isHot(thermal) {
  return thermal === 'serious' || thermal === 'critical';
}

// 'iPad7,11' → { kind: 'iPad', major: 7, minor: 11 }; null for anything that
// is not an iPhone or iPad identifier (a Mac's 'arm64', an empty string).
export function modelFamily(model) {
  const m = /^(iPad|iPhone)(\d{1,2}),(\d{1,2})$/.exec(typeof model === 'string' ? model : '');
  return m ? { kind: m[1], major: Number(m[2]), minor: Number(m[3]) } : null;
}

// A "4 GB" device reports about 3.7 and a "3 GB" one about 2.9, so the line
// between them is drawn in the gap, not at 4.
const UNDER_4GB = 3.4;

// ---------------------------------------------------------------------------
// THE STARTING-RUNG TABLE.
//
// For a device with NO adapt memory yet: which rung its very first walk starts
// on, so a slow iPad's first minutes are not spent stuttering down the ladder
// from the top. A rung remembered from real frame times always wins over this
// (game/adaptquality.js only asks when the memory is empty), and the ordinary
// machinery corrects it from then on in both directions: the governor steps a
// too-high start down within seconds, and the retry tries a too-low start one
// rung higher after five walks.
//
// EVERY NUMBER HERE IS AN ESTIMATE. Nobody has measured anything but an
// iPhone 18 Pro (60 fps on HIGH, 4.6 ms of CPU a frame). The rows are a
// guess from each chip's rough single-core speed against that reading, and
// they lean low on purpose: a start one rung too low costs five walks of
// slightly plainer graphics, and a start too high costs a child's first
// impression. docs/VISUAL-PASS.md ("Measuring the iPad 7th generation") is
// the checklist for replacing the first row with a reading.
//
// The model identifier's first number is, near enough, the chip generation:
//
//   chip          identifiers                               starts on
//   A10 or older  iPad up to 7,x (iPad 6th and 7th gen,     3  LOW
//                 iPad Pro 10.5); iPhone up to 9,x
//   A11           iPhone10,x                                2
//   A12           iPad11,x (iPad 8th gen, Air 3, mini 5);   2
//                 iPhone11,x
//   A12X / A12Z   iPad8,x (iPad Pro 2018 and 2020)          1
//   A13           iPad12,x (iPad 9th gen); iPhone12,x       1
//   A14 or newer  iPad13,x and up; iPhone13,x and up        0  HIGH
//
// and one rule over all of them:
//
//   under 4 GB of memory never starts above rung 1. Rung 0 is a 2x pixel
//   ratio with a multisampled half-float composer target on top of it; on
//   a 3 GB device that is the allocation most likely to get the page killed.
//
// Anything else starts at 0, exactly as before the table existed: no profile
// (Safari, desktop), an identifier this does not recognise, a future family.
// ---------------------------------------------------------------------------
export function startRungFor(profile) {
  const p = sanitizeProfile(profile);
  if (!p) return 0;
  const family = modelFamily(p.model);
  let rung = 0;
  if (family) {
    const { kind, major } = family;
    if (kind === 'iPad') {
      if (major <= 7) rung = LOW_RUNG;
      else if (major === 8) rung = 1;
      else if (major === 11) rung = 2;
      else if (major === 12) rung = 1;
      // 9 and 10 were never used for iPads; 13 and up are A14 or newer.
    } else {
      if (major <= 9) rung = LOW_RUNG;
      else if (major <= 11) rung = 2;
      else if (major === 12) rung = 1;
    }
  }
  if (p.memoryGB !== null && p.memoryGB < UNDER_4GB) rung = Math.max(rung, 1);
  return rung;
}

// One line for the ?perf readout, or '' when there is no profile.
export function describeProfile(profile) {
  if (!profile) return '';
  const mem = profile.memoryGB === null ? '? GB' : `${profile.memoryGB} GB`;
  return `${profile.model || 'unknown model'} · ${mem} · thermal ${profile.thermal} · low power ${profile.lowPower ? 'on' : 'off'}`;
}
