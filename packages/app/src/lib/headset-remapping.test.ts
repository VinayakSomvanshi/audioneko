import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_HEADSET_SETTINGS,
  type HeadsetRemappingSettings,
  loadHeadsetSettings,
  saveHeadsetSettings,
} from "./headset-remapping";

describe("Headset Remapping & Hardware Controls", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    const mockStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    };
    vi.stubGlobal("window", { localStorage: mockStorage });
    vi.stubGlobal("localStorage", mockStorage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads default headset settings with safe skip intervals", () => {
    const settings = loadHeadsetSettings();
    expect(settings.nextTrackAction).toBe("skip-seconds");
    expect(settings.prevTrackAction).toBe("skip-seconds");
    expect(settings.seekForwardSeconds).toBe(30);
    expect(settings.seekBackwardSeconds).toBe(15);
    expect(settings.doubleTapBookmark).toBe(true);
  });

  it("saves and loads customized headset gesture mapping", () => {
    const custom: HeadsetRemappingSettings = {
      nextTrackAction: "chapter",
      prevTrackAction: "chapter",
      seekBackwardSeconds: 10,
      seekForwardSeconds: 45,
      doubleTapBookmark: false,
    };

    saveHeadsetSettings(custom);
    const loaded = loadHeadsetSettings();
    expect(loaded.nextTrackAction).toBe("chapter");
    expect(loaded.prevTrackAction).toBe("chapter");
    expect(loaded.seekForwardSeconds).toBe(45);
    expect(loaded.doubleTapBookmark).toBe(false);
  });

  it("gracefully falls back to default settings on storage error", () => {
    localStorage.setItem("audioneko_headset_settings", "malformed-json");
    const loaded = loadHeadsetSettings();
    expect(loaded).toEqual(DEFAULT_HEADSET_SETTINGS);
  });
});
