const KEY = 'whisker-walk-album';

export function createAlbum(storage, cap = 24) {
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

  const save = () => {
    try {
      storage.setItem(KEY, JSON.stringify({ version: 1, photos }));
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
  };
}
