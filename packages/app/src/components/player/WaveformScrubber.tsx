import type { Chapter } from "@audioneko/shared";
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

export interface WaveformScrubberProps {
  currentTime: number;
  duration: number;
  chapters?: Chapter[];
  onSeek: (seconds: number) => void;
  className?: string;
}

export type ScrubSpeedTier = "1.0x" | "0.5x" | "0.25x" | "0.1x";

export function getScrubSpeedFromDelta(dy: number): {
  multiplier: number;
  tier: ScrubSpeedTier;
  label: string;
} {
  const absY = Math.abs(dy);
  if (absY >= 140) {
    return { multiplier: 0.1, tier: "0.1x", label: "Fine (0.1x)" };
  }
  if (absY >= 80) {
    return { multiplier: 0.25, tier: "0.25x", label: "¼x Quarter Speed" };
  }
  if (absY >= 35) {
    return { multiplier: 0.5, tier: "0.5x", label: "½x Half Speed" };
  }
  return { multiplier: 1.0, tier: "1.0x", label: "1x Normal Speed" };
}

export function formatScrubberTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const TOTAL_BARS = 64;

export function WaveformScrubber({
  currentTime,
  duration,
  chapters = [],
  onSeek,
  className = "",
}: WaveformScrubberProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [scrubSpeedLabel, setScrubSpeedLabel] = useState("1x Normal Speed");
  const [scrubX, setScrubX] = useState(0);

  // Drag tracking refs
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    lastX: 0,
    currentTimeAtStart: 0,
    activeTime: 0,
  });

  // Generate a deterministic speech-like waveform pattern
  const bars = useMemo(() => {
    const list: Array<{ id: string; height: number; index: number }> = [];
    for (let i = 0; i < TOTAL_BARS; i++) {
      // Audio speech envelope simulation: bursts and brief punctuation pauses
      const waveA = Math.sin((i / TOTAL_BARS) * Math.PI * 8);
      const waveB = Math.cos((i / TOTAL_BARS) * Math.PI * 18);
      const waveC = Math.sin((i / TOTAL_BARS) * Math.PI * 3);
      const noise = ((i * 37) % 17) / 17;
      let height = Math.abs(waveA * 0.4 + waveB * 0.25 + waveC * 0.2 + noise * 0.25);
      // Ensure audible speech peaks and minimum 15% height
      height = Math.max(0.15, Math.min(1.0, height));
      list.push({ id: `wf-seg-${i}`, height, index: i });
    }
    return list;
  }, []);

  const effectiveTime = isScrubbing ? scrubTime : currentTime;
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, effectiveTime / duration)) : 0;
  const activeBarIndex = Math.floor(progressRatio * TOTAL_BARS);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || duration <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const initialTime = clickRatio * duration;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      currentTimeAtStart: initialTime,
      activeTime: initialTime,
    };

    setIsScrubbing(true);
    setScrubTime(initialTime);
    setScrubX(e.clientX - rect.left);
    setScrubSpeedLabel("1x Normal Speed");

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture fallback
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isScrubbing || !containerRef.current || duration <= 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const trackWidth = rect.width;
    if (trackWidth <= 0) return;

    const dy = e.clientY - dragRef.current.startY;
    const { multiplier, label } = getScrubSpeedFromDelta(dy);
    setScrubSpeedLabel(label);

    const dx = e.clientX - dragRef.current.lastX;
    dragRef.current.lastX = e.clientX;

    // Apply decelerated time delta proportional to track width
    const timeDelta = (dx / trackWidth) * duration * multiplier;
    const nextTime = Math.max(0, Math.min(duration, dragRef.current.activeTime + timeDelta));
    dragRef.current.activeTime = nextTime;

    setScrubTime(nextTime);
    setScrubX(Math.max(0, Math.min(trackWidth, (nextTime / duration) * trackWidth)));
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    setIsScrubbing(false);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    onSeek(dragRef.current.activeTime);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      let offset = 0;
      if (e.key === "ArrowLeft") offset = e.shiftKey ? -30 : -5;
      else if (e.key === "ArrowRight") offset = e.shiftKey ? 30 : 5;
      else if (e.key === "Home") {
        e.preventDefault();
        onSeek(0);
        return;
      } else if (e.key === "End") {
        e.preventDefault();
        onSeek(duration);
        return;
      } else {
        return;
      }

      e.preventDefault();
      onSeek(Math.max(0, Math.min(duration, currentTime + offset)));
    },
    [currentTime, duration, onSeek],
  );

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Audiobook timeline scrubber"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={Math.round(effectiveTime)}
      aria-valuetext={`${formatScrubberTime(effectiveTime)} of ${formatScrubberTime(duration)}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      className={`relative select-none outline-none focus-visible:ring-1 focus-visible:ring-accent py-3 cursor-pointer group ${className}`}
    >
      {/* Decelerated Scrubbing Floating Tooltip */}
      {isScrubbing && (
        <div
          className="absolute -top-11 z-30 pointer-events-none transform -translate-x-1/2 flex flex-col items-center"
          style={{ left: `${scrubX}px` }}
        >
          <div className="bg-surface border border-border px-2.5 py-1 rounded shadow-lg text-[11px] font-mono whitespace-nowrap flex items-center gap-2">
            <span className="text-text font-bold">{formatScrubberTime(scrubTime)}</span>
            <span className="text-subtle text-[10px] font-normal">
              (-{formatScrubberTime(Math.max(0, duration - scrubTime))})
            </span>
            <span className="text-accent text-[10px] uppercase tracking-wider font-semibold border-l border-border pl-2">
              {scrubSpeedLabel}
            </span>
          </div>
          <div className="w-1.5 h-1.5 bg-surface border-r border-b border-border rotate-45 -mt-1" />
        </div>
      )}

      {/* Waveform Bar Track */}
      <div className="h-10 w-full flex items-center gap-[2px] px-1 relative">
        {bars.map((bar) => {
          const isPlayed = bar.index <= activeBarIndex;
          const heightPx = Math.max(4, Math.round(bar.height * 34));

          return (
            <div key={bar.id} className="flex-1 flex items-center justify-center h-full">
              <div
                style={{ height: `${heightPx}px` }}
                className={`w-full rounded-sm transition-colors duration-75 ${
                  isPlayed
                    ? "bg-accent opacity-95 group-hover:opacity-100"
                    : "bg-elevated opacity-50 group-hover:opacity-75"
                }`}
              />
            </div>
          );
        })}

        {/* Chapter Boundary Indicators */}
        {chapters.map((ch, idx) => {
          if (idx === 0 || duration <= 0) return null;
          const ratio = (ch.startTime ?? 0) / duration;
          if (ratio <= 0 || ratio >= 1) return null;

          return (
            <div
              key={ch.id || `ch-${idx}`}
              title={ch.title}
              className="absolute top-0 bottom-0 w-[1px] bg-text/40 pointer-events-none z-10"
              style={{ left: `${ratio * 100}%` }}
            />
          );
        })}

        {/* Active Cursor Handle */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-text rounded-full shadow pointer-events-none transform -translate-x-1/2 z-20 group-hover:scale-y-110 transition-transform"
          style={{ left: `${progressRatio * 100}%` }}
        />
      </div>

      {/* Timeline Labels */}
      <div className="flex justify-between items-center px-1 mt-1 text-[11px] font-mono text-muted">
        <span>{formatScrubberTime(effectiveTime)}</span>
        <span>-{formatScrubberTime(Math.max(0, duration - effectiveTime))}</span>
      </div>
    </div>
  );
}
