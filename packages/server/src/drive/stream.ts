/**
 * audioneko: 2 MB Chunk Range Proxy & Edge Cache Engine
 * High-performance, quota-protective audio streaming proxy
 */

import type { Env } from "../types";
import { getGoogleAccessToken } from "./token";

export const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB (2,097,152 bytes)

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
    // Default to initial 2 MB chunk if no range specified
    return {
      start: 0,
      end: Math.min(CHUNK_SIZE - 1, totalSize - 1),
    };
  }

  const rangeSpec = rangeHeader.slice(6).trim();

  // Suffix range: "bytes=-500" (last 500 bytes)
  if (rangeSpec.startsWith("-")) {
    const suffixLength = Number.parseInt(rangeSpec.slice(1), 10);
    if (Number.isNaN(suffixLength) || suffixLength <= 0) {
      return { start: 0, end: Math.min(CHUNK_SIZE - 1, totalSize - 1) };
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
    if (Number.isNaN(end)) {
      end = Math.min(start + CHUNK_SIZE - 1, totalSize - 1);
    } else if (end >= totalSize) {
      end = totalSize - 1;
    }
  } else {
    // Open-ended range "bytes=X-": Cap to 2 MB chunk boundary for streaming efficiency
    end = Math.min(start + CHUNK_SIZE - 1, totalSize - 1);
  }

  if (start > end) {
    return null;
  }

  return { start, end };
}

/**
 * Computes 2 MB aligned chunk boundaries covering a byte offset
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

/**
 * Fetches file metadata from Google Drive API v3 (cached in KV for 24h)
 */
export async function getDriveFileMetadata(
  fileId: string,
  accessToken: string,
  kv?: KVNamespace,
  customFetch: typeof fetch = fetch,
): Promise<DriveFileMetadata> {
  const cacheKey = `gdrive_meta_${fileId}`;

  if (kv) {
    try {
      const cached = await kv.get(cacheKey, "json");
      if (cached) {
        return cached as DriveFileMetadata;
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
 * Handles audio stream requests using the 4-tier hybrid engine:
 * Tier 2: Cloudflare R2 Active Shelf
 * Tier 3: Cloudflare Edge Cache API (2 MB slices)
 * Tier 4: Google Drive API (alt=media)
 */
export async function handleAudioStreamRequest(
  request: Request,
  fileId: string,
  env: Env,
  customFetch: typeof fetch = fetch,
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

  // 1. Obtain Google OAuth2 access token
  const accessToken = await getGoogleAccessToken(env.GOOGLE_SA_KEY, env.KV, customFetch);

  // 2. Fetch File Metadata (size and mimeType)
  const metadata = await getDriveFileMetadata(fileId, accessToken, env.KV, customFetch);
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

  // 4. Parse Range Header
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

  // 5. Tier 2: Check Cloudflare R2 "Active Shelf" Cache
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
            "X-Audioneko-Tier": "R2-Active-Shelf",
          },
        });
      }
    } catch {
      // Fallback to Tier 3 on R2 error
    }
  }

  interface CloudflareCacheStorage {
    default: Cache;
  }

  function getEdgeCache(): Cache | undefined {
    if (typeof caches !== "undefined" && "default" in caches) {
      return (caches as unknown as CloudflareCacheStorage).default;
    }
    return undefined;
  }

  // 6. Tier 3: Check Cloudflare Edge Cache API (2 MB chunk alignment)
  const { chunkIndex, chunkStart, chunkEnd } = getChunkBounds(start, totalSize);
  const requestUrl = new URL(request.url);
  const cacheKeyUrl = `${requestUrl.origin}/api/stream/${fileId}?chunk=${chunkIndex}`;
  const cacheKey = new Request(cacheKeyUrl, { method: "GET" });

  const edgeCache = getEdgeCache();
  let cachedChunk: Response | undefined;
  if (edgeCache) {
    try {
      cachedChunk = await edgeCache.match(cacheKey);
    } catch {
      // Non-blocking
    }
  }

  let chunkBuffer: ArrayBuffer;

  if (cachedChunk) {
    chunkBuffer = await cachedChunk.arrayBuffer();
  } else {
    // 7. Tier 4: Fetch 2 MB Chunk from Google Drive API
    const driveRes = await customFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Range: `bytes=${chunkStart}-${chunkEnd}`,
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

    chunkBuffer = await driveRes.arrayBuffer();

    // Cache the 2 MB chunk in Cloudflare Edge Cache API
    if (edgeCache) {
      try {
        const responseToCache = new Response(chunkBuffer, {
          headers: {
            "Content-Type": metadata.mimeType,
            "Content-Length": chunkBuffer.byteLength.toString(),
            "Cache-Control": "public, max-age=604800, s-maxage=604800",
          },
        });
        // edgeCache.put must not block client response
        edgeCache.put(cacheKey, responseToCache);
      } catch {
        // Non-blocking cache write
      }
    }
  }

  // 8. Slice the 2 MB chunk to the exact requested range, clamped to chunk boundary
  const effectiveEnd = Math.min(end, chunkEnd);
  const sliceStart = start - chunkStart;
  const sliceLength = effectiveEnd - start + 1;
  const slicedBytes = chunkBuffer.slice(sliceStart, sliceStart + sliceLength);

  return new Response(slicedBytes, {
    status: 206,
    headers: {
      "Content-Range": `bytes ${start}-${effectiveEnd}/${totalSize}`,
      "Content-Length": slicedBytes.byteLength.toString(),
      "Content-Type": metadata.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=604800, s-maxage=604800",
      "X-Audioneko-Tier": cachedChunk ? "Edge-Cache-API" : "Google-Drive-Cold-Vault",
    },
  });
}
