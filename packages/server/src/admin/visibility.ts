import type { LibraryVisibility } from "@audioneko/shared";
import type { Env } from "../types";

export const VISIBILITY_KV_KEY = "audioneko_visibility";

export async function ensureVisibilityTable(db: Env["DB"]): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS visibility_rules (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target TEXT NOT NULL,
        is_hidden INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      )`,
    )
    .run();
}

export async function getVisibility(env: {
  KV?: Env["KV"];
  DB?: Env["DB"];
}): Promise<LibraryVisibility> {
  // 1. Fast KV read for edge performance
  if (env.KV) {
    try {
      const cached = (await env.KV.get(VISIBILITY_KV_KEY, "json")) as LibraryVisibility | null;
      if (
        cached &&
        Array.isArray(cached.hiddenBooks) &&
        Array.isArray(cached.hiddenSeries) &&
        Array.isArray(cached.hiddenAuthors)
      ) {
        return cached;
      }
    } catch (err) {
      console.warn("[visibility] Failed to read from KV:", err);
    }
  }

  // 2. Fallback to D1 database
  if (env.DB) {
    try {
      await ensureVisibilityTable(env.DB);
      const rows = await env.DB.prepare(
        "SELECT type, target, is_hidden FROM visibility_rules WHERE is_hidden = 1",
      ).all<{ type: string; target: string; is_hidden: number }>();

      const hiddenBooks: string[] = [];
      const hiddenSeries: string[] = [];
      const hiddenAuthors: string[] = [];

      for (const row of rows.results || []) {
        if (row.type === "book") hiddenBooks.push(row.target);
        else if (row.type === "series") hiddenSeries.push(row.target);
        else if (row.type === "author") hiddenAuthors.push(row.target);
      }

      const compiled: LibraryVisibility = { hiddenBooks, hiddenSeries, hiddenAuthors };

      if (env.KV) {
        await env.KV.put(VISIBILITY_KV_KEY, JSON.stringify(compiled));
      }

      return compiled;
    } catch (err) {
      console.warn("[visibility] Failed to read from D1:", err);
    }
  }

  return { hiddenBooks: [], hiddenSeries: [], hiddenAuthors: [] };
}

export async function setVisibilityRule(
  env: { KV?: Env["KV"]; DB: Env["DB"] },
  type: "book" | "series" | "author",
  target: string,
  hidden: boolean,
): Promise<LibraryVisibility> {
  await ensureVisibilityTable(env.DB);

  const ruleId = `${type}:${target.trim().toLowerCase()}`;
  const now = Math.floor(Date.now() / 1000);

  if (hidden) {
    await env.DB.prepare(
      `INSERT INTO visibility_rules (id, type, target, is_hidden, updated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET is_hidden = 1, updated_at = ?`,
    )
      .bind(ruleId, type, target.trim(), now, now)
      .run();
  } else {
    await env.DB.prepare("DELETE FROM visibility_rules WHERE id = ?").bind(ruleId).run();
  }

  // Re-read compiled state from D1
  const rows = await env.DB.prepare(
    "SELECT type, target, is_hidden FROM visibility_rules WHERE is_hidden = 1",
  ).all<{ type: string; target: string; is_hidden: number }>();

  const hiddenBooks: string[] = [];
  const hiddenSeries: string[] = [];
  const hiddenAuthors: string[] = [];

  for (const row of rows.results || []) {
    if (row.type === "book") hiddenBooks.push(row.target);
    else if (row.type === "series") hiddenSeries.push(row.target);
    else if (row.type === "author") hiddenAuthors.push(row.target);
  }

  const compiled: LibraryVisibility = { hiddenBooks, hiddenSeries, hiddenAuthors };

  // Write updated state to KV
  if (env.KV) {
    try {
      await env.KV.put(VISIBILITY_KV_KEY, JSON.stringify(compiled));
    } catch (err) {
      console.warn("[visibility] Failed to write to KV:", err);
    }
  }

  return compiled;
}

export function isAuthorHidden(author: string, visibility: LibraryVisibility): boolean {
  if (!author || !visibility.hiddenAuthors.length) return false;
  const lower = author.trim().toLowerCase();
  return visibility.hiddenAuthors.some((a) => a.trim().toLowerCase() === lower);
}

export function isSeriesHidden(
  seriesNameOrId: string | null | undefined,
  visibility: LibraryVisibility,
): boolean {
  if (!seriesNameOrId || !visibility.hiddenSeries.length) return false;
  const lower = seriesNameOrId.trim().toLowerCase();
  return visibility.hiddenSeries.some((s) => s.trim().toLowerCase() === lower);
}

export function getBookHiddenStatus(
  book: {
    id: string;
    author: string;
    series?: string | null;
    seriesName?: string | null;
    seriesId?: string | null;
  },
  visibility: LibraryVisibility,
): { isHidden: boolean; reason?: "direct" | "series" | "author" } {
  if (visibility.hiddenBooks.includes(book.id)) {
    return { isHidden: true, reason: "direct" };
  }
  if (book.series && isSeriesHidden(book.series, visibility)) {
    return { isHidden: true, reason: "series" };
  }
  if (book.seriesName && isSeriesHidden(book.seriesName, visibility)) {
    return { isHidden: true, reason: "series" };
  }
  if (book.seriesId && isSeriesHidden(book.seriesId, visibility)) {
    return { isHidden: true, reason: "series" };
  }
  if (isAuthorHidden(book.author, visibility)) {
    return { isHidden: true, reason: "author" };
  }
  return { isHidden: false };
}
