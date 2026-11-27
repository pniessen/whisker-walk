// DEFAULT: OFF (a build constant: true only in the private family build, vite --mode family).
// Whether this is the private family build (vite --mode family, vite.config.js). A literal false in
// every other build (the define), so what hangs on it is dropped from the public bundle; in plain
// Node, where nothing defines it, it reads false. Holds no family data: only the flag.
export const IS_FAMILY = typeof __PRIVATE_FAMILY__ !== 'undefined' && __PRIVATE_FAMILY__ === true;
