import { getOfflineEbook, saveOfflineEbook } from "./opfs";

const MEMORY_CACHE = new Map<string, ArrayBuffer>();

const IDB_NAME = "audioneko_epub_cache";
const IDB_STORE = "epubs";
const IDB_VERSION = 1;

function openEpubIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getIdbEpub(bookId: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openEpubIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(bookId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setIdbEpub(bookId: string, data: ArrayBuffer): Promise<void> {
  try {
    const db = await openEpubIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(data, bookId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Non-fatal if IndexedDB storage fails
  }
}

/**
 * Loads an EPUB ArrayBuffer for a book, checking Memory -> OPFS -> IndexedDB -> Network.
 * Automatically caches fetched bytes locally for offline and fast repeat access.
 */
export async function loadBookEpub(
  bookId: string,
  onProgress?: (percent: number) => void,
): Promise<ArrayBuffer> {
  // 1. In-memory hot cache
  if (MEMORY_CACHE.has(bookId)) {
    onProgress?.(100);
    return MEMORY_CACHE.get(bookId)!;
  }

  // 2. OPFS offline storage
  try {
    const opfsBlob = await getOfflineEbook(bookId);
    if (opfsBlob && opfsBlob.size > 0) {
      const buffer = await opfsBlob.arrayBuffer();
      MEMORY_CACHE.set(bookId, buffer);
      onProgress?.(100);
      return buffer;
    }
  } catch {}

  // 3. IndexedDB cache
  const idbBuffer = await getIdbEpub(bookId);
  if (idbBuffer && idbBuffer.byteLength > 0) {
    MEMORY_CACHE.set(bookId, idbBuffer);
    onProgress?.(100);
    return idbBuffer;
  }

  // 4. Fetch over network from streaming edge proxy
  onProgress?.(10);
  const res = await fetch(`/api/books/${bookId}/ebook`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Failed to load e-book: HTTP ${res.status} ${res.statusText}`);
  }

  const contentLength = Number(res.headers.get("content-length")) || 0;
  let buffer: ArrayBuffer;

  if (res.body && contentLength > 0) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        const pct = Math.min(95, Math.round((receivedBytes / contentLength) * 100));
        onProgress?.(pct);
      }
    }

    const merged = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    buffer = merged.buffer;
  } else {
    buffer = await res.arrayBuffer();
  }

  onProgress?.(100);

  // Cache in memory and persistence layers in background
  MEMORY_CACHE.set(bookId, buffer);
  setIdbEpub(bookId, buffer).catch(() => {});
  saveOfflineEbook(bookId, buffer).catch(() => {});

  return buffer;
}
