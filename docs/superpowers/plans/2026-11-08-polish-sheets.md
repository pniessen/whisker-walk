# polish-sheets (Pass 9, item 9-6)

Desktop (>= 1000 px) Menu sub-sheets use the width, as dusk7 did for Change place and Settings.

- `src/style.css` only, one `@media (min-width: 1000px)` block after the Change place / Settings block.
- Skills, Colony, Journal, Album and Friends sheets centre at min(1240px, 94vw) (Change place's width); the Secret code sheet is one centred 760px panel (Settings' width).
- Grids fill the width: Skills and Colony cards min 260px (3-4 across), Journal 150px, Album 220px, Friends rows two across.
- Empty states (Album, Colony, Friends) centred with a larger picture.
- Phone: every rule is inside the media query, so phone CSS is unchanged.
- No markup change: `data-sheet` on `.hb-sheet` already names each sheet.
