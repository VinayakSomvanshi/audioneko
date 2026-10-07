/**
 * audioneko: 5-Band Voice Parametric Equalizer Definitions & Presets
 *
 * Engineered specifically for spoken-word audiobooks, voice narration, and varied listening environments.
 */

export type EqualizerPresetId =
  | "flat"
  | "vocal-clarity"
  | "warm-acoustic"
  | "muffled-boost"
  | "bass-reducer"
  | "night-whisper"
  | "custom";

export interface EqualizerBands {
  subBass80Hz: number; // Low rumble / mic thump (-12 to +12 dB)
  warmth250Hz: number; // Chest resonance / muddiness (-12 to +12 dB)
  mid1kHz: number; // Midrange presence (-12 to +12 dB)
  vocalClarity3kHz: number; // Speech intelligibility & consonants (-12 to +12 dB)
  air8kHz: number; // High-end air & sibilance control (-12 to +12 dB)
}

export interface EqualizerPresetConfig {
  id: EqualizerPresetId;
  name: string;
  description: string;
  bands: EqualizerBands;
}

export const EQUALIZER_PRESETS: Record<
  Exclude<EqualizerPresetId, "custom">,
  EqualizerPresetConfig
> = {
  flat: {
    id: "flat",
    name: "Flat / Neutral",
    description: "Pure unprocessed studio sound without frequency coloration.",
    bands: {
      subBass80Hz: 0,
      warmth250Hz: 0,
      mid1kHz: 0,
      vocalClarity3kHz: 0,
      air8kHz: 0,
    },
  },
  "vocal-clarity": {
    id: "vocal-clarity",
    name: "Vocal Clarity",
    description: "Cuts low rumble and elevates 3kHz consonants for crisp dialogue.",
    bands: {
      subBass80Hz: -6,
      warmth250Hz: -2,
      mid1kHz: 1,
      vocalClarity3kHz: 4.5,
      air8kHz: -1.5,
    },
  },
  "warm-acoustic": {
    id: "warm-acoustic",
    name: "Warm Acoustic",
    description: "Adds rich lower-mid chest resonance while smoothing harsh highs.",
    bands: {
      subBass80Hz: 1,
      warmth250Hz: 3.5,
      mid1kHz: 0.5,
      vocalClarity3kHz: 1.5,
      air8kHz: -2.5,
    },
  },
  "muffled-boost": {
    id: "muffled-boost",
    name: "Muffled Tape Fix",
    description: "Brightens dull or low-bitrate recordings with high-frequency shelf boost.",
    bands: {
      subBass80Hz: -4,
      warmth250Hz: -1,
      mid1kHz: 2,
      vocalClarity3kHz: 4,
      air8kHz: 6,
    },
  },
  "bass-reducer": {
    id: "bass-reducer",
    name: "Bass Reducer",
    description: "Removes boomy resonance for car speakers, subwoofers, and deep voices.",
    bands: {
      subBass80Hz: -10,
      warmth250Hz: -5,
      mid1kHz: 0,
      vocalClarity3kHz: 2,
      air8kHz: 0,
    },
  },
  "night-whisper": {
    id: "night-whisper",
    name: "Night & Whisper",
    description: "Clear intimate whisper comprehension at low bedroom listening volume.",
    bands: {
      subBass80Hz: -8,
      warmth250Hz: -2,
      mid1kHz: 2,
      vocalClarity3kHz: 5,
      air8kHz: -3,
    },
  },
};

const STORAGE_KEY = "audioneko_equalizer_settings";

export interface EqualizerSettings {
  preset: EqualizerPresetId;
  bands: EqualizerBands;
}

export function loadEqualizerSettings(): EqualizerSettings {
  if (typeof window === "undefined") {
    return { preset: "flat", bands: { ...EQUALIZER_PRESETS.flat.bands } };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.preset && parsed?.bands) {
        return parsed as EqualizerSettings;
      }
    }
  } catch {
    // fallback on parse error
  }
  return { preset: "flat", bands: { ...EQUALIZER_PRESETS.flat.bands } };
}

export function saveEqualizerSettings(settings: EqualizerSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota errors
  }
}
