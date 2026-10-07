import { RotateCcw, Sliders, Volume2, X } from "lucide-react";
import { useState } from "react";
import {
  EQUALIZER_PRESETS,
  type EqualizerBands,
  type EqualizerPresetId,
} from "../../lib/equalizer";

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPreset: EqualizerPresetId;
  currentBands: EqualizerBands;
  onApplyPreset: (presetId: EqualizerPresetId) => void;
  onUpdateBands: (bands: EqualizerBands) => void;
}

const BANDS_CONFIG = [
  {
    key: "subBass80Hz" as const,
    label: "80 Hz",
    name: "Rumble",
    desc: "Mic thumps & floor hum",
  },
  {
    key: "warmth250Hz" as const,
    label: "250 Hz",
    name: "Warmth",
    desc: "Chest resonance & body",
  },
  {
    key: "mid1kHz" as const,
    label: "1.0 kHz",
    name: "Midrange",
    desc: "Room acoustics & boxiness",
  },
  {
    key: "vocalClarity3kHz" as const,
    label: "2.8 kHz",
    name: "Clarity",
    desc: "Speech presence & consonants",
  },
  {
    key: "air8kHz" as const,
    label: "8.0 kHz",
    name: "Air",
    desc: "Highs & sibilance control",
  },
];

export function EqualizerModal({
  isOpen,
  onClose,
  currentPreset,
  currentBands,
  onApplyPreset,
  onUpdateBands,
}: EqualizerModalProps) {
  const [bands, setBands] = useState<EqualizerBands>(currentBands);
  const [preset, setPreset] = useState<EqualizerPresetId>(currentPreset);

  if (!isOpen) return null;

  const handleSliderChange = (key: keyof EqualizerBands, value: number) => {
    const updated = { ...bands, [key]: value };
    setBands(updated);
    setPreset("custom");
    onUpdateBands(updated);
  };

  const handleSelectPreset = (presetId: EqualizerPresetId) => {
    setPreset(presetId);
    if (presetId !== "custom" && EQUALIZER_PRESETS[presetId]) {
      const newBands = { ...EQUALIZER_PRESETS[presetId].bands };
      setBands(newBands);
      onApplyPreset(presetId);
    }
  };

  const handleReset = () => {
    handleSelectPreset("flat");
  };

  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: custom accessible backdrop dialog container
      role="dialog"
      aria-modal="true"
      aria-labelledby="eq-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="w-full sm:max-w-xl surface-card border-t sm:border border-border sm:rounded-xl shadow-2xl p-5 sm:p-6 space-y-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 id="eq-title" className="text-base font-semibold text-text tracking-tight">
                5-Band Voice Equalizer
              </h2>
              <p className="text-xs font-mono text-muted">
                Parametric voice shaping & acoustic compensation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted hover:text-text rounded-md hover:bg-elevated transition-colors cursor-pointer"
            aria-label="Close Equalizer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Presets Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-muted">
            <span>Voice Presets</span>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 hover:text-accent transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.keys(EQUALIZER_PRESETS) as Array<Exclude<EqualizerPresetId, "custom">>).map(
              (key) => {
                const p = EQUALIZER_PRESETS[key];
                const isSelected = preset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectPreset(key)}
                    className={`flex flex-col text-left p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? "border-accent bg-accent/15 text-accent font-medium shadow-sm"
                        : "border-border bg-surface text-text hover:bg-elevated"
                    }`}
                  >
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-[10px] text-muted line-clamp-1 mt-0.5 font-mono">
                      {p.description}
                    </span>
                  </button>
                );
              },
            )}
          </div>
        </div>

        {/* 5-Band Sliders */}
        <div className="space-y-4 pt-2 border-t border-border">
          <div className="flex items-center justify-between text-xs font-mono text-muted">
            <span>Frequency Bands</span>
            <span className="text-accent">{preset.toUpperCase()}</span>
          </div>

          <div className="grid grid-cols-5 gap-2 sm:gap-3 py-2">
            {BANDS_CONFIG.map(({ key, label, name }) => {
              const val = bands[key];
              return (
                <div key={key} className="flex flex-col items-center gap-2">
                  <span
                    className={`text-[11px] font-mono font-medium ${
                      val !== 0 ? "text-accent" : "text-muted"
                    }`}
                  >
                    {val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)} dB
                  </span>

                  {/* Vertical Slider Wrapper */}
                  <div className="h-32 flex items-center justify-center py-1">
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={val}
                      onChange={(e) => handleSliderChange(key, Number.parseFloat(e.target.value))}
                      className="w-24 h-1.5 accent-accent bg-elevated rounded-lg appearance-none cursor-pointer -rotate-90"
                      aria-label={`${name} (${label})`}
                    />
                  </div>

                  <div className="text-center mt-1">
                    <div className="text-xs font-semibold text-text">{name}</div>
                    <div className="text-[10px] font-mono text-muted">{label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-border flex items-center justify-between text-xs font-mono text-muted">
          <span className="flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-accent" />
            <span>Real-time smooth Web Audio gain interpolation</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-accent text-bg font-semibold rounded-md hover:bg-accent-light transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
