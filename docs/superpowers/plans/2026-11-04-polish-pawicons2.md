# polish-pawicons2 (Build 5-4)

Plan: replace the last dark Apple paw emoji with the light PAW span.
1. Add `pawify()` to ui/pawicon.js for already-escaped text.
2. Markup: homebase rank line, screencards tile, denshop pill/buttons, colonypanel (header, where, news, start buttons), celebrate card, fightui (challenge button, sheet line).
3. fx.js: floater canvas draws five ellipse pads instead of the emoji (`drawFloaterText`).
4. Tests updated to the span; new tests for no bare emoji and the canvas paw.
5. walk.js untouched (polish-roughedges owns its summary paw lines); main.js passes `+N 🐾` text which fx.js now draws as a shape.
