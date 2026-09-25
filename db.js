const DB_NAME = 'xau-library';
const DB_VERSION = 1;
const request = indexedDB.open(DB_NAME, DB_VERSION);
request.onupgradeneeded = () => {
  const db = request.result;
  if (!db.objectStoreNames.contains('setups')) db.createObjectStore('setups', { keyPath: 'id' });
};
export const database = new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function allSetups() {
  const db = await database;
  return new Promise((resolve, reject) => {
    const req = db.transaction('setups').objectStore('setups').getAll();
    req.onsuccess = () => resolve(req.result.sort((a,b) => b.capturedAt.localeCompare(a.capturedAt)));
    req.onerror = () => reject(req.error);
  });
}
export async function saveSetup(setup) {
  const db = await database;
  return new Promise((resolve,reject) => {
    const tx = db.transaction('setups','readwrite'); tx.objectStore('setups').put(setup);
    tx.oncomplete = () => resolve(setup); tx.onerror = () => reject(tx.error);
  });
}
export async function removeSetup(id) {
  const db = await database;
  return new Promise((resolve,reject) => { const tx=db.transaction('setups','readwrite'); tx.objectStore('setups').delete(id); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); });
}
export async function replaceAll(setups) {
  const db = await database;
  return new Promise((resolve,reject) => {
    const tx=db.transaction('setups','readwrite'); const store=tx.objectStore('setups'); store.clear(); setups.forEach(s=>store.put(s));
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error || new Error('Restore failed'));
  });
}
