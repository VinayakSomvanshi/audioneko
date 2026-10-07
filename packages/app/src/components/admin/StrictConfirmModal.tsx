import { AlertTriangle, Loader2, ShieldAlert, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

interface StrictConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  requiredPhrase: string;
  confirmButtonText: string;
  danger?: boolean;
  isPending?: boolean;
}

export function StrictConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  requiredPhrase,
  confirmButtonText,
  danger = false,
  isPending = false,
}: StrictConfirmModalProps) {
  const [typedValue, setTypedValue] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTypedValue("");
      setErrorMsg(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  if (!isOpen) return null;

  const isMatched = typedValue.trim() === requiredPhrase.trim();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isMatched || isPending) return;

    try {
      setErrorMsg(null);
      await onConfirm();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Confirmation failed.");
    }
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="strict-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md w-full h-full border-none max-w-none max-h-none m-0"
      onClick={() => {
        if (!isPending) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !isPending) onClose();
      }}
    >
      <div
        className="w-full max-w-md surface-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-bg/50">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-1.5 rounded-lg border ${
                danger
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                  : "bg-accent-bg border-accent/30 text-accent"
              }`}
            >
              {danger ? <AlertTriangle className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            </div>
            <div>
              <h3
                id="strict-confirm-title"
                className="text-sm font-semibold tracking-tight text-text"
              >
                {title}
              </h3>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted">
                Strict Security Challenge
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1 rounded text-muted hover:text-text hover:bg-elevated transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          <p className="text-xs font-mono text-muted leading-relaxed">{description}</p>

          {errorMsg && (
            <div className="p-2.5 rounded bg-rose-950/30 border border-rose-800/40 text-rose-400 text-xs font-mono">
              {errorMsg}
            </div>
          )}

          <div className="space-y-2 p-3 rounded bg-bg/80 border border-border">
            <label htmlFor="strict-confirm-input" className="block text-xs font-mono text-subtle">
              To proceed, type{" "}
              <span className="text-text font-bold select-all bg-elevated px-1.5 py-0.5 rounded border border-border">
                {requiredPhrase}
              </span>{" "}
              below:
            </label>
            <input
              id="strict-confirm-input"
              ref={inputRef}
              type="text"
              required
              disabled={isPending}
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder={`Type "${requiredPhrase}" to unlock`}
              className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/50 focus:border-accent outline-none rounded border border-border"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-3 py-1.5 rounded surface-card text-muted hover:text-text text-xs font-mono transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isMatched || isPending}
              className={`px-4 py-1.5 rounded text-xs font-mono font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                danger
                  ? "bg-rose-600 hover:bg-rose-500 text-white border border-rose-500/40"
                  : "bg-accent hover:opacity-90 text-bg"
              }`}
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{confirmButtonText}</span>
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
