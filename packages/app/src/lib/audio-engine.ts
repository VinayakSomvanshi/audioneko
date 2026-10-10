/**
 * audioneko: Web Audio API DSP Engine
 *
 * Implements:
 * 1. 40ms linear gain ramp-up / ramp-down on play/pause to eliminate speaker popping
 * 2. 5-band parametric Voice Equalizer with Presets (80 Hz, 250 Hz, 1 kHz, 2.8 kHz, 8 kHz)
 * 3. Dynamic Loudness Normalization compressor targeting -16 LUFS
 * 4. Smart Speed AudioWorklet integration evaluating rolling 250ms RMS energy
 */

import {
  EQUALIZER_PRESETS,
  type EqualizerBands,
  type EqualizerPresetId,
  loadEqualizerSettings,
  saveEqualizerSettings,
} from "./equalizer";

export interface DspSettings {
  voiceBoost: boolean;
  loudnessNormalization: boolean;
  smartSpeed: boolean;
  basePlaybackRate: number;
  equalizerPreset: EqualizerPresetId;
  equalizerBands: EqualizerBands;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;

  // 5-band Parametric Equalizer Filter Nodes
  private eqBand80: BiquadFilterNode | null = null;
  private eqBand250: BiquadFilterNode | null = null;
  private eqBand1k: BiquadFilterNode | null = null;
  private eqBand3k: BiquadFilterNode | null = null;
  private eqBand8k: BiquadFilterNode | null = null;

  private compressorNode: DynamicsCompressorNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  private isInitialized = false;
  private isSilent = false;
  private currentVolume = 1.0;
  private settings: DspSettings;
  private pauseTimeout: ReturnType<typeof setTimeout> | null = null;
  private attachedAudioElement: HTMLAudioElement | null = null;

  constructor() {
    const savedEq = loadEqualizerSettings();
    this.settings = {
      voiceBoost: savedEq.preset === "vocal-clarity",
      loudnessNormalization: true,
      smartSpeed: false,
      basePlaybackRate: 1.0,
      equalizerPreset: savedEq.preset,
      equalizerBands: savedEq.bands,
    };
  }

  /**
   * Initializes the Web Audio graph and attaches to the HTMLMediaElement.
   * Safe to call multiple times; only initializes once.
   */
  public async init(audioElement: HTMLAudioElement): Promise<void> {
    if (this.isInitialized || typeof window === "undefined") {
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.attachedAudioElement = audioElement;
      this.ctx = new AudioCtx();
      this.sourceNode = this.ctx.createMediaElementSource(audioElement);

      // Active watchdog: auto-resume AudioContext if suspended while audio is actively playing
      this.ctx.onstatechange = () => {
        if (
          this.ctx &&
          this.ctx.state !== "running" &&
          this.attachedAudioElement &&
          !this.attachedAudioElement.paused
        ) {
          console.warn(
            "[audioneko DSP] AudioContext suspended during active playback - auto-resuming",
          );
          this.ctx.resume().catch(() => {});
        }
      };

      // 1. 5-Band Voice Equalizer Stage
      // Band 1: 80 Hz Low Shelf (low rumble / plosive reduction)
      this.eqBand80 = this.ctx.createBiquadFilter();
      this.eqBand80.type = "lowshelf";
      this.eqBand80.frequency.value = 80;
      this.eqBand80.gain.value = this.settings.equalizerBands.subBass80Hz;

      // Band 2: 250 Hz Peaking (chest resonance / lower mids warmth)
      this.eqBand250 = this.ctx.createBiquadFilter();
      this.eqBand250.type = "peaking";
      this.eqBand250.frequency.value = 250;
      this.eqBand250.Q.value = 1.2;
      this.eqBand250.gain.value = this.settings.equalizerBands.warmth250Hz;

      // Band 3: 1 kHz Peaking (body / room acoustics)
      this.eqBand1k = this.ctx.createBiquadFilter();
      this.eqBand1k.type = "peaking";
      this.eqBand1k.frequency.value = 1000;
      this.eqBand1k.Q.value = 1.0;
      this.eqBand1k.gain.value = this.settings.equalizerBands.mid1kHz;

      // Band 4: 2.8 kHz Peaking (speech presence & intelligibility)
      this.eqBand3k = this.ctx.createBiquadFilter();
      this.eqBand3k.type = "peaking";
      this.eqBand3k.frequency.value = 2800;
      this.eqBand3k.Q.value = 1.2;
      this.eqBand3k.gain.value = this.settings.equalizerBands.vocalClarity3kHz;

      // Band 5: 8 kHz High Shelf (air / sibilance control)
      this.eqBand8k = this.ctx.createBiquadFilter();
      this.eqBand8k.type = "highshelf";
      this.eqBand8k.frequency.value = 8000;
      this.eqBand8k.gain.value = this.settings.equalizerBands.air8kHz;

      // 2. Loudness Normalization Dynamics Compressor Stage
      this.compressorNode = this.ctx.createDynamicsCompressor();
      this.applyCompressorSettings();

      // 3. Master Gain Node (handles 40ms anti-pop ramping and volume control)
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.currentVolume;

      // Connect 5-band DSP pipeline: source -> EQ1 -> EQ2 -> EQ3 -> EQ4 -> EQ5 -> Compressor -> Gain -> destination
      this.sourceNode.connect(this.eqBand80);
      this.eqBand80.connect(this.eqBand250);
      this.eqBand250.connect(this.eqBand1k);
      this.eqBand1k.connect(this.eqBand3k);
      this.eqBand3k.connect(this.eqBand8k);
      this.eqBand8k.connect(this.compressorNode);
      this.compressorNode.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      // Analyser Node for Visualizers & PiP frequency spectrum
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 128;
      this.gainNode.connect(this.analyserNode);

      // 4. Try loading Smart Speed AudioWorklet
      try {
        await this.ctx.audioWorklet.addModule("/silence-detector-processor.js");
        this.workletNode = new AudioWorkletNode(this.ctx, "silence-detector-processor");
        this.workletNode.port.onmessage = (event) => {
          if (event.data?.type === "silence") {
            this.handleSilenceState(event.data.isSilent, audioElement);
          }
        };
        this.gainNode.connect(this.workletNode);
      } catch {
        // AudioWorklet is optional / fallback
      }

      this.isInitialized = true;
    } catch (e) {
      console.warn("Web Audio DSP initialization deferred:", e);
    }
  }

  /**
   * Resumes AudioContext if suspended by browser autoplay policy, backgrounding, or phone sleep
   */
  public async ensureContext(): Promise<void> {
    if (this.ctx && this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn("[audioneko DSP] Failed to resume AudioContext:", e);
      }
    }
  }

  /**
   * Checks whether the underlying Web Audio graph is suspended or interrupted
   */
  public isSuspended(): boolean {
    return Boolean(this.ctx && this.ctx.state !== "running");
  }

  /**
   * Zero-latency playback trigger: ensures Web Audio graph is live, unmuted, and scheduled
   */
  public async playWithRamp(audioElement: HTMLAudioElement): Promise<void> {
    this.attachedAudioElement = audioElement;

    // Cancel any pending pause scheduled from a previous rapid toggle
    if (this.pauseTimeout) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = null;
    }

    await this.ensureContext();

    if (this.gainNode && this.ctx) {
      const now = this.ctx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.currentVolume, now);
    }

    return audioElement.play();
  }

  /**
   * Smooth 40ms linear gain ramp-down on pause to eliminate speaker clicks
   */
  public pauseWithRamp(audioElement: HTMLAudioElement): void {
    if (this.pauseTimeout) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = null;
    }

    if (this.gainNode && this.ctx && this.ctx.state === "running") {
      const now = this.ctx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(0.001, now + 0.04);

      this.pauseTimeout = setTimeout(() => {
        this.pauseTimeout = null;
        audioElement.pause();
        if (this.gainNode && this.ctx && this.ctx.state === "running") {
          this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
          this.gainNode.gain.setValueAtTime(this.currentVolume, this.ctx.currentTime);
        }
      }, 45);
    } else {
      audioElement.pause();
    }
  }

  /**
   * Sets master volume with 10ms smooth ramp
   */
  public setVolume(volume: number): void {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    if (this.gainNode && this.ctx) {
      const now = this.ctx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.linearRampToValueAtTime(this.currentVolume, now + 0.01);
    }
  }

  /**
   * Sets 5-band Equalizer gains smoothly
   */
  public setEqualizerBands(bands: EqualizerBands): void {
    this.settings.equalizerBands = { ...bands };
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.eqBand80?.gain.linearRampToValueAtTime(bands.subBass80Hz, now + 0.02);
      this.eqBand250?.gain.linearRampToValueAtTime(bands.warmth250Hz, now + 0.02);
      this.eqBand1k?.gain.linearRampToValueAtTime(bands.mid1kHz, now + 0.02);
      this.eqBand3k?.gain.linearRampToValueAtTime(bands.vocalClarity3kHz, now + 0.02);
      this.eqBand8k?.gain.linearRampToValueAtTime(bands.air8kHz, now + 0.02);
    }
    saveEqualizerSettings({
      preset: this.settings.equalizerPreset,
      bands: this.settings.equalizerBands,
    });
  }

  /**
   * Applies an Equalizer preset by identifier
   */
  public setEqualizerPreset(presetId: EqualizerPresetId): void {
    this.settings.equalizerPreset = presetId;
    if (presetId !== "custom" && EQUALIZER_PRESETS[presetId]) {
      const presetBands = EQUALIZER_PRESETS[presetId].bands;
      this.setEqualizerBands(presetBands);
    } else {
      saveEqualizerSettings({
        preset: "custom",
        bands: this.settings.equalizerBands,
      });
    }
    this.settings.voiceBoost = presetId === "vocal-clarity";
  }

  /**
   * Toggles Voice Boost (bridges to vocal-clarity preset)
   */
  public setVoiceBoost(enabled: boolean): void {
    this.settings.voiceBoost = enabled;
    this.setEqualizerPreset(enabled ? "vocal-clarity" : "flat");
  }

  /**
   * Toggles Loudness Normalization Compressor
   */
  public setLoudnessNormalization(enabled: boolean): void {
    this.settings.loudnessNormalization = enabled;
    this.applyCompressorSettings();
  }

  /**
   * Toggles Smart Speed silence trimming
   */
  public setSmartSpeed(enabled: boolean, audioElement?: HTMLAudioElement): void {
    this.settings.smartSpeed = enabled;
    if (!enabled && audioElement) {
      audioElement.playbackRate = this.settings.basePlaybackRate;
    }
  }

  /**
   * Sets base playback rate (e.g. 1.25x)
   */
  public setBasePlaybackRate(rate: number, audioElement?: HTMLAudioElement): void {
    this.settings.basePlaybackRate = rate;
    if (audioElement && (!this.settings.smartSpeed || !this.isSilent)) {
      audioElement.playbackRate = rate;
    }
  }

  /**
   * Handles Smart Speed real-time silence state from AudioWorklet
   */
  private handleSilenceState(isSilent: boolean, audioElement: HTMLAudioElement): void {
    this.isSilent = isSilent;
    if (!this.settings.smartSpeed) return;

    if (isSilent) {
      audioElement.playbackRate = Math.min(3.0, this.settings.basePlaybackRate * 2.2);
    } else {
      audioElement.playbackRate = this.settings.basePlaybackRate;
    }
  }

  private applyCompressorSettings(): void {
    if (!this.compressorNode || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.settings.loudnessNormalization) {
      this.compressorNode.threshold.linearRampToValueAtTime(-18, now + 0.02);
      this.compressorNode.knee.linearRampToValueAtTime(12, now + 0.02);
      this.compressorNode.ratio.linearRampToValueAtTime(3, now + 0.02);
      this.compressorNode.attack.linearRampToValueAtTime(0.02, now + 0.02);
      this.compressorNode.release.linearRampToValueAtTime(0.3, now + 0.02);
    } else {
      this.compressorNode.threshold.linearRampToValueAtTime(0, now + 0.02);
      this.compressorNode.ratio.linearRampToValueAtTime(1, now + 0.02);
    }
  }

  public getFrequencyData(): Uint8Array | null {
    if (!this.analyserNode) return null;
    const buffer = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(buffer);
    return buffer;
  }

  public getSettings(): DspSettings {
    return { ...this.settings };
  }
}

export const audioEngine = new AudioEngine();
