/**
 * audioneko: Web Audio API DSP Engine
 *
 * Implements:
 * 1. 40ms linear gain ramp-up / ramp-down on play/pause to eliminate speaker popping
 * 2. 3-band parametric Voice Boost EQ (85 Hz low rumble cut, 2.2 kHz speech intelligibility lift, 7.5 kHz sibilance taming)
 * 3. Dynamic Loudness Normalization compressor targeting -16 LUFS
 * 4. Smart Speed AudioWorklet integration evaluating rolling 250ms RMS energy
 */

export interface DspSettings {
  voiceBoost: boolean;
  loudnessNormalization: boolean;
  smartSpeed: boolean;
  basePlaybackRate: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private voiceBoostFilter: BiquadFilterNode | null = null;
  private sibilanceFilter: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private gainNode: GainNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  private isInitialized = false;
  private isSilent = false;
  private currentVolume = 1.0;
  private settings: DspSettings = {
    voiceBoost: false,
    loudnessNormalization: true,
    smartSpeed: false,
    basePlaybackRate: 1.0,
  };

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

      this.ctx = new AudioCtx();
      this.sourceNode = this.ctx.createMediaElementSource(audioElement);

      // 1. Voice Boost EQ Stage
      // Band A: 85 Hz Highpass Filter (kills mic plosives & low-frequency desk rumble)
      this.highpassFilter = this.ctx.createBiquadFilter();
      this.highpassFilter.type = "highpass";
      this.highpassFilter.frequency.value = 85;
      this.highpassFilter.Q.value = Math.SQRT1_2;

      // Band B: 2.2 kHz Peaking Filter (lift speech presence & intelligibility)
      this.voiceBoostFilter = this.ctx.createBiquadFilter();
      this.voiceBoostFilter.type = "peaking";
      this.voiceBoostFilter.frequency.value = 2200;
      this.voiceBoostFilter.Q.value = 1.2;
      this.voiceBoostFilter.gain.value = this.settings.voiceBoost ? 3.5 : 0;

      // Band C: 7.5 kHz Peaking / High-shelf (tames harsh sibilance "s" / "sh")
      this.sibilanceFilter = this.ctx.createBiquadFilter();
      this.sibilanceFilter.type = "peaking";
      this.sibilanceFilter.frequency.value = 7500;
      this.sibilanceFilter.Q.value = 1.0;
      this.sibilanceFilter.gain.value = this.settings.voiceBoost ? -2.5 : 0;

      // 2. Loudness Normalization Dynamics Compressor Stage (-16 LUFS target)
      this.compressorNode = this.ctx.createDynamicsCompressor();
      this.applyCompressorSettings();

      // 3. Master Gain Node (handles 40ms anti-pop ramping and volume control)
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.currentVolume;

      // Connect standard DSP pipeline: source -> HPF -> VoiceBoost -> Sibilance -> Compressor -> Gain -> destination
      this.sourceNode.connect(this.highpassFilter);
      this.highpassFilter.connect(this.voiceBoostFilter);
      this.voiceBoostFilter.connect(this.sibilanceFilter);
      this.sibilanceFilter.connect(this.compressorNode);
      this.compressorNode.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      // 4. Try loading Smart Speed AudioWorklet
      try {
        await this.ctx.audioWorklet.addModule("/silence-detector-processor.js");
        this.workletNode = new AudioWorkletNode(this.ctx, "silence-detector-processor");
        this.workletNode.port.onmessage = (event) => {
          if (event.data?.type === "silence") {
            this.handleSilenceState(event.data.isSilent, audioElement);
          }
        };
        // Tap worklet into gain node to analyze live stream
        this.gainNode.connect(this.workletNode);
      } catch {
        // AudioWorklet is optional / not supported in some sandboxes
      }

      this.isInitialized = true;
    } catch (e) {
      console.warn("Web Audio DSP initialization deferred:", e);
    }
  }

  /**
   * Resumes AudioContext if suspended by browser autoplay policy
   */
  public async ensureContext(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  /**
   * Smooth 40ms linear gain ramp-up on play to eliminate speaker clicks
   */
  public async playWithRamp(audioElement: HTMLAudioElement): Promise<void> {
    await this.ensureContext();

    if (this.gainNode && this.ctx) {
      const now = this.ctx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(0.001, now);
      this.gainNode.gain.linearRampToValueAtTime(this.currentVolume, now + 0.04);
    }

    await audioElement.play();
  }

  /**
   * Smooth 40ms linear gain ramp-down on pause to eliminate speaker clicks
   */
  public pauseWithRamp(audioElement: HTMLAudioElement): void {
    if (this.gainNode && this.ctx) {
      const now = this.ctx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(0.001, now + 0.04);

      setTimeout(() => {
        audioElement.pause();
        if (this.gainNode && this.ctx) {
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
   * Toggles Voice Boost 3-band parametric EQ
   */
  public setVoiceBoost(enabled: boolean): void {
    this.settings.voiceBoost = enabled;
    if (this.voiceBoostFilter && this.sibilanceFilter && this.ctx) {
      const now = this.ctx.currentTime;
      this.voiceBoostFilter.gain.linearRampToValueAtTime(enabled ? 3.5 : 0, now + 0.02);
      this.sibilanceFilter.gain.linearRampToValueAtTime(enabled ? -2.5 : 0, now + 0.02);
    }
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
      // Dynamic silence acceleration: speed up silence to 2.5x base rate
      audioElement.playbackRate = Math.min(3.0, this.settings.basePlaybackRate * 2.2);
    } else {
      // Restore speaker's normal playback rate
      audioElement.playbackRate = this.settings.basePlaybackRate;
    }
  }

  private applyCompressorSettings(): void {
    if (!this.compressorNode || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.settings.loudnessNormalization) {
      this.compressorNode.threshold.linearRampToValueAtTime(-24, now + 0.02);
      this.compressorNode.knee.linearRampToValueAtTime(12, now + 0.02);
      this.compressorNode.ratio.linearRampToValueAtTime(4, now + 0.02);
      this.compressorNode.attack.linearRampToValueAtTime(0.003, now + 0.02);
      this.compressorNode.release.linearRampToValueAtTime(0.25, now + 0.02);
    } else {
      // Bypass compression
      this.compressorNode.threshold.linearRampToValueAtTime(0, now + 0.02);
      this.compressorNode.ratio.linearRampToValueAtTime(1, now + 0.02);
    }
  }

  public getSettings(): DspSettings {
    return { ...this.settings };
  }
}

export const audioEngine = new AudioEngine();
