export interface BookmarkItem {
  id: string;
  bookId: string;
  positionSeconds: number;
  chapterTitle?: string | null;
  note?: string | null;
  createdAt: number;
}

const STORAGE_PREFIX = "audioneko_bm_";
const PENDING_QUEUE_KEY = "audioneko_pending_bm_creations";
const PENDING_DELETIONS_KEY = "audioneko_pending_bm_deletions";

interface PendingCreation {
  tempId: string;
  bookId: string;
  positionSeconds: number;
  chapterTitle?: string;
  note?: string;
  createdAt: number;
}

function getLocalBookmarks(bookId: string): BookmarkItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${bookId}`);
    return raw ? (JSON.parse(raw) as BookmarkItem[]) : [];
  } catch {
    return [];
  }
}

function setLocalBookmarks(bookId: string, items: BookmarkItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${bookId}`, JSON.stringify(items));
  } catch {
    // Storage quota fallback
  }
}

function getPendingCreations(): PendingCreation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as PendingCreation[]) : [];
  } catch {
    return [];
  }
}

function setPendingCreations(items: PendingCreation[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Storage quota fallback
  }
}

function getPendingDeletions(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_DELETIONS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function setPendingDeletions(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify(ids));
  } catch {
    // Storage quota fallback
  }
}

export async function fetchBookmarksForBook(bookId: string): Promise<BookmarkItem[]> {
  const localItems = getLocalBookmarks(bookId);
  const isOnline = typeof navigator === "undefined" || navigator.onLine;

  if (!isOnline) {
    return localItems.sort((a, b) => a.positionSeconds - b.positionSeconds);
  }

  try {
    const res = await fetch(`/api/bookmarks/${bookId}`);
    if (!res.ok) {
      return localItems.sort((a, b) => a.positionSeconds - b.positionSeconds);
    }

    const data = (await res.json()) as { bookmarks: BookmarkItem[] };
    const serverBookmarks = data.bookmarks || [];

    // Keep any pending local creations that haven't synced yet
    const pending = getPendingCreations().filter((p) => p.bookId === bookId);
    const combined: BookmarkItem[] = [...serverBookmarks];

    for (const p of pending) {
      if (!combined.some((b) => b.id === p.tempId)) {
        combined.push({
          id: p.tempId,
          bookId: p.bookId,
          positionSeconds: p.positionSeconds,
          chapterTitle: p.chapterTitle,
          note: p.note,
          createdAt: p.createdAt,
        });
      }
    }

    combined.sort((a, b) => a.positionSeconds - b.positionSeconds);
    setLocalBookmarks(bookId, combined);
    return combined;
  } catch {
    return localItems.sort((a, b) => a.positionSeconds - b.positionSeconds);
  }
}

export async function createBookmarkWithOfflineSupport(input: {
  bookId: string;
  positionSeconds: number;
  chapterTitle?: string;
  note?: string;
}): Promise<BookmarkItem> {
  const isOnline = typeof navigator === "undefined" || navigator.onLine;

  if (isOnline) {
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: input.bookId,
          positionSeconds: input.positionSeconds,
          chapterTitle: input.chapterTitle?.trim() || undefined,
          note: input.note?.trim() || undefined,
        }),
      });

      if (res.ok) {
        const body = (await res.json()) as { bookmark?: BookmarkItem } & BookmarkItem;
        const created: BookmarkItem = body.bookmark || body;
        const current = getLocalBookmarks(input.bookId);
        const next = [...current.filter((b) => b.id !== created.id), created].sort(
          (a, b) => a.positionSeconds - b.positionSeconds,
        );
        setLocalBookmarks(input.bookId, next);
        return created;
      }
    } catch {
      // Fall through to offline queue
    }
  }

  // Offline creation fallback
  const tempId = `local_bm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const localItem: BookmarkItem = {
    id: tempId,
    bookId: input.bookId,
    positionSeconds: input.positionSeconds,
    chapterTitle: input.chapterTitle?.trim() || null,
    note: input.note?.trim() || null,
    createdAt: Date.now(),
  };

  const pending = getPendingCreations();
  pending.push({
    tempId,
    bookId: input.bookId,
    positionSeconds: input.positionSeconds,
    chapterTitle: input.chapterTitle?.trim(),
    note: input.note?.trim(),
    createdAt: localItem.createdAt,
  });
  setPendingCreations(pending);

  const current = getLocalBookmarks(input.bookId);
  const next = [...current, localItem].sort((a, b) => a.positionSeconds - b.positionSeconds);
  setLocalBookmarks(input.bookId, next);

  return localItem;
}

export async function deleteBookmarkWithOfflineSupport(
  bookmarkId: string,
  bookId?: string,
): Promise<void> {
  // If bookId is known, remove from local cache immediately
  if (bookId) {
    const current = getLocalBookmarks(bookId);
    setLocalBookmarks(
      bookId,
      current.filter((b) => b.id !== bookmarkId),
    );
  }

  // Check if it was a pending creation
  if (bookmarkId.startsWith("local_bm_")) {
    const pending = getPendingCreations();
    setPendingCreations(pending.filter((p) => p.tempId !== bookmarkId));
    return;
  }

  const isOnline = typeof navigator === "undefined" || navigator.onLine;
  if (isOnline) {
    try {
      const res = await fetch(`/api/bookmarks/${bookmarkId}`, { method: "DELETE" });
      if (res.ok) return;
    } catch {
      // Fall through to offline queue
    }
  }

  // Queue for deletion once back online
  const pendingDeletions = getPendingDeletions();
  if (!pendingDeletions.includes(bookmarkId)) {
    pendingDeletions.push(bookmarkId);
    setPendingDeletions(pendingDeletions);
  }
}

export async function syncPendingBookmarks(): Promise<void> {
  const isOnline = typeof navigator === "undefined" || navigator.onLine;
  if (!isOnline) return;

  // 1. Process deletions
  const deletions = getPendingDeletions();
  const remainingDeletions: string[] = [];

  for (const id of deletions) {
    try {
      const res = await fetch(`/api/bookmarks/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        remainingDeletions.push(id);
      }
    } catch {
      remainingDeletions.push(id);
    }
  }
  setPendingDeletions(remainingDeletions);

  // 2. Process creations
  const creations = getPendingCreations();
  const remainingCreations: PendingCreation[] = [];

  for (const item of creations) {
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: item.bookId,
          positionSeconds: item.positionSeconds,
          chapterTitle: item.chapterTitle,
          note: item.note,
        }),
      });

      if (res.ok) {
        const body = (await res.json()) as { bookmark?: BookmarkItem } & BookmarkItem;
        const serverBm: BookmarkItem = body.bookmark || body;
        // Replace tempId with server ID in local cache
        const localItems = getLocalBookmarks(item.bookId);
        const updated = localItems.map((b) => (b.id === item.tempId ? serverBm : b));
        setLocalBookmarks(item.bookId, updated);
      } else {
        remainingCreations.push(item);
      }
    } catch {
      remainingCreations.push(item);
    }
  }
  setPendingCreations(remainingCreations);

  if (creations.length > 0 || deletions.length > 0) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("audioneko:bookmarks-synced"));
    }
  }
}

// Auto-sync listener on window 'online' event
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    syncPendingBookmarks().catch(() => {});
  });
}
