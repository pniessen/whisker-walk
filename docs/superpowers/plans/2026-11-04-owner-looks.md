# Owner looks: cape throat clasp, wings up (2026-11-04)

Branch `owner-looks` from main 4f31362. Owner rulings of 2026-11-04:

1. **Capes fasten at the throat.** The two shoulder brooches go. The cape's two
   front edges run from the shoulders to the front of the neck, under the chin,
   where one gold clasp pins them. Never in the chest or the head, any pose, any
   breed (Hagrid wears no cape). Coexists with collars and neck items.
2. **Wings stand up.** Butterfly wings stand up off the back, spread like a
   resting butterfly's raised wings, seen from the walk camera behind and in the
   dressing room. Keep the flutter, the reducedMotion stillness, the sit stand,
   nothing dipping into the back. Hood stays always down.

## Design

- **Clasp + front bands = one vertex-coloured mesh on the body** (`userData.capeClasp`),
  re-laid every frame (`cape.js layCapeTie`, called from `animator.js` after `fitNeck`
  and once at build). The clasp rides the neck exactly as the collar's charm does
  (same head-frame spot, same `neckMove` carry, head-locked in the stretch and the swim),
  so it is at the throat in every pose. Each band is a ribbon from the cape's neck edge
  at the front of the shoulder (cloth point, body frame) to the clasp's side, bowed out
  from the chest centre so it lies clear of the fur. Mesh count unchanged (cloth + clasp).
- **Throat already taken** (a collar charm — bell, heart, tag, sparkle star — or any
  neck-slot item): no gold clasp; the bands still meet at the throat, under that item.
- **Wings**: `WINGS` re-aimed — forewing spokes raised toward upright, `lean` near 0
  (no tilt toward the tail), `sweep` up a little so the side view still sees a face.

## Tasks (TDD)

1. Wings up: test (hinge within 20° of vertical standing and sitting, top not behind
   the root, ≥ 0.18 above the back) → retune `WINGS` → existing wing tests green.
2. Throat clasp: tests (one clasp at the throat, outside fur and head in the full
   sweep, bands from the shoulders to the clasp outside fur/head, hidden under a charm
   or neck item, mesh counts) → `cape.js` tie geometry + `layCapeTie`, `model.js`
   `capeOn`, `animator.js` per-frame lay → full cape tests green.
3. catgolden regenerate (documented path) only if cape/wing entries move; confirm only
   those keys moved. Flat trace must stay 3dfb11a4…d838.
4. Live shots before/after, pairs; opus whole-branch review; merge main; suite + build.
