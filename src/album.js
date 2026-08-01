const KEY = 'whisker-walk-album';
const ALBUM_VERSION = 1;

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

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

// A single photo entry from an untrusted (cloud-loaded) payload: homebase
// interpolates thumb/label/area into innerHTML, so anything not shaped
// like a real snapshot is dropped. `thumb` MUST be a data:image/ URI — the
// only thing the in-game camera flow (main.js's canvas.toDataURL) ever
// produces — which also rules out an attribute-breakout/XSS payload there.
function sanitizePhoto(p) {
  if (!isPlainObject(p)) return null;
  if (typeof p.key !== 'string' || !p.key) return null;
  if (typeof p.thumb !== 'string' || !p.thumb.startsWith('data:image/')) return null;
  return {
    key: p.key,
    label: typeof p.label === 'string' ? p.label.slice(0, 80) : '',
    area: typeof p.area === 'string' ? p.area.slice(0, 80) : '',
    thumb: p.thumb,
  };
}

// Sanitizes + caps a raw album payload before it's ever written to
// storage — used by replaceFromPayload (cloud "Load from cloud") so a
// hostile or malformed payload can neither inject markup nor blow past
// the album cap.
function sanitizeAlbumPayload(rawAlbumObject, cap) {
  const list = isPlainObject(rawAlbumObject) && Array.isArray(rawAlbumObject.photos) ? rawAlbumObject.photos : [];
  const photos = list.map(sanitizePhoto).filter(Boolean);
  // keep the newest `cap` entries — same "oldest rotates out first"
  // convention add() uses.
  const capped = photos.length > cap ? photos.slice(photos.length - cap) : photos;
  return { version: ALBUM_VERSION, photos: capped };
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
    // sanitizes + caps the raw (untrusted) object, writes THAT to storage
    // under the album key, then reloads live state through the same
    // loadPhotos() the constructor uses.
    replaceFromPayload(rawAlbumObject) {
      const sanitized = sanitizeAlbumPayload(rawAlbumObject, cap);
      try {
        storage.setItem(KEY, JSON.stringify(sanitized));
      } catch (err) {
        console.warn('Whisker Walk: could not write cloud album', err);
      }
      photos = loadPhotos(storage);
    },
  };
}
