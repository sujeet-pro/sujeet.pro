/**
 * Graph-index cache helper (Stage 3.2, P12).
 *
 * Default path: `<meta name="sp-graph-url">` (content-hashed URL) → in-memory promise → `fetch(…, { cache: 'default' })`,
 * so the browser HTTP cache revalidates with ETag/304.
 *
 * Opt-in (`spConfig.features.indexedDbCache`): IndexedDB `sp-v8-idb`, store `blobs`, key = graph hash.
 * A hit is returned directly; a miss fetches over HTTP and writes the blob in one transaction that also deletes
 * every other key (atomic swap). Any IDB error or `onblocked` falls back to the HTTP path.
 *
 * Stale tab after a deploy (GitHub Pages deletes old hashed files): a 404 triggers one retry after re-reading the
 * meta tag; if the live meta still names the same URL, the current document is re-fetched (no-store) to discover
 * the new hashed URL.
 */
import { spConfig } from '../../../sp.config.ts';
import type { GraphIndex } from '../graph/types';

const META_SELECTOR = 'meta[name="sp-graph-url"]';
const STORE = 'blobs';

let memo: { url: string; promise: Promise<GraphIndex> } | null = null;

function readMetaUrl(doc: Document = document): string {
  return doc.querySelector<HTMLMetaElement>(META_SELECTOR)?.content ?? '';
}

function hashOf(url: string): string | null {
  return /graph-index\.([0-9a-f]+)\.json/.exec(url)?.[1] ?? null;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, url: string) {
    super(`[graph-index] HTTP ${status} for ${url}`);
    this.status = status;
  }
}

async function fetchJson(url: string): Promise<GraphIndex> {
  const res = await fetch(url, { cache: 'default', credentials: 'same-origin' });
  if (!res.ok) throw new HttpError(res.status, url);
  return (await res.json()) as GraphIndex;
}

/** Re-discover the current hashed URL: live meta first, then a fresh copy of this page. */
async function rediscoverUrl(staleUrl: string): Promise<string | null> {
  const live = readMetaUrl();
  if (live && live !== staleUrl) return live;
  try {
    const res = await fetch(location.pathname, { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return null;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const fresh = readMetaUrl(doc);
    if (!fresh || fresh === staleUrl) return null;
    // Keep the live document consistent for later readers.
    document.querySelector<HTMLMetaElement>(META_SELECTOR)?.setAttribute('content', fresh);
    return fresh;
  } catch {
    return null;
  }
}

async function fetchWithRetry(url: string): Promise<{ url: string; index: GraphIndex }> {
  try {
    return { url, index: await fetchJson(url) };
  } catch (err) {
    if (!(err instanceof HttpError) || err.status !== 404) throw err;
    const next = await rediscoverUrl(url);
    if (!next) throw err;
    return { url: next, index: await fetchJson(next) };
  }
}

// ---------------------------------------------------------------------------
// IndexedDB (opt-in)
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(spConfig.idbName, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<GraphIndex | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as GraphIndex | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** One transaction: write the new blob and delete every other key (atomic swap). */
function idbSwap(db: IDBDatabase, key: string, value: GraphIndex): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      for (const k of keysReq.result) if (k !== key) store.delete(k);
      store.put(value, key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function loadViaIdb(url: string): Promise<GraphIndex> {
  const key = hashOf(url);
  let db: IDBDatabase;
  try {
    if (!key) throw new Error('unhashed graph URL');
    db = await openDb();
  } catch {
    return (await fetchWithRetry(url)).index;
  }
  try {
    const hit = await idbGet(db, key!);
    if (hit && hit.graphHash === key) return hit;
  } catch {
    /* fall through to HTTP */
  }
  const fresh = await fetchWithRetry(url);
  const freshKey = hashOf(fresh.url);
  if (freshKey) idbSwap(db, freshKey, fresh.index).catch(() => {});
  return fresh.index;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the structural graph index for the current page. Concurrent and repeat callers share one promise per URL;
 * a rejected load is forgotten so the next call retries.
 */
export function getGraphIndex(): Promise<GraphIndex> {
  const url = readMetaUrl();
  if (!url) return Promise.reject(new Error('[graph-index] <meta name="sp-graph-url"> is missing'));
  if (memo && memo.url === url) return memo.promise;
  const promise = (spConfig.features.indexedDbCache ? loadViaIdb(url) : fetchWithRetry(url).then((r) => r.index)).catch(
    (err: unknown) => {
      if (memo?.promise === promise) memo = null;
      throw err;
    },
  );
  memo = { url, promise };
  return promise;
}
