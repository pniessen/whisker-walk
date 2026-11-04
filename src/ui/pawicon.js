// The paw icon for dark pills and buttons. Apple's 🐾 emoji is near-black, so
// on a dark disc or pill it all but vanishes. The span keeps the emoji as its
// text (a fallback, and what a test or a copy sees), and style.css draws a
// light paw in the surrounding text colour over it where masks are supported.
// aria-hidden: the words beside it (or the button's aria-label) are the name.
export const PAW = '<span class="paw" aria-hidden="true">🐾</span>';
