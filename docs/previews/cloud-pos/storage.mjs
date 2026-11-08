import { emptyState } from './core.mjs';
export function openStore(indexedDB = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('minarva-html-pos-v2', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspaces');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
export function transact(db, key, mutate) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspaces', 'readwrite'), store = tx.objectStore('workspaces');
    let result, failure;
    const request = store.get(key);
    request.onsuccess = () => {
      try {
        result = request.result || { data: emptyState(), revision: 0, dirty: false, operation: null, conflict: false };
        if (mutate) { mutate(result); store.put(result, key); }
      } catch (err) { failure = err; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('Local save failed.'));
  });
}
// Persist an immutable in-flight snapshot before sending; further local edits are blocked
// until its outcome is acknowledged. Retry always reuses the same operation UUID.
export async function synchronize(db, key, remote, uuid = () => crypto.randomUUID()) {
  const local = await transact(db, key, s => {
    if (s.conflict) throw new Error('Cloud conflict: export local data, then review/reload cloud.');
    if (s.dirty && !s.operation) s.operation = { id: uuid(), revision: s.revision, data: structuredClone(s.data) };
  });
  if (!local.operation) {
    const cloud = await remote.read();
    return transact(db, key, s => {
      if (s.dirty || s.operation) return; // A local edit occurred during fetch.
      s.data = cloud?.data || emptyState(); s.revision = cloud?.revision || 0;
    });
  }
  let result;
  try { result = await remote.write(local.operation); }
  catch (err) {
    if (err.code === '40001') await transact(db, key, s => { s.conflict = true; });
    throw err;
  }
  return transact(db, key, s => {
    if (!s.operation && !s.dirty && s.revision >= result) return; // Another tab already acknowledged this operation.
    if (s.operation?.id !== local.operation.id) throw new Error('Local operation changed unexpectedly.');
    s.revision = result; s.dirty = false; s.operation = null;
  });
}
