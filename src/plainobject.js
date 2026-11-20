// The one shared "is this a plain object?" guard for untrusted input (saves,
// cloud payloads). Pure and zero-import, so any module may import it without
// creating a cycle.
//
// "Plain" here means a non-null, non-array object. It deliberately does NOT
// check the prototype: null-prototype objects (Object.create(null)), class
// instances and objects from another realm all count, and functions and
// primitives do not. JSON.parse only ever yields literals and arrays, so this
// is exactly the check the loaders need.
export function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
