# Split screen, S2: the camera-following systems under two views

S0 drew two views; several per-frame systems still centred on cat one's camera. S2 makes them right with the least code. Default play (no `?split=1`) is unchanged: every new path is behind a second-view flag that stays off, and start-up growth is listed below.

## Wiring (the foreman adds this after merging split-s1; `splitview.js` is not edited here)
`src/coop/splitsys.js` (lazy, imported only by `splitview.js`) exports `createSplitSys({ renderer })` -> `{ beginFrame, beforeView, afterView }` and `secondCatPos(session)`. In `splitview.js`'s `draw()`:

```js
import { createSplitSys, secondCatPos } from './splitsys.js';          // top
const sys = createSplitSys({ renderer });                               // in createSplit
const cats = [session.cat.position, secondCatPos(session) ?? session.cat.position];
sys.beginFrame(session, cams, cats);                                    // once, before the loop over views
sys.beforeView(i, cams[i], cats[i], session);                           // in the loop, before renderer.render
sys.afterView();                                                        // in the loop, after renderer.render (the last call puts everything back)
```
`tools/verify/split-s2-run.mjs` applies exactly these lines (`wired()`), runs the game, and puts the file back.

## Per system
| system | what S2 does | compromise |
|---|---|---|
| Shadows | one map per frame, refitted on the midpoint of the two views' fit centres, radius = one-view radius + half the cats' separation in LIGHT space (`shadowSplitFit`), capped at 2.5x; drawn once during view 0 (`shadowMap.autoUpdate` off, `needsUpdate` on), reused by view 1; normalBias and PCF radius scale with the texel; everything restored after view 1 | texel grows with the radius: at the 2.5x cap 4.9 cm on the high tier (2.0 cm in one view), 9.8 cm on the low tier. Past the cap (cats about 60 m+ apart along the sun axis) the edge of the box nearest the other cat loses shadows. Cats close together lose nothing. Lite rung (no shadows) and a stopped pass are left alone |
| Grass | two patches: `grass.view(i, cam)` swaps in view i's own instance buffers (made on first use; about 0.3 MB for about 3,000 tufts at high), each re-laid only when ITS cell changes (about 1/s), uFocus set per view | a second set of instance buffers while split; the extra GPU buffers are not freed until the page is (split only) |
| Clouds, stars, moon | `clouds.view(cam)` slides the cloud mesh by the camera difference (no per-instance work); `nightsky.view(cam)` re-centres the star sphere and the moon | none |
| Rain column | `weather.view(cam)` re-poses the column round the view's camera | none (puddle rings are world-fixed already) |
| Ambient (leaves, spray, motes, fluff, moths) | `ambient.setSecond(cam, catPos)`: odd particles gather round cat two with that view's lens/cat keep-clear, even ones round cat one | each half has half the density; moth lamp re-sort follows cat one only |
| Tree fade | `treeFade.setSecond(cam, look)`: a tree fades when it is in the way of EITHER cat's line | the materials are shared by both views, so a tree can be see-through in the other half when only the partner is behind it. That needs both views to see the same tree, i.e. cats close together, which is where the dynamic split would be one view anyway |
| Strip tiles ("grow" strips) | `stripTiles.setSecond(x, z)`: each tile counts as near as its nearer cat (streamer `look`) | a tile stays loaded while either cat is near |
| People (stallholders, Fairground, Market...) | `setSecondCameraAll(cam)`: detail LOD by the nearer camera, `inView` by either frustum | none |

The second-view hooks (`setSecond`) lapse by themselves 3 updates (0.5 s for strips) after the last call, so a frame that is not split needs no clean-up call. They are consumed by the main loop's own update, so they see cat two one frame late, which is invisible. Per-view hooks (`view`) are put back by the last `afterView()`, and by each system's own `update()` the next frame.

## Not done
- Area life that culls by one camera inside its own `update` (Gorge life, Fairground ride camera, house/moon/crystal lives): not touched, they follow cat one. Visible only far from cat one.
- Popup clamping in `fx.js` still uses cat one's camera (it only ever shrinks, so cat two's popups are unclamped, never wrong-sized upward).
- HUD, bloom, edge markers: unchanged from S0.

## Measured
Dev server, headless Chrome on the M2 Max, 1920x1080, `?rung=0`, vsync and frame limit off, two stand-in pads, cats walked apart (`tools/verify/split-s2-run.mjs`; second run of two in brackets; the machine was shared, so ms are indicative, draws and tris are steady). "S0" = split as merged (`--wire off`); "S2" = with `splitsys` wired.

| place | one cat | coop (shared camera) | split S0: ms / draws / tris | split S2: ms / draws / tris |
|---|---|---|---|---|
| Neighborhood | 7.8 (5.9) | 8.0 (6.3) | 7.2 / 2266 / 449k (7.7 / 2203 / 443k) | 7.2 / 1852 / 376k (7.5 / 1766 / 353k) |
| Reef | 4.2 (4.2) | 4.5 (6.3) | 4.6 / 291 / 246k (4.5 / 292 / 246k) | 4.5 / 255 / 218k (4.6 / 309 / 224k) |

The single shadow pass takes the Neighborhood from 2266 to about 1800 draws and 449k to about 360k triangles; frame time is level within noise. Cat two also casts now: a remote cat joins after the walk's caster sweep, so it never cast a shadow (the S0 "no shadow under Siamese"); `ensureCasters` sweeps it once (the Reef adds its 31 meshes' shadow draws).

Start-up: 678.3 -> 678.83 kB gz (+0.5; `test/lazybuild.test.js` is 0.1 over its 678.73 limit). It is the second-view hooks in ambient, grass and treefade (about 0.15 each); everything else is lazy. The pin needs a +0.6 history entry (scripts/recordstartup.mjs), or the hooks can move behind a lazy wrapper later.

## Tests
`test/splitcentre.test.js` (pure maths and `createSplitSys` against fakes), `test/splitsystems.test.js` (grass slots, clouds shift, tree fade union, strip streaming, ambient density, rain pose). Pictures: `tools/verify/split-s2-contact.png`; driver `tools/verify/split-s2-run.mjs`.
