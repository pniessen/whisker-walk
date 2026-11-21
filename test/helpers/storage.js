// The fake localStorage the tests share: a Map behind getItem and setItem.
//
// memoryStorage(initial, options)
//   initial: an object of starting keys and values.
//   options.removeItem: true adds removeItem(k), which deletes the key; left
//     out, the storage has none, as most files' old copies had none.
//   options.expose: 'map' (or 'm') also returns the underlying Map under that
//     property name, for the files that peek at what was stored.
// Nothing else is added: no vi.fn spies, no dump, no write counter.
export function memoryStorage(initial = {}, { removeItem = false, expose } = {}) {
  const map = new Map(Object.entries(initial));
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
  if (removeItem) storage.removeItem = (k) => { map.delete(k); };
  if (expose) storage[expose] = map;
  return storage;
}
