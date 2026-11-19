import { traceAsRecorded, recordedGameplay } from './flattrace.js';

// Bigger areas, step 3: the recorded walk on the Woods, for a test to run with
// the switch off or on (test/woodsgrowtrace.off.test.js,
// test/woodsgrowtrace.on.test.js).
//
// The walk is test/helpers/flattrace.js's driver, the one test/flattrace.test.js
// holds to test/fixtures/flat-trace.gameplay.json (frozen). This file carried a
// copy of that driver until the trace split (2026-11-19); every mover has a
// stream of its own now, so the Woods is traced alone and only its gameplay
// part is compared.
export const woodsTraceAsRecorded = (on) => traceAsRecorded('woods', { grow: on }).gameplay;

export const recordedWoods = () => recordedGameplay('woods');
