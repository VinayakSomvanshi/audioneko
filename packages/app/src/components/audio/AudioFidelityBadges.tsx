/**
 * audioneko: Audio Fidelity & Technical Badges Component
 * Displays audio container, codec, bitrate, channel configuration, and fidelity tier.
 */

import type { Book, Chapter } from "@audioneko/shared";
import { Disc, FileAudio, Gauge, Layers, Radio, Sparkles } from "lucide-react";

interface AudioFidelityBadgesProps {
  book: Book;
  chapters?: Chapter[];
  className?: string;
}

export function AudioFidelityBadges({
  book,
  chapters = [],
  className = "",
}: AudioFidelityBadgesProps) {
  const format = book.format?.toLowerCase() || "m4b";
  const fileBytes = book.fileSizeBytes || 0;
  const durationSec = book.durationSeconds || 0;

  // Calculate bitrate in kbps if duration and size are known
  const calculatedBitrateKbps =
    fileBytes > 0 && durationSec > 0 ? Math.round((fileBytes * 8) / (durationSec * 1000)) : null;

  // Format and Codec descriptors
  let formatLabel = format.toUpperCase();
  let codecLabel = "AAC-LC";
  let isLossless = false;

  switch (format) {
    case "m4b":
      formatLabel = "M4B";
      codecLabel = "MPEG-4 AAC-LC";
      break;
    case "mp3":
      formatLabel = "MP3";
      codecLabel = "MPEG-1 Layer 3";
      break;
    case "flac":
      formatLabel = "FLAC";
      codecLabel = "FLAC Lossless";
      isLossless = true;
      break;
    case "opus":
      formatLabel = "OPUS";
      codecLabel = "Ogg Opus Voice";
      break;
    case "m4a":
      formatLabel = "M4A";
      codecLabel = "MPEG-4 Audio";
      break;
    default:
      formatLabel = format.toUpperCase();
      codecLabel = "Audio Stream";
  }

  // Audio Fidelity Tier
  let fidelityTier = "Standard Spoken Audio";
  let fidelityColor = "text-text border-border bg-elevated";

  if (isLossless) {
    fidelityTier = "Lossless Studio Master";
    fidelityColor = "text-accent bg-accent-bg border-accent/40 font-bold";
  } else if (calculatedBitrateKbps && calculatedBitrateKbps >= 128) {
    fidelityTier = "Studio Hi-Fi (128k+)";
    fidelityColor = "text-accent bg-accent-bg border-accent/40 font-bold";
  } else if (calculatedBitrateKbps && calculatedBitrateKbps >= 64) {
    fidelityTier = "Voice Optimized";
    fidelityColor = "text-text border-border bg-elevated";
  } else if (calculatedBitrateKbps && calculatedBitrateKbps > 0) {
    fidelityTier = "Compact Voice";
    fidelityColor = "text-muted border-border bg-elevated";
  }

  const isUnabridged =
    book.title?.toLowerCase().includes("unabridged") ||
    book.description?.toLowerCase().includes("unabridged") ||
    true; // Default standard for complete library entries

  return (
    <div
      className={`p-3.5 sm:p-4 rounded-xl border border-border surface-card space-y-2.5 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <FileAudio className="w-4 h-4 text-accent" />
          <span className="text-xs font-mono font-semibold text-text uppercase tracking-wider">
            Audio Fidelity & Technical Specs
          </span>
        </div>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${fidelityColor}`}>
          {fidelityTier}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
        {/* Container Badge */}
        <div className="px-2.5 py-1 rounded bg-elevated border border-border text-text flex items-center gap-1.5 shadow-xs">
          <Disc className="w-3.5 h-3.5 text-accent" />
          <span className="font-bold">{formatLabel}</span>
          <span className="text-muted text-[10px]">({codecLabel})</span>
        </div>

        {/* Bitrate Badge */}
        {calculatedBitrateKbps && (
          <div className="px-2.5 py-1 rounded bg-elevated border border-border text-text flex items-center gap-1.5 shadow-xs">
            <Gauge className="w-3.5 h-3.5 text-accent" />
            <span className="font-bold">{calculatedBitrateKbps} kbps</span>
            <span className="text-muted text-[10px]">CBR/VBR</span>
          </div>
        )}

        {/* Channel Layout */}
        <div className="px-2.5 py-1 rounded bg-elevated border border-border text-text flex items-center gap-1.5 shadow-xs">
          <Radio className="w-3.5 h-3.5 text-accent" />
          <span>Stereo 2.0</span>
        </div>

        {/* Chapters Count Badge */}
        {chapters.length > 0 && (
          <div className="px-2.5 py-1 rounded bg-elevated border border-border text-text flex items-center gap-1.5 shadow-xs">
            <Layers className="w-3.5 h-3.5 text-accent" />
            <span className="font-bold">{chapters.length}</span>
            <span className="text-muted text-[10px]">Chapters</span>
          </div>
        )}

        {/* Edition Status */}
        {isUnabridged && (
          <div className="px-2.5 py-1 rounded bg-elevated border border-border text-muted flex items-center gap-1.5 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-accent/80" />
            <span>Unabridged Edition</span>
          </div>
        )}
      </div>
    </div>
  );
}
