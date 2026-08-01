const KEY = 'whisker-walk-album';
const ALBUM_VERSION = 1;

// Shared by createAlbum's initial load AND replaceFromPayload below — a
// cloud-loaded payload reads through the exact same parse path as a normal
// boot instead of duplicating the "is this shape sane" check.
function loadPhotos(storage) {
  let photos = [];
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.photos)) photos = parsed.photos;
    }
  } catch (err) {
    console.warn('Whisker Walk: could not read album, starting empty', err);
  }
  return photos;
}

export function createAlbum(storage, cap = 24) {
  let photos = loadPhotos(storage);

  const save = () => {
    try {
      storage.setItem(KEY, JSON.stringify({ version: ALBUM_VERSION, photos }));
    } catch (err) {
      console.warn('Whisker Walk: could not save album', err);
    }
  };

  return {
    get photos() {
      return photos;
    },
    has(key) {
      return photos.some((p) => p.key === key);
    },
    add(photo) {
      const first = !this.has(photo.key);
      photos.push(photo);
      while (photos.length > cap) photos.shift();
      save();
      return first;
    },
    clear() {
      photos = [];
      save();
    },
    // serialize() — the exact shape persisted to storage; used by main.js
    // to compose the { save, album } cloud payload.
    serialize() {
      return { version: ALBUM_VERSION, photos };
    },
    // replaceFromPayload(rawAlbumObject) — used by cloud "Load from cloud":
    // writes the raw object straight to storage under the album key, then
    // reloads live state through the same loadPhotos() the constructor uses.
    replaceFromPayload(rawAlbumObject) {
      try {
        storage.setItem(KEY, JSON.stringify(rawAlbumObject));
      } catch (err) {
        console.warn('Whisker Walk: could not write cloud album', err);
      }
      photos = loadPhotos(storage);
    },
  };
}
