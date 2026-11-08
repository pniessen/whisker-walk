# polish-daylight (Pass 8, item 8-2): a clear-day grade

**Goal.** Daytime reads milky in every area: a near-white horizon, haze from 40 m, pale lime lawns. Give clear days a deeper sky, a horizon that isn't white, fog tinted toward the sky and starting farther out, and a little more contrast. 0 triangles.

**Where.** The grade lives in the clear branch of `src/weather.js` (`CLEAR_DAY_LOOK`, one table; `strength: 0` reverts it), applied to the scene `applySky()` built. `applySky()` only records the authored pair on `scene.userData.daySky`.

Why the clear branch and not `applySky()` itself: rain adjusts whatever sky it finds (fog near/far factors, greying from the entry fog colour), so changing `applySky()` would change rain. Grading only clear walks keeps rain, sunset, dusk (weather is never built on dusk) and the den (never built there) exactly as they are. The Gorge (the only non-flat ground) is skipped, so its own haze and fog stay.

**Steps.**
1. Before shots: 8 non-Gorge areas, day desk (start, start-E, first POI) and phone start; dusk Woods + Neighbourhood phone, sunset Woods + Seaside, rain River + Park phone, Gorge day.
2. `clearDaySky(top, horizon)`: HSL-deepen the top, pull the horizon toward it and darken it a little; strength scales with how pale the horizon is (Docks' grey sky gets none).
3. `applyClearDay`: graded background + fog (fog colour = horizon stop), fog 55/150, image light ×0.8, hemi fill ×0.9, exposure ×0.91 (1.1 → 1.0, via `composer.applyDayGrade`, one line in walk.js); fill and image light restored on dispose. A sky with no pale horizon (the Docks) is skipped whole.
4. Tune live on River, Moor, Neighbourhood, Park, Seaside; check horizonBand/hills still melt into the sky.
5. Tests: `test/daylight.test.js` (grade, Docks untouched, Gorge untouched, rain/sunset start from the authored day, restore on dispose). Full suite, build, flat trace sha.
6. After shots, pairs, report.
