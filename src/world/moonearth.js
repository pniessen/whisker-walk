// =============================================================================
// THE MOON: EARTH'S GEOGRAPHY (beauty round 3). The Earth in the sky was green polka dots on a blue ball. This is the data and the maths to draw it as the
// planet it is: coastlines of the Americas, Greenland, Europe, Africa and the western edge of Asia as lon/lat outlines (about 150 points in all, rough on
// purpose), subdivided and roughened with a seeded fractal wobble so a coast has bays and capes, then projected as a ball seen from the Atlantic (the
// Americas swing in on the sunlit side, Africa and Europe fall into the night). Pure: no THREE, no canvas, no clock, no Math.random. moonsky.js paints it.
// =============================================================================

const DEG = Math.PI / 180;

// The view: the middle of the disc is at longitude VIEW.lon, latitude VIEW.lat (a little north, so the Arctic shows).
export const VIEW = Object.freeze({ lon: -32, lat: 18 });

// Outlines as [lon, lat] pairs, clockwise-ish. Rough: each is within a few degrees of the real coast, which is all a disc 100 px wide can show.
export const COASTS = Object.freeze({
  northAmerica: [[-168, 66], [-162, 70], [-141, 70], [-125, 70], [-110, 73], [-95, 72], [-82, 69], [-80, 63], [-94, 59], [-93, 54], [-82, 53], [-79, 58], [-77, 62], [-70, 60], [-62, 57], [-56, 52], [-60, 47], [-66, 45], [-70, 43], [-76, 39], [-76, 35], [-81, 31], [-80, 26], [-82, 26], [-84, 30], [-90, 29], [-97, 27], [-97, 22], [-95, 18], [-91, 19], [-90, 21], [-87, 21], [-88, 16], [-84, 15], [-83, 10], [-80, 9], [-78, 8], [-80, 7], [-85, 10], [-92, 14], [-96, 16], [-105, 20], [-106, 23], [-112, 29], [-110, 23], [-115, 30], [-117, 33], [-121, 35], [-124, 40], [-124, 47], [-128, 51], [-133, 56], [-140, 60], [-148, 60], [-153, 57], [-160, 58], [-165, 62]],
  southAmerica: [[-78, 8], [-72, 12], [-64, 10], [-52, 5], [-50, 0], [-44, -2], [-35, -5], [-35, -9], [-39, -14], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-62, -40], [-65, -45], [-68, -50], [-69, -54], [-72, -52], [-74, -45], [-73, -37], [-71, -30], [-70, -18], [-76, -14], [-81, -6], [-80, -1], [-78, 2], [-77, 8]],
  greenland: [[-73, 78], [-60, 82], [-30, 83], [-20, 80], [-20, 70], [-30, 68], [-43, 60], [-50, 64], [-55, 70]],
  africa: [[-17, 21], [-13, 28], [-9, 32], [-6, 36], [10, 37], [11, 33], [20, 31], [32, 31], [34, 28], [38, 20], [43, 12], [51, 12], [48, 5], [40, -3], [40, -15], [35, -24], [32, -29], [27, -34], [19, -34], [14, -23], [12, -14], [9, -1], [9, 4], [3, 6], [-8, 4], [-13, 8], [-17, 14]],
  eurasia: [[-9, 37], [-9, 43], [-2, 43.5], [-4, 48], [2, 51], [8, 54], [9, 57], [11, 56], [13, 54], [20, 55], [24, 58], [22, 60], [27, 60], [30, 60], [30, 65], [22, 66], [17, 62], [18, 59], [12, 56], [8, 58], [5, 62], [14, 68], [22, 71], [30, 71], [40, 68], [60, 68], [70, 72], [85, 74], [100, 70], [100, 40], [100, 16], [98, 12], [90, 22], [80, 14], [77, 8], [73, 20], [67, 24], [61, 25], [57, 25], [56, 26], [52, 27], [48, 30], [50, 25], [56, 22], [52, 16], [45, 13], [43, 13], [39, 22], [35, 29], [34, 31], [36, 36], [29, 41], [26, 40], [23, 36], [19, 42], [16, 38], [12, 42], [8, 44], [3, 42], [0, 38], [-6, 36]],
  britain: [[-5, 50], [1, 51], [2, 53], [-2, 57], [-5, 58], [-6, 55], [-3, 53]],
  iceland: [[-24, 65], [-18, 66.5], [-14, 65], [-18, 63.5]],
  madagascar: [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
});

// Where the lands are dry or high or thick with forest: [lon, lat, radius in degrees, kind]. Painted clipped to the land.
export const LAND_TONES = Object.freeze([
  [10, 23, 17, 'desert'], [22, 22, 12, 'desert'], [44, 24, 9, 'desert'], [-8, 22, 7, 'desert'], [-68, -38, 7, 'desert'], [-110, 36, 8, 'desert'], [58, 38, 9, 'desert'],
  [-62, -5, 11, 'forest'], [22, 0, 9, 'forest'], [-84, 12, 3.5, 'forest'], [-76, 4, 4, 'forest'],
  [-70, -18, 3.4, 'peak'], [-72, -35, 3, 'peak'], [-76, -8, 3.2, 'peak'], [-112, 42, 4, 'peak'], [-118, 52, 3.5, 'peak'], [8, 46, 2.6, 'peak'], [78, 34, 6, 'peak'], [40, 8, 3.2, 'peak'],
]);

// A cheap seeded value noise on the globe's lon/lat (no random number: a hash), 0..1.
const hash = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };
export function noise2(x, y) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  const xf = x - xi; const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi); const b = hash(xi + 1, yi); const c = hash(xi, yi + 1); const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Orthographic projection of a lon/lat (degrees) to the disc: { x, y (up is +), z (> 0 faces us) }, in radii.
export function project(lon, lat, view = VIEW) {
  const l = (lon - view.lon) * DEG; const p = lat * DEG; const p0 = view.lat * DEG;
  return {
    x: Math.cos(p) * Math.sin(l),
    y: Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l),
    z: Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l),
  };
}

// The coast with bays and capes: each edge cut every `step` degrees, each point pushed about by a fractal wobble (three octaves) of up to ~amp degrees.
// Returns [lon, lat] points.
export function roughCoast(pts, { step = 1.6, amp = 1.8 } = {}) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const lon = ax + (bx - ax) * t;
      const lat = ay + (by - ay) * t;
      const w = (noise2(lon * 0.31, lat * 0.31) - 0.5) * 1.0 + (noise2(lon * 0.77 + 9, lat * 0.77) - 0.5) * 0.55 + (noise2(lon * 1.9, lat * 1.9 + 4) - 0.5) * 0.3;
      const w2 = (noise2(lon * 0.29 + 5, lat * 0.29 + 7) - 0.5) * 1.0 + (noise2(lon * 0.8, lat * 0.8 + 3) - 0.5) * 0.55;
      out.push([lon + w * amp * 2, lat + w2 * amp * 2]);
    }
  }
  return out;
}

// A coast outline ready to draw: points in disc radii (x right, y DOWN as on a canvas), those on the far side pushed out to the limb so a shape that wraps round
// the ball hugs the edge instead of cutting across it.
export function coastOutline(name, opts) {
  const lonLat = roughCoast(COASTS[name], opts);
  return lonLat.map(([lon, lat]) => {
    const p = project(lon, lat);
    if (p.z >= 0) return [p.x, -p.y];
    const m = Math.hypot(p.x, p.y) || 1;
    return [p.x / m, -p.y / m];
  });
}

// Is any of a coast on the near side?
export function coastVisible(name) {
  return COASTS[name].some(([lon, lat]) => project(lon, lat).z > -0.1);
}

// A circle of latitude (the ice cap's edge) as an outline in the same way, from lon to lon.
export function latitudeRing(lat, wobble = 2.5) {
  const out = [];
  for (let lon = -180; lon < 180; lon += 6) {
    const p = project(lon, lat + (noise2(lon * 0.2, lat) - 0.5) * wobble);
    if (p.z >= 0) out.push([p.x, -p.y]);
    else { const m = Math.hypot(p.x, p.y) || 1; out.push([p.x / m, -p.y / m]); }
  }
  return out;
}
