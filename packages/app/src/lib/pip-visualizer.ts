import { audioEngine } from "./audio-engine";

export interface PiPVisualizerOptions {
  title: string;
  author: string;
  chapterTitle?: string;
  coverUrl?: string;
  getCurrentTime: () => number;
  getDuration: () => number;
  getIsPlaying: () => boolean;
}

export function isPictureInPictureSupported(): boolean {
  return (
    typeof document !== "undefined" &&
    "pictureInPictureEnabled" in document &&
    Boolean(document.pictureInPictureEnabled)
  );
}

export class PictureInPictureManager {
  private canvas: HTMLCanvasElement | null = null;
  private video: HTMLVideoElement | null = null;
  private animId: number | null = null;
  private coverImg: HTMLImageElement | null = null;
  private isRunning = false;

  public isSupported(): boolean {
    return isPictureInPictureSupported();
  }

  public isActive(): boolean {
    return (
      typeof document !== "undefined" &&
      !!document.pictureInPictureElement &&
      document.pictureInPictureElement === this.video
    );
  }

  public async toggle(options: PiPVisualizerOptions): Promise<boolean> {
    if (this.isActive()) {
      await this.exit();
      return false;
    }
    return await this.start(options);
  }

  public async start(options: PiPVisualizerOptions): Promise<boolean> {
    if (!this.isSupported()) {
      console.warn("Picture-in-Picture is not supported in this browser.");
      return false;
    }

    try {
      if (!this.canvas) {
        this.canvas = document.createElement("canvas");
        this.canvas.width = 640;
        this.canvas.height = 360;
      }

      if (options.coverUrl) {
        this.coverImg = new Image();
        this.coverImg.crossOrigin = "anonymous";
        this.coverImg.src = options.coverUrl;
      }

      if (!this.video) {
        this.video = document.createElement("video");
        this.video.muted = true;
        this.video.playsInline = true;
      }

      // Stream canvas to video
      const stream = this.canvas.captureStream(24);
      this.video.srcObject = stream;
      await this.video.play();

      // Start render loop
      this.isRunning = true;
      this.renderLoop(options);

      // Request PiP window
      await this.video.requestPictureInPicture();

      this.video.addEventListener(
        "leavepictureinpicture",
        () => {
          this.exit();
        },
        { once: true },
      );

      return true;
    } catch (err) {
      console.warn("Could not activate Picture-in-Picture:", err);
      this.exit();
      return false;
    }
  }

  public async exit(): Promise<void> {
    this.isRunning = false;
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }

    if (
      typeof document !== "undefined" &&
      document.pictureInPictureElement &&
      document.pictureInPictureElement === this.video
    ) {
      try {
        await document.exitPictureInPicture();
      } catch {
        // Ignore exit PiP error
      }
    }

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
  }

  private renderLoop(options: PiPVisualizerOptions): void {
    if (!this.isRunning || !this.canvas) return;

    const ctx = this.canvas.getContext("2d");
    if (ctx) {
      this.draw(ctx, options);
    }

    this.animId = requestAnimationFrame(() => this.renderLoop(options));
  }

  private draw(ctx: CanvasRenderingContext2D, options: PiPVisualizerOptions): void {
    const width = 640;
    const height = 360;

    // 1. Obsidian background
    ctx.fillStyle = "#111114";
    ctx.fillRect(0, 0, width, height);

    // 2. Crisp 1px border
    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // 3. Album Art Thumbnail / Fallback
    const coverSize = 130;
    const coverX = 36;
    const coverY = 40;

    if (this.coverImg?.complete && this.coverImg.naturalWidth > 0) {
      try {
        ctx.drawImage(this.coverImg, coverX, coverY, coverSize, coverSize);
      } catch {
        this.drawCoverFallback(ctx, coverX, coverY, coverSize);
      }
    } else {
      this.drawCoverFallback(ctx, coverX, coverY, coverSize);
    }
    ctx.strokeStyle = "#3f3f46";
    ctx.lineWidth = 1;
    ctx.strokeRect(coverX, coverY, coverSize, coverSize);

    // 4. Book & Chapter Info
    ctx.fillStyle = "#f4f4f5";
    ctx.font = "bold 20px Inter, sans-serif";
    ctx.fillText(this.truncateText(ctx, options.title, 420), 185, 68);

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "14px Inter, sans-serif";
    ctx.fillText(this.truncateText(ctx, options.author, 420), 185, 96);

    if (options.chapterTitle) {
      ctx.fillStyle = "#e04838"; // crimson accent
      ctx.font = "12px 'IBM Plex Mono', monospace";
      ctx.fillText(this.truncateText(ctx, options.chapterTitle, 420), 185, 126);
    }

    // 5. Timeline Progress Bar
    const curTime = options.getCurrentTime();
    const dur = options.getDuration();
    const ratio = dur > 0 ? Math.min(1, Math.max(0, curTime / dur)) : 0;

    const barX = 185;
    const barY = 145;
    const barWidth = 415;
    const barHeight = 6;

    ctx.fillStyle = "#27272a";
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = "#e04838";
    ctx.fillRect(barX, barY, barWidth * ratio, barHeight);

    // Time text
    ctx.fillStyle = "#71717a";
    ctx.font = "12px 'IBM Plex Mono', monospace";
    const timeStr = `${this.formatTime(curTime)} / ${this.formatTime(dur)}`;
    ctx.fillText(timeStr, 185, 168);

    // 6. Real-time Audio Spectrum Bars (Web Audio Analyser)
    const isPlaying = options.getIsPlaying();
    const freqData = isPlaying ? audioEngine.getFrequencyData() : null;

    const specX = 36;
    const specY = 220;
    const specWidth = width - 72;
    const specHeight = 100;
    const numBars = 48;
    const barSpacing = specWidth / numBars;

    ctx.fillStyle = "#e04838";
    for (let i = 0; i < numBars; i++) {
      let amp = 0.05;
      if (freqData && freqData.length > 0) {
        const binIndex = Math.floor((i / numBars) * (freqData.length * 0.45));
        amp = (freqData[binIndex] ?? 0) / 255;
      } else if (isPlaying) {
        amp = 0.15 + Math.sin(Date.now() / 200 + i) * 0.1;
      }
      const h = Math.max(3, Math.round(amp * specHeight));
      ctx.fillRect(specX + i * barSpacing, specY + specHeight - h, barSpacing - 2, h);
    }

    // 7. Watermark / Logo Dot
    ctx.fillStyle = "#e04838";
    ctx.beginPath();
    ctx.arc(width - 45, 30, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#52525b";
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillText("audioneko", width - 115, 33);
  }

  private drawCoverFallback(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ): void {
    ctx.fillStyle = "#1e1e24";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#71717a";
    ctx.font = "bold 24px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("AUDIO", x + size / 2, y + size / 2 + 8);
    ctx.textAlign = "start";
  }

  private truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return `${truncated}…`;
  }

  private formatTime(secs: number): string {
    if (!Number.isFinite(secs) || secs < 0) return "0:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
}

export const pipManager = new PictureInPictureManager();
