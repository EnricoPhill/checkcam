const CACHE_NAME = 'checkcam-v7-shell-1';
const APP_SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const DB_NAME = 'checkcam-db';
const DB_VERSION = 1;
const PENDING_STORE = 'pending';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('checkcam-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((res) => res || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
      return res;
    }))
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'checkcam-sync') event.waitUntil(syncPendingRecords());
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PENDING_STORE)) db.createObjectStore(PENDING_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllPending() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readonly');
    const req = tx.objectStore(PENDING_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function removePending(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readwrite');
    tx.objectStore(PENDING_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function syncPendingRecords() {
  const items = (await getAllPending()).sort((a, b) => String(a.record?.capturedAt || '').localeCompare(String(b.record?.capturedAt || '')));
  for (const item of items) {
    if (!item.endpoint || !item.record) continue;
    const body = new URLSearchParams();
    Object.entries(item.record).forEach(([key, value]) => {
      if (value !== undefined && value !== null) body.append(key, String(value));
    });
    await fetch(item.endpoint, { method: 'POST', mode: 'no-cors', body, cache: 'no-store' });
    await removePending(item.id);
  }
}
