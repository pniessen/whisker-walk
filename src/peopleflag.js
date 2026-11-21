// The people switch (the lifelike people, Task 9).
//
// Off by default: the new person figure (src/people/) is drawn only when the
// address ends in ?people=1, or a test calls setPeople(true).
//
// Read at call time, never at import time, like roofsflag.js and grow.js.
let forced = null;

export function peopleOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('people') === '1';
  } catch {
    return false;
  }
}

// For tests and harness pages: true or false forces it, null goes back to the
// address bar.
export function setPeople(value) {
  forced = value === null || value === undefined ? null : !!value;
}
