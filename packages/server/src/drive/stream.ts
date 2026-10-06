/**
 * audioneko: Zero-Latency Range Proxy & Direct Streaming Engine
 * High-performance, quota-protective audio streaming proxy
 */

import type { Env } from "../types";
import { getGoogleAccessToken } from "./token";

export const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB utility chunk size

export interface ParsedRange {
  start: number;
  end: number;
}

export interface DriveFileMetadata {
  size: number;
  mimeType: string;
  name: string;
}

/**
 * Parses HTTP Range header according to RFC 7233
 * Supports: "bytes=0-1048575", "bytes=2097152-", "bytes=-524288"
 */
export function parseRangeHeader(
  rangeHeader: string | null | undefined,
  totalSize: number,
): ParsedRange | null {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) {
    // If no range specified, stream the full file
    return {
      start: 0,
      end: totalSize - 1,
    };
  }

  const rangeSpec = rangeHeader.slice(6).trim();

  // Suffix range: "bytes=-500" (last 500 bytes)
  if (rangeSpec.startsWith("-")) {
    const suffixLength = Number.parseInt(rangeSpec.slice(1), 10);
    if (Number.isNaN(suffixLength) || suffixLength <= 0) {
      return { start: 0, end: totalSize - 1 };
    }
    const start = Math.max(0, totalSize - suffixLength);
    return { start, end: totalSize - 1 };
  }

  const parts = rangeSpec.split("-");
  const startStr = parts[0]?.trim();
  const endStr = parts[1]?.trim();

  const start = startStr ? Number.parseInt(startStr, 10) : 0;
  if (Number.isNaN(start) || start < 0 || start >= totalSize) {
    return null;
  }

  let end: number;
  if (endStr && endStr.length > 0) {
    end = Number.parseInt(endStr, 10);
    if (Number.isNaN(end) || end >= totalSize) {
      end = totalSize - 1;
    }
  } else {
    end = totalSize - 1;
  }

  if (start > end) {
    return null;
  }

  return { start, end };
}

/**
 * Computes 2 MB aligned chunk boundaries covering a byte offset (helper utility)
 */
export function getChunkBounds(
  offset: number,
  totalSize: number,
): {
  chunkIndex: number;
  chunkStart: number;
  chunkEnd: number;
} {
  const chunkIndex = Math.floor(offset / CHUNK_SIZE);
  const chunkStart = chunkIndex * CHUNK_SIZE;
  const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, totalSize - 1);
  return { chunkIndex, chunkStart, chunkEnd };
}

const memoryMetaCache = new Map<string, { meta: DriveFileMetadata; expiresAt: number }>();

export function _resetMetadataMemoryCache(): void {
  memoryMetaCache.clear();
}

/**
 * Fetches file metadata from Google Drive API v3 (cached in Worker memory and KV for 24h)
 */
export async function getDriveFileMetadata(
  fileId: string,
  accessToken: string,
  kv?: KVNamespace,
  customFetch: typeof fetch = fetch,
): Promise<DriveFileMetadata> {
  const now = Date.now();
  const memCached = memoryMetaCache.get(fileId);
  if (memCached && memCached.expiresAt > now) {
    return memCached.meta;
  }

  const cacheKey = `gdrive_meta_${fileId}`;

  if (kv) {
    try {
      const cached = await kv.get(cacheKey, "json");
      if (cached) {
        const meta = cached as DriveFileMetadata;
        memoryMetaCache.set(fileId, { meta, expiresAt: now + 3600_000 });
        return meta;
      }
    } catch {
      // Fallback to fetch on KV read error
    }
  }

  const res = await customFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=size,mimeType,name`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to fetch Drive metadata [${res.status}]: ${errorText}`);
  }

  const data = (await res.json()) as { size?: string; mimeType?: string; name?: string };
  const metadata: DriveFileMetadata = {
    size: Number.parseInt(data.size || "0", 10),
    mimeType: data.mimeType || "audio/mp4",
    name: data.name || "audiobook.m4b",
  };

  memoryMetaCache.set(fileId, { meta: metadata, expiresAt: now + 3600_000 });

  if (kv && metadata.size > 0) {
    try {
      await kv.put(cacheKey, JSON.stringify(metadata), {
        expirationTtl: 86400, // Cache metadata for 24 hours
      });
    } catch {
      // Non-blocking
    }
  }

  return metadata;
}

/**
 * Handles audio stream requests with zero-copy streaming:
 * Tier 2: Cloudflare R2 Active Shelf (if configured)
 * Tier 4: Google Drive API (alt=media) with direct piped ReadableStream
 *
 * Eliminates intermediate ArrayBuffer buffering stalls and 2 MB chunk fragmentation,
 * allowing instant startup (< 1s) and continuous smooth playback without buffer underruns.
 */
export async function handleAudioStreamRequest(
  request: Request,
  fileId: string,
  env: Env,
  customFetch: typeof fetch = fetch,
  preloadedMetadata?: DriveFileMetadata,
): Promise<Response> {
  if (!env.GOOGLE_SA_KEY) {
    return new Response(
      JSON.stringify({ error: "GOOGLE_SA_KEY environment variable not configured" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 1. Obtain Google OAuth2 access token (cached in KV and memory)
  const accessToken = await getGoogleAccessToken(env.GOOGLE_SA_KEY, env.KV, customFetch);

  // 2. Fetch File Metadata (use preloaded if valid, otherwise query KV / Drive)
  const metadata =
    preloadedMetadata && preloadedMetadata.size > 0
      ? preloadedMetadata
      : await getDriveFileMetadata(fileId, accessToken, env.KV, customFetch);
  const totalSize = metadata.size;

  if (totalSize <= 0) {
    return new Response(JSON.stringify({ error: "Invalid audio file size in Drive" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Handle HEAD requests (probed by audio players to determine content-length and accept-ranges)
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": metadata.mimeType,
        "Content-Length": totalSize.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=604800, s-maxage=604800",
      },
    });
  }

  // 4. Parse Range Header according to RFC 7233
  const rangeHeader = request.headers.get("Range");
  const parsedRange = parseRangeHeader(rangeHeader, totalSize);
  if (!parsedRange) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${totalSize}`,
        "Accept-Ranges": "bytes",
      },
    });
  }
  const { start, end } = parsedRange;
  const requestedLength = end - start + 1;

  // 5. Tier 2: Check Cloudflare R2 "Active Shelf" Cache (if configured)
  if (env.R2) {
    try {
      const r2Key = `audio/${fileId}`;
      const r2Object = await env.R2.get(r2Key, {
        range: { offset: start, length: requestedLength },
      });

      if (r2Object && "body" in r2Object && r2Object.body) {
        return new Response(r2Object.body as ReadableStream, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${end}/${totalSize}`,
            "Content-Length": requestedLength.toString(),
            "Content-Type": metadata.mimeType,
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=604800, s-maxage=604800",
            "X-Content-Type-Options": "nosniff",
            "X-Audioneko-Tier": "R2-Active-Shelf",
          },
        });
      }
    } catch {
      // Fallback to Google Drive on R2 error
    }
  }

  // 6. Direct Zero-Latency Stream from Google Drive API
  const driveRange = `bytes=${start}-${end}`;
  const driveRes = await customFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Range: driveRange,
      },
    },
  );

  if (!driveRes.ok && driveRes.status !== 206) {
    const errorText = await driveRes.text();
    return new Response(
      JSON.stringify({ error: `Google Drive API error [${driveRes.status}]: ${errorText}` }),
      {
        status: driveRes.status === 403 ? 429 : 502,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", metadata.mimeType);
  responseHeaders.set("Accept-Ranges", "bytes");
  responseHeaders.set("Cache-Control", "public, max-age=604800, s-maxage=604800");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("X-Audioneko-Tier", "Google-Drive-Direct-Stream");

  const contentRange =
    driveRes.headers.get("content-range") || `bytes ${start}-${end}/${totalSize}`;
  responseHeaders.set("Content-Range", contentRange);

  const contentLength = driveRes.headers.get("content-length") || requestedLength.toString();
  responseHeaders.set("Content-Length", contentLength);

  return new Response(driveRes.body, {
    status: 206,
    headers: responseHeaders,
  });
}
