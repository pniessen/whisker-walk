import { traceAsRecorded, recordedGameplay } from './flattrace.js';

// Bigger areas, step 1: the recorded walk on the River, for a test to run with
// the switch off or on (test/growtrace.off.test.js, test/growtrace.on.test.js).
//
// The walk is test/helpers/flattrace.js's driver, the one test/flattrace.test.js
// holds to test/fixtures/flat-trace.gameplay.json (frozen). Until review S2
// (2026-11-19) this file carried a copy of that driver and traced the five maps
// before the River first, because the movers drew from the Math.random that
// THREE's uuids draw from. Every mover has a stream of its own now and no
// gameplay value reads Math.random (test/flattrace.test.js proves it), so the
// River is traced alone, and only its gameplay part is compared.
export const riverTraceAsRecorded = (on) => traceAsRecorded('river', { grow: on }).gameplay;

export const recordedRiver = () => recordedGameplay('river');
