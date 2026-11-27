// The 2026 season edges on the device clock (H8): Winter Lights and Christmas open 1 Dec, Hanukkah's first night is Fri 4 Dec,
// its eighth Sat 12 Dec, Christmas ends 26 Dec. Dates are the device's local calendar, so each edge is checked just after local
// midnight and just before the next one, in three time zones (a phone and a tablet need not share one).
import { describe, it, expect, afterAll } from 'vitest';
import { activeHolidays, nightOf, setHolidayOverride } from '../src/holidays.js';

setHolidayOverride(null);
const realTZ = process.env.TZ;
afterAll(() => { if (realTZ === undefined) delete process.env.TZ; else process.env.TZ = realTZ; });

const EDGES = [
  // [month, day, holidays on, night]
  [11, 30, [], 0],
  [12, 1, ['winter', 'christmas'], 0],
  [12, 3, ['winter', 'christmas'], 0],
  [12, 4, ['winter', 'christmas', 'hanukkah'], 1],
  [12, 12, ['winter', 'christmas', 'hanukkah'], 8],
  [12, 13, ['winter', 'christmas'], 0],
  [12, 26, ['winter', 'christmas'], 0],
  [12, 27, ['winter'], 0],
];

for (const tz of ['America/New_York', 'Europe/London', 'Pacific/Auckland']) {
  describe(`season edges, device clock in ${tz}`, () => {
    for (const [m, d, on, night] of EDGES) {
      it(`${d} ${m === 11 ? 'Nov' : 'Dec'} 2026: ${on.join(', ') || 'nothing'}, night ${night}`, () => {
        process.env.TZ = tz;
        for (const [h, mi] of [[0, 0], [12, 0], [23, 59]]) {
          const now = new Date(2026, m - 1, d, h, mi);
          expect(activeHolidays(now), `${h}:${mi}`).toEqual(on);
          expect(nightOf(now), `${h}:${mi}`).toBe(night);
        }
      });
    }
  });
}
