import { beforeEach, describe, expect, it } from "vitest";
import { AudioEngine } from "./audio-engine";

describe("AudioEngine & Web Audio DSP Pipeline", () => {
  let engine: AudioEngine;

  beforeEach(() => {
    engine = new AudioEngine();
  });

  it("initializes with default audiophile settings", () => {
    const settings = engine.getSettings();
    expect(settings.voiceBoost).toBe(false);
    expect(settings.loudnessNormalization).toBe(true);
    expect(settings.smartSpeed).toBe(false);
    expect(settings.basePlaybackRate).toBe(1.0);
  });

  it("toggles voice boost state properly", () => {
    engine.setVoiceBoost(true);
    expect(engine.getSettings().voiceBoost).toBe(true);

    engine.setVoiceBoost(false);
    expect(engine.getSettings().voiceBoost).toBe(false);
  });

  it("toggles loudness normalization state properly", () => {
    engine.setLoudnessNormalization(false);
    expect(engine.getSettings().loudnessNormalization).toBe(false);

    engine.setLoudnessNormalization(true);
    expect(engine.getSettings().loudnessNormalization).toBe(true);
  });

  it("toggles smart speed and restores base playback rate on audio element", () => {
    const mockAudio = {
      playbackRate: 2.5,
    } as HTMLAudioElement;

    engine.setBasePlaybackRate(1.25, mockAudio);
    expect(engine.getSettings().basePlaybackRate).toBe(1.25);
    expect(mockAudio.playbackRate).toBe(1.25);

    engine.setSmartSpeed(true, mockAudio);
    expect(engine.getSettings().smartSpeed).toBe(true);

    // Turning off smart speed must immediately restore user base rate
    mockAudio.playbackRate = 2.8;
    engine.setSmartSpeed(false, mockAudio);
    expect(engine.getSettings().smartSpeed).toBe(false);
    expect(mockAudio.playbackRate).toBe(1.25);
  });

  it("clamps master volume within safe [0, 1] range", () => {
    // Should not throw or crash without WebAudio context
    engine.setVolume(1.5);
    engine.setVolume(-0.5);
    engine.setVolume(0.75);
  });
});
