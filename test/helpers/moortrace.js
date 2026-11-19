import { traceAsRecorded, recordedGameplay } from './flattrace.js';

// Bigger areas, step 3: the recorded walk on the Moor, for a test to run with
// the switch off or on (test/growtrace.moor.off.test.js,
// test/growtrace.moor.on.test.js).
//
// The walk is test/helpers/flattrace.js's driver, the one test/flattrace.test.js
// holds to test/fixtures/flat-trace.gameplay.json (frozen). This file carried a
// copy of that driver until the trace split (2026-11-19). The Moor is traced
// in order (the maps before it first, switch off, thrown away) so the driver
// can pin the Moor build's Math.random draw count, which the switch-on test
// relies on: with the strip there the build takes the same draws.
export const moorTraceAsRecorded = (on) => traceAsRecorded('moor', { grow: on, inOrder: true }).gameplay;

export const recordedMoor = () => recordedGameplay('moor');
