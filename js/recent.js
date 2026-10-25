const DB_NAME = 'kadar-local-work';
const STORE_NAME = 'sessions';
const SESSION_ID = 'recent-edit';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Local browser storage is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRecentEdit(photos, index) {
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).put({
        id: SESSION_ID,
        updatedAt: Date.now(),
        index,
        photos: photos.map(photo => ({
          name: photo.name,
          type: photo.file.type,
          lastModified: photo.file.lastModified,
          width: photo.w,
          height: photo.h,
          blob: photo.file,
          adjustments: photo.adjustments,
        })),
      });
      request.onerror = () => reject(request.error);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function loadRecentEdit() {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(SESSION_ID);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
