import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EQUALIZER_PRESETS,
  type EqualizerSettings,
  loadEqualizerSettings,
  saveEqualizerSettings,
} from "./equalizer";

describe("Equalizer Presets & Configuration", () => {
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

  it("defines standard equalizer presets with 5 frequency bands", () => {
    expect(EQUALIZER_PRESETS.flat).toBeDefined();
    expect(EQUALIZER_PRESETS["vocal-clarity"]).toBeDefined();
    expect(EQUALIZER_PRESETS["warm-acoustic"]).toBeDefined();
    expect(EQUALIZER_PRESETS["muffled-boost"]).toBeDefined();
    expect(EQUALIZER_PRESETS["bass-reducer"]).toBeDefined();
    expect(EQUALIZER_PRESETS["night-whisper"]).toBeDefined();

    // Flat should be 0 across all bands
    const flatBands = EQUALIZER_PRESETS.flat.bands;
    expect(flatBands.subBass80Hz).toBe(0);
    expect(flatBands.warmth250Hz).toBe(0);
    expect(flatBands.mid1kHz).toBe(0);
    expect(flatBands.vocalClarity3kHz).toBe(0);
    expect(flatBands.air8kHz).toBe(0);

    // Vocal clarity should elevate 3kHz consonants and cut sub-bass rumble
    const vocalBands = EQUALIZER_PRESETS["vocal-clarity"].bands;
    expect(vocalBands.subBass80Hz).toBeLessThan(0);
    expect(vocalBands.vocalClarity3kHz).toBeGreaterThan(0);
  });

  it("loads default flat preset when localStorage is empty", () => {
    const settings = loadEqualizerSettings();
    expect(settings.preset).toBe("flat");
    expect(settings.bands).toEqual(EQUALIZER_PRESETS.flat.bands);
  });

  it("saves and loads custom equalizer settings correctly", () => {
    const customSettings: EqualizerSettings = {
      preset: "custom",
      bands: {
        subBass80Hz: -3,
        warmth250Hz: -1.5,
        mid1kHz: 2,
        vocalClarity3kHz: 5,
        air8kHz: 1,
      },
    };

    saveEqualizerSettings(customSettings);
    const loaded = loadEqualizerSettings();
    expect(loaded.preset).toBe("custom");
    expect(loaded.bands.vocalClarity3kHz).toBe(5);
    expect(loaded.bands.subBass80Hz).toBe(-3);
  });

  it("falls back gracefully on invalid JSON in localStorage", () => {
    localStorage.setItem("audioneko_equalizer_settings", "invalid{json");
    const loaded = loadEqualizerSettings();
    expect(loaded.preset).toBe("flat");
    expect(loaded.bands).toEqual(EQUALIZER_PRESETS.flat.bands);
  });
});
