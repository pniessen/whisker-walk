# polish-foliage (Pass 8, build 8-4)

Survey 8 ranked #5, broken #2 and #3. Render-only, 0 triangles added.

1. **Soft canopy facets.** `canopyGeometry()` keeps its positions (silhouette, occluder, crown-on-trunk tests unchanged) but each vertex normal is blended from the flat facet normal toward a rounded normal (the lobe's smooth normal mixed with the direction out from the crown centre): `CANOPY_SOFT`, `CANOPY_RADIAL`. The per-facet shade narrows (0.86–1.0 → 0.9–1.0) and down-facing faces take a little AO by vertex colour.
2. **Leafy bushes.** The "green faceted rocks" by the Woods paths (survey `w-woods-day-desk-04/06-poi`) are not `bush()` at all: a raycast names the Woods' `brambles` mesh (`brambleBed()`, 20-triangle icosahedron lobes, one flat colour). Ruling: `brambleBed()` is unowned by any Pass 8 build, so 8-4 takes it: corners nudged ±10% (keyed on the corner, no cracks), normals 65% round, vertex colours dark low / light yellower top, a shade per lobe and a per-facet mottle. Same geometries in the same order (uuid draws), same triangles. `bush()`'s leaf-cluster shrub already reads as a shrub (smooth indexed normals, light tips, dark core): left as is.
3. **No trunk cap.** Non-birch trunks become open-ended cylinders (the top is always inside the crown, the foot in the ground): no brown disc when the camera is inside a crown; −20 triangles a tree; same uuid draws.
4. Willow untouched (`irregularLobe`/`blobGeometry` unchanged).

Checks: full suite, build, flat trace sha, tris6 for Woods/Park/River/Neighbourhood/Pines/Moor/den, before/after pairs (desk + phone) and the willow probe.
