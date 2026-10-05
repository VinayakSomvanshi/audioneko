// audioneko Service Worker — Offline Range Streaming & PWA Shell Cache
const CACHE_NAME = "audioneko-shell-v1";
const OPFS_ROOT_DIR = "audioneko_books";
const AUDIO_FILE_NAME = "audio.bin";

self.addEventListener("install", (_event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Intercepts audio stream requests and serves byte ranges directly from OPFS if downloaded.
 */
async function handleAudioStreamFetch(request) {
  const url = new URL(request.url);
  const fileId = url.pathname.slice("/api/stream/".length);

  if (!fileId) {
    return fetch(request);
  }

  try {
    if (!navigator.storage || !navigator.storage.getDirectory) {
      return fetch(request);
    }

    const root = await navigator.storage.getDirectory();
    const booksDir = await root.getDirectoryHandle(OPFS_ROOT_DIR);
    const bookDir = await booksDir.getDirectoryHandle(fileId);
    const audioHandle = await bookDir.getFileHandle(AUDIO_FILE_NAME);
    const file = await audioHandle.getFile();

    const fileSize = file.size;
    if (fileSize === 0) {
      return fetch(request);
    }

    const rangeHeader = request.headers.get("Range") || request.headers.get("range");

    // Determine MIME type (default to audio/mp4 for M4B)
    const mimeType = file.type || "audio/mp4";

    if (!rangeHeader) {
      // Full file response
      return new Response(file, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Content-Length": fileSize.toString(),
          "Accept-Ranges": "bytes",
          "X-Audioneko-Source": "OPFS-Offline",
        },
      });
    }

    // Parse Range header per RFC 7233: bytes=start-end, bytes=start-, bytes=-suffix
    let start = 0;
    let end = fileSize - 1;

    const spec = rangeHeader.slice(6).trim();
    if (spec.startsWith("-")) {
      const suffix = Number.parseInt(spec.slice(1), 10);
      if (!Number.isNaN(suffix) && suffix > 0) {
        start = Math.max(0, fileSize - suffix);
        end = fileSize - 1;
      }
    } else {
      const parts = spec.split("-");
      const parsedStart = Number.parseInt(parts[0], 10);
      if (!Number.isNaN(parsedStart)) {
        start = parsedStart;
      }
      if (parts[1] && parts[1].trim().length > 0) {
        const parsedEnd = Number.parseInt(parts[1], 10);
        if (!Number.isNaN(parsedEnd)) {
          end = Math.min(parsedEnd, fileSize - 1);
        }
      }
    }

    // Bounds validation: return 416 only if start is beyond EOF or start > end
    if (start >= fileSize || start > end) {
      return new Response(null, {
        status: 416,
        statusText: "Range Not Satisfiable",
        headers: {
          "Content-Range": `bytes */${fileSize}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    const chunkSize = end - start + 1;
    const slice = file.slice(start, end + 1, mimeType);

    return new Response(slice, {
      status: 206,
      statusText: "Partial Content",
      headers: {
        "Content-Type": mimeType,
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": chunkSize.toString(),
        "Accept-Ranges": "bytes",
        "X-Audioneko-Source": "OPFS-Offline",
      },
    });
  } catch (_err) {
    // If not found in OPFS or any filesystem error occurs, pass through to network
    return fetch(request);
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Audio range proxy interceptor
  if (url.pathname.startsWith("/api/stream/")) {
    event.respondWith(handleAudioStreamFetch(event.request));
    return;
  }

  // Allow standard network navigation
  return;
});
