// Einstellungen (localStorage) und Dokumente (IndexedDB, mit Rückfall auf localStorage).
import { DEFAULT_SETTINGS } from './defs.js';

const KEY = 'zd.settings';

function merge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (over && typeof over === 'object') for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
    return out;
  }
  return over === undefined || over === null ? base : over;
}

export function loadSettings() {
  try { return merge(DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return merge(DEFAULT_SETTINGS, {}); }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.warn(e); }
}

let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) { reject(new Error('kein IndexedDB')); return; }
      const req = indexedDB.open('zetteldruck', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('docs', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => { console.warn('IndexedDB nicht verfügbar, nutze localStorage', e); return null; });
  }
  return dbp;
}
function tx(mode, fn) {
  return db().then((d) => {
    if (!d) return fallback(mode, fn);
    return new Promise((resolve, reject) => {
      const t = d.transaction('docs', mode);
      const req = fn(t.objectStore('docs'));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
    });
  });
}
// Rückfall: alle Dokumente in einem localStorage-Eintrag
function fallback(mode, fn) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem('zd.docs') || '{}'); } catch (e) { /* leer */ }
  const store = {
    getAll: () => ({ result: Object.values(all) }),
    get: (id) => ({ result: all[id] }),
    put: (doc) => { all[doc.id] = doc; localStorage.setItem('zd.docs', JSON.stringify(all)); return {}; },
    delete: (id) => { delete all[id]; localStorage.setItem('zd.docs', JSON.stringify(all)); return {}; },
  };
  return fn(store)?.result;
}

export async function listDocs() {
  const all = (await tx('readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
}
export const getDoc = (id) => tx('readonly', (s) => s.get(id));
export const putDoc = (doc) => tx('readwrite', (s) => s.put(JSON.parse(JSON.stringify(doc))));
export const deleteDoc = (id) => tx('readwrite', (s) => s.delete(id));

export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
