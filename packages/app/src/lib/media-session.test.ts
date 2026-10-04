import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMediaSessionSupported,
  registerMediaSessionHandlers,
  setMediaSessionMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
} from "./media-session";

describe("MediaSession Integration", () => {
  const originalMediaSession = navigator.mediaSession;

  beforeEach(() => {
    // Mock MediaSession and MediaMetadata
    const actionHandlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();

    const mockMediaSession = {
      metadata: null as MediaMetadata | null,
      playbackState: "none" as MediaSessionPlaybackState,
      setActionHandler: vi.fn(
        (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
          actionHandlers.set(action, handler);
        },
      ),
      setPositionState: vi.fn(),
      _handlers: actionHandlers,
    };

    class MockMediaMetadata {
      title: string;
      artist: string;
      album: string;
      artwork: MediaImage[];
      constructor(init?: MediaMetadataInit) {
        this.title = init?.title || "";
        this.artist = init?.artist || "";
        this.album = init?.album || "";
        this.artwork = [...(init?.artwork || [])];
      }
    }

    Object.defineProperty(navigator, "mediaSession", {
      value: mockMediaSession,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, "MediaMetadata", {
      value: MockMediaMetadata,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "mediaSession", {
      value: originalMediaSession,
      writable: true,
      configurable: true,
    });
  });

  it("detects media session support correctly", () => {
    expect(isMediaSessionSupported()).toBe(true);
  });

  it("sets metadata with artwork sizes", () => {
    setMediaSessionMetadata({
      title: "Project Hail Mary",
      artist: "Andy Weir",
      album: "Sci-Fi Standalones",
      artworkUrl: "/api/covers/book-123",
    });

    const meta = navigator.mediaSession.metadata;
    expect(meta).not.toBeNull();
    expect(meta?.title).toBe("Project Hail Mary");
    expect(meta?.artist).toBe("Andy Weir");
    expect(meta?.album).toBe("Sci-Fi Standalones");
    expect(meta?.artwork).toHaveLength(5);
    expect(meta?.artwork[0]?.sizes).toBe("96x96");
    expect(meta?.artwork[4]?.sizes).toBe("512x512");
  });

  it("updates playback state", () => {
    setMediaSessionPlaybackState("playing");
    expect(navigator.mediaSession.playbackState).toBe("playing");

    setMediaSessionPlaybackState("paused");
    expect(navigator.mediaSession.playbackState).toBe("paused");
  });

  it("updates position state with valid bounds", () => {
    setMediaSessionPositionState({
      duration: 1200,
      playbackRate: 1.5,
      position: 300,
    });

    expect(navigator.mediaSession.setPositionState).toHaveBeenCalledWith({
      duration: 1200,
      playbackRate: 1.5,
      position: 300,
    });
  });

  it("registers hardware action handlers and allows triggering them", () => {
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onSeekBackward = vi.fn();
    const onSeekForward = vi.fn();
    const onSeekTo = vi.fn();

    const cleanup = registerMediaSessionHandlers({
      onPlay,
      onPause,
      onSeekBackward,
      onSeekForward,
      onSeekTo,
    });

    // Verify setActionHandler calls
    expect(navigator.mediaSession.setActionHandler).toHaveBeenCalledWith(
      "play",
      expect.any(Function),
    );
    expect(navigator.mediaSession.setActionHandler).toHaveBeenCalledWith(
      "pause",
      expect.any(Function),
    );

    cleanup();

    // Verify handlers cleared on unmount
    expect(navigator.mediaSession.setActionHandler).toHaveBeenCalledWith("play", null);
    expect(navigator.mediaSession.setActionHandler).toHaveBeenCalledWith("pause", null);
  });
});
