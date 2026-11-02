import { describe, it, expect } from 'vitest';
import { CLAN_COLOURS } from '../src/clancast.js';
import { LAND } from '../src/territories.js';
import { CAMP_MARK } from '../src/ui/territorymap.js';

// Polish 2, item 2: every clan's camp mark reads on its own region. DuskClan's
// #35584a dome on the Pines' #6e9d78 green was nearly invisible (contrast
// about 2.3:1 at a 30-unit dome). Each dome now sits on a light badge with a
// dark edge, and the mine/ally rings carry a dark edge too, so the dome reads
// against the badge and the badge and rings read against any land.

function lum(hex) {
  const v = parseInt(hex.slice(1), 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('camp marks on the territory map', () => {
  for (const [clan, colour] of Object.entries(CLAN_COLOURS)) {
    it(`${clan}'s dome (${colour}) stands out from its badge`, () => {
      expect(contrast(colour, CAMP_MARK.badge)).toBeGreaterThanOrEqual(3);
    });
    it(`${clan}'s badge edge stands out from its own land (${LAND[clan]})`, () => {
      expect(contrast(CAMP_MARK.edge, LAND[clan])).toBeGreaterThanOrEqual(3);
    });
    it(`the mine and ally rings have an edge that reads on ${clan}'s land`, () => {
      expect(contrast(CAMP_MARK.ringEdge, LAND[clan])).toBeGreaterThanOrEqual(3);
      // and the gold and white rings themselves read against that edge
      expect(contrast(CAMP_MARK.mine, CAMP_MARK.ringEdge)).toBeGreaterThanOrEqual(3);
      expect(contrast(CAMP_MARK.ally, CAMP_MARK.ringEdge)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('camp mark markup', async () => {
  const { renderTerritoryMapHtml } = await import('../src/ui/territorymap.js');
  it('draws ring edge, ring, badge, then the dome, in that order', () => {
    // A hand-built model region is enough: campHtml only reads r.camp.
    const html = renderTerritoryMapHtml({
      regions: [{ id: 'pines', x: 300, y: 200, r: 120, status: 'built', areaId: 'pines', name: 'Pines', line: '',
        camp: { x: 300, y: 200, color: CLAN_COLOURS.pines, mine: true, ally: false } }],
      river: [[0, 0], [10, 10], [20, 0]], lake: [[0, 0], [10, 10], [20, 0]], pond: { x: 0, y: 0, r: 1 },
      paths: {}, bridge: [[0, 0], [1, 1]], island: { status: 'soon', outline: [[0, 0], [1, 1], [2, 0]], name: 'i', line: '' },
      star: { x: 0, y: 0 },
    });
    const g = html.slice(html.indexOf('<g class="tm-camp'));
    const order = ['tm-camp-ring-edge', 'tm-camp-ring"', 'tm-camp-badge', 'tm-camp-dome'].map((c) => g.indexOf(c));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(g).toContain(`stroke="${CAMP_MARK.mine}"`);
  });
});
