/* ─────────────────────────────────────────────────────
   Service Worker — Семейный бюджет v1.2
   Handles: notification display + click routing
───────────────────────────────────────────────────── */
const APP_URL = '/budget/';

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(clients.claim()));

/* Show notification triggered from main thread */
self.addEventListener('message', event => {
  const msg = event.data;
  if (!msg || msg.type !== 'NOTIFY') return;
  self.registration.showNotification(msg.title, {
    body:    msg.body,
    icon:    APP_URL + 'icon.svg',
    tag:     msg.tag  || 'budget-default',
    renotify: !!msg.renotify,
    data:    { url: APP_URL },
    vibrate: [180, 80, 180],
  });
});

/* Tap on notification → open/focus app */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      for (const c of cls) {
        if (c.url.includes('/budget') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(event.notification.data?.url || APP_URL);
    })
  );
});

/* Periodic background sync (Android Chrome only, when installed as PWA) */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'budget-check') {
    event.waitUntil(backgroundCheck());
  }
});

async function backgroundCheck() {
  /* Read stored notification jobs from IndexedDB and fire due ones.
     Main thread writes jobs; SW reads them here. */
  try {
    const db = await openIDB();
    const jobs = await getAllJobs(db);
    const now  = Date.now();
    for (const job of jobs) {
      if (job.fireAt <= now) {
        await self.registration.showNotification(job.title, {
          body:    job.body,
          icon:    APP_URL + 'icon.svg',
          tag:     job.tag,
          data:    { url: APP_URL },
          vibrate: [180, 80, 180],
        });
        await deleteJob(db, job.id);
      }
    }
  } catch(e) { /* silent */ }
}

/* ── Tiny IndexedDB helpers ──────────────────────── */
function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('budget-notif', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('jobs', {keyPath:'id',autoIncrement:true});
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e);
  });
}
function getAllJobs(db) {
  return new Promise((res,rej) => {
    const tx  = db.transaction('jobs','readonly');
    const req = tx.objectStore('jobs').getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = e  => rej(e);
  });
}
function deleteJob(db, id) {
  return new Promise((res,rej) => {
    const tx  = db.transaction('jobs','readwrite');
    const req = tx.objectStore('jobs').delete(id);
    req.onsuccess = () => res();
    req.onerror   = e  => rej(e);
  });
}
