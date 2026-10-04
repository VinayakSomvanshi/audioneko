export type SleepTimerPreset = 5 | 15 | 30 | 45 | 60 | "end-of-chapter";

export interface SleepTimerState {
  isActive: boolean;
  preset: SleepTimerPreset | null;
  remainingSeconds: number;
  endsAt: number | null; // Epoch timestamp in ms
  isFadingOut: boolean;
  volumeMultiplier: number; // 0.0 (silent) to 1.0 (full volume)
  shakeToExtendEnabled: boolean;
}

export const FADE_WINDOW_SECONDS = 30;
export const DEFAULT_SHAKE_THRESHOLD = 18; // m/s² delta

export class SleepTimer {
  private state: SleepTimerState = {
    isActive: false,
    preset: null,
    remainingSeconds: 0,
    endsAt: null,
    isFadingOut: false,
    volumeMultiplier: 1.0,
    shakeToExtendEnabled: true,
  };

  private listeners = new Set<(state: SleepTimerState) => void>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onExpireCallback: (() => void) | null = null;
  private onExtendCallback: ((addedSeconds: number) => void) | null = null;
  private motionCleanup: (() => void) | null = null;

  constructor(options?: {
    onExpire?: () => void;
    onExtend?: (addedSeconds: number) => void;
  }) {
    if (options?.onExpire) this.onExpireCallback = options.onExpire;
    if (options?.onExtend) this.onExtendCallback = options.onExtend;
  }

  public getState(): Readonly<SleepTimerState> {
    return { ...this.state };
  }

  public subscribe(listener: (state: SleepTimerState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const currentState = this.getState();
    for (const listener of this.listeners) {
      listener(currentState);
    }
  }

  /**
   * Starts or restarts the sleep timer with the given preset.
   */
  public start(
    preset: SleepTimerPreset,
    context?: { currentPosition?: number; chapterEnd?: number },
  ): void {
    this.clearTicker();

    let durationSeconds = 0;
    if (preset === "end-of-chapter") {
      const pos = context?.currentPosition ?? 0;
      const end = context?.chapterEnd ?? 0;
      durationSeconds = Math.max(5, Math.floor(end - pos));
    } else {
      durationSeconds = preset * 60;
    }

    const now = Date.now();
    const endsAt = now + durationSeconds * 1000;

    this.state = {
      ...this.state,
      isActive: true,
      preset,
      remainingSeconds: durationSeconds,
      endsAt,
      isFadingOut: false,
      volumeMultiplier: 1.0,
    };

    this.notify();
    this.startTicker();

    if (this.state.shakeToExtendEnabled && !this.motionCleanup) {
      this.attachShakeListener();
    }
  }

  /**
   * Extends the active timer by adding extra minutes (default 15 minutes).
   */
  public extend(additionalMinutes = 15): void {
    if (!this.state.isActive) return;

    const addedSeconds = additionalMinutes * 60;
    const now = Date.now();
    const currentEnd = this.state.endsAt ?? now;
    const newEnd = Math.max(now, currentEnd) + addedSeconds * 1000;
    const remainingSeconds = Math.max(0, Math.ceil((newEnd - now) / 1000));

    this.state = {
      ...this.state,
      remainingSeconds,
      endsAt: newEnd,
      isFadingOut: false,
      volumeMultiplier: 1.0,
    };

    this.notify();
    this.onExtendCallback?.(addedSeconds);

    // Provide haptic feedback if supported on mobile
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.([40, 60, 40]);
      } catch {
        // Ignore vibration errors
      }
    }
  }

  /**
   * Cancels and resets the sleep timer.
   */
  public cancel(): void {
    this.clearTicker();
    this.detachShakeListener();

    this.state = {
      ...this.state,
      isActive: false,
      preset: null,
      remainingSeconds: 0,
      endsAt: null,
      isFadingOut: false,
      volumeMultiplier: 1.0,
    };

    this.notify();
  }

  public setShakeToExtendEnabled(enabled: boolean): void {
    this.state.shakeToExtendEnabled = enabled;
    if (enabled && this.state.isActive) {
      this.attachShakeListener();
    } else {
      this.detachShakeListener();
    }
    this.notify();
  }

  /**
   * Updates timer progress (called every second by ticker or manually for testing).
   */
  public tick(now: number = Date.now()): void {
    if (!this.state.isActive || !this.state.endsAt) return;

    const remainingMs = this.state.endsAt - now;
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

    if (remainingSeconds <= 0) {
      this.state = {
        ...this.state,
        isActive: false,
        remainingSeconds: 0,
        endsAt: null,
        isFadingOut: false,
        volumeMultiplier: 0.0,
      };
      this.clearTicker();
      this.detachShakeListener();
      this.notify();
      this.onExpireCallback?.();
      return;
    }

    // Smooth volume fade during the final 30 seconds
    const isFadingOut = remainingSeconds <= FADE_WINDOW_SECONDS;
    const volumeMultiplier = isFadingOut
      ? Math.max(0, remainingSeconds / FADE_WINDOW_SECONDS)
      : 1.0;

    this.state = {
      ...this.state,
      remainingSeconds,
      isFadingOut,
      volumeMultiplier,
    };

    this.notify();
  }

  private startTicker(): void {
    this.intervalId = setInterval(() => {
      this.tick();
    }, 1000);
  }

  private clearTicker(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private attachShakeListener(): void {
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      return;
    }

    let lastX: number | null = null;
    let lastY: number | null = null;
    let lastZ: number | null = null;
    let lastShakeTime = 0;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      if (lastX !== null && lastY !== null && lastZ !== null) {
        const deltaX = Math.abs(acc.x - lastX);
        const deltaY = Math.abs(acc.y - lastY);
        const deltaZ = Math.abs(acc.z - lastZ);
        const totalDelta = deltaX + deltaY + deltaZ;

        const now = Date.now();
        // Debounce shakes by 3 seconds
        if (totalDelta > DEFAULT_SHAKE_THRESHOLD && now - lastShakeTime > 3000) {
          lastShakeTime = now;
          this.extend(15);
        }
      }

      lastX = acc.x;
      lastY = acc.y;
      lastZ = acc.z;
    };

    try {
      window.addEventListener("devicemotion", handleMotion);
      this.motionCleanup = () => {
        window.removeEventListener("devicemotion", handleMotion);
        this.motionCleanup = null;
      };
    } catch {
      // Device motion not supported
    }
  }

  private detachShakeListener(): void {
    if (this.motionCleanup) {
      this.motionCleanup();
    }
  }
}
