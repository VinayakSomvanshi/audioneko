export interface MediaSessionMetadataOptions {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
}

export interface MediaSessionPositionState {
  duration: number;
  playbackRate: number;
  position: number;
}

export interface MediaSessionActionHandlers {
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onSeekBackward?: (offsetSeconds: number) => void;
  onSeekForward?: (offsetSeconds: number) => void;
  onSeekTo?: (positionSeconds: number) => void;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

/**
 * Checks whether the Media Session API is supported in the current environment.
 */
export function isMediaSessionSupported(): boolean {
  return (
    typeof navigator !== "undefined" && "mediaSession" in navigator && !!navigator.mediaSession
  );
}

/**
 * Updates navigator.mediaSession.metadata with book/chapter information.
 */
export function setMediaSessionMetadata(options: MediaSessionMetadataOptions): void {
  if (!isMediaSessionSupported() || typeof MediaMetadata === "undefined") {
    return;
  }

  const artwork: MediaImage[] = [];
  if (options.artworkUrl) {
    const sizes = ["96x96", "128x128", "192x192", "256x256", "512x512"];
    for (const size of sizes) {
      artwork.push({
        src: options.artworkUrl,
        sizes: size,
        type: "image/jpeg",
      });
    }
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: options.title,
    artist: options.artist,
    album: options.album || "audioneko",
    artwork,
  });
}

/**
 * Updates navigator.mediaSession.playbackState.
 */
export function setMediaSessionPlaybackState(state: "none" | "paused" | "playing"): void {
  if (!isMediaSessionSupported()) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch (err) {
    console.warn("Failed to set mediaSession.playbackState:", err);
  }
}

/**
 * Updates navigator.mediaSession position state (lock screen timeline).
 */
export function setMediaSessionPositionState(state: MediaSessionPositionState): void {
  if (!isMediaSessionSupported() || typeof navigator.mediaSession.setPositionState !== "function") {
    return;
  }

  const duration = Math.max(0, Number.isFinite(state.duration) ? state.duration : 0);
  const position = Math.min(
    Math.max(0, Number.isFinite(state.position) ? state.position : 0),
    duration > 0 ? duration : Number.MAX_SAFE_INTEGER,
  );
  const playbackRate = state.playbackRate > 0 ? state.playbackRate : 1.0;

  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate,
      position,
    });
  } catch (err) {
    // Avoid crashing if audio is in unseekable/NaN state
    console.warn("Failed to set mediaSession.setPositionState:", err);
  }
}

/**
 * Binds hardware/OS action handlers to the Media Session API.
 * Returns an unbind cleanup function.
 */
export function registerMediaSessionHandlers(handlers: MediaSessionActionHandlers): () => void {
  if (!isMediaSessionSupported()) {
    return () => {};
  }

  const actionMap: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
    ["play", handlers.onPlay ? () => handlers.onPlay?.() : null],
    ["pause", handlers.onPause ? () => handlers.onPause?.() : null],
    ["stop", handlers.onStop ? () => handlers.onStop?.() : null],
    [
      "seekbackward",
      handlers.onSeekBackward
        ? (details) => handlers.onSeekBackward?.(details.seekOffset || 15)
        : null,
    ],
    [
      "seekforward",
      handlers.onSeekForward
        ? (details) => handlers.onSeekForward?.(details.seekOffset || 30)
        : null,
    ],
    [
      "seekto",
      handlers.onSeekTo
        ? (details) => {
            if (details.seekTime !== undefined && details.seekTime !== null) {
              handlers.onSeekTo?.(details.seekTime);
            }
          }
        : null,
    ],
    ["previoustrack", handlers.onPreviousTrack ? () => handlers.onPreviousTrack?.() : null],
    ["nexttrack", handlers.onNextTrack ? () => handlers.onNextTrack?.() : null],
  ];

  for (const [action, handler] of actionMap) {
    try {
      if (handler) {
        navigator.mediaSession.setActionHandler(action, handler);
      } else {
        navigator.mediaSession.setActionHandler(action, null);
      }
    } catch {
      // Some browsers (e.g. Firefox) throw for unsupported action types like seekto
    }
  }

  return () => {
    if (!isMediaSessionSupported()) return;
    for (const [action] of actionMap) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        // Ignore unbind errors
      }
    }
  };
}
