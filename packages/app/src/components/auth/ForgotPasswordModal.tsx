import { AlertCircle, CheckCircle2, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { requestPasswordReset, submitPasswordReset } from "../../lib/auth-client";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
  initialToken?: string;
  onSuccess?: () => void;
}

export function ForgotPasswordModal({
  isOpen,
  onClose,
  initialEmail = "",
  initialToken = "",
  onSuccess,
}: ForgotPasswordModalProps) {
  const [activeTab, setActiveTab] = useState<"request" | "reset">(
    initialToken ? "reset" : "request",
  );

  // Request form state
  const [requestEmail, setRequestEmail] = useState(initialEmail);
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestFeedback, setRequestFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  // Reset form state
  const [resetToken, setResetToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  useEffect(() => {
    if (initialToken) {
      setResetToken(initialToken);
      setActiveTab("reset");
    }
    if (initialEmail) {
      setRequestEmail(initialEmail);
    }
  }, [initialToken, initialEmail]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!requestEmail.trim()) return;

    setIsRequesting(true);
    setRequestFeedback(null);

    const result = await requestPasswordReset(requestEmail.trim());
    setIsRequesting(false);

    if (result.success) {
      setRequestFeedback({
        type: "success",
        msg: "Reset token registered. If your administrator has provided a token or reset link, proceed to the 'Set New Password' tab below.",
      });
    } else {
      setRequestFeedback({
        type: "error",
        msg: result.message || "Failed to initiate password reset.",
      });
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetToken.trim() || !newPassword || !confirmPassword) return;

    if (newPassword.length < 8) {
      setResetFeedback({
        type: "error",
        msg: "New password must be at least 8 characters long.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetFeedback({
        type: "error",
        msg: "Passwords do not match.",
      });
      return;
    }

    setIsResetting(true);
    setResetFeedback(null);

    const result = await submitPasswordReset({
      token: resetToken.trim(),
      newPassword,
    });
    setIsResetting(false);

    if (result.success) {
      setResetFeedback({
        type: "success",
        msg: "Password updated successfully! You can now sign in with your new password.",
      });
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2000);
    } else {
      setResetFeedback({
        type: "error",
        msg: result.error || "Failed to reset password. Token may be invalid or expired.",
      });
    }
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="forgot-password-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md w-full h-full border-none max-w-none max-h-none m-0"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="w-full max-w-md surface-card border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-surface/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent/10 border border-accent/20 text-accent">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="forgot-password-title"
                className="text-sm font-semibold text-text tracking-tight"
              >
                Password Recovery
              </h2>
              <p className="text-[11px] font-mono text-muted">
                audioneko private instance recovery
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted hover:text-text rounded-md hover:bg-surface transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-3 bg-elevated/30 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("request")}
            className={`flex-1 py-2 text-xs font-mono border-b-2 text-center transition-colors cursor-pointer ${
              activeTab === "request"
                ? "border-accent text-accent font-semibold"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            1. Request Reset
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reset")}
            className={`flex-1 py-2 text-xs font-mono border-b-2 text-center transition-colors cursor-pointer ${
              activeTab === "reset"
                ? "border-accent text-accent font-semibold"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            2. Set New Password
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {activeTab === "request" && (
            <div className="space-y-4">
              <div className="p-3 surface-card border border-border rounded text-[11px] font-mono text-muted space-y-1.5">
                <div className="flex items-center gap-1.5 text-text font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                  <span>How Password Reset Works Here</span>
                </div>
                <p>
                  audioneko is a private, self-hosted streaming server. If external transactional
                  email is enabled, an email is sent. Otherwise, your server administrator can
                  generate a 1-click reset link directly from the Admin Console.
                </p>
              </div>

              {requestFeedback && (
                <div
                  className={`p-3 rounded-lg border text-xs font-mono flex items-start gap-2 ${
                    requestFeedback.type === "success"
                      ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-400"
                      : "bg-red-950/30 border-red-800/40 text-red-400"
                  }`}
                >
                  {requestFeedback.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  )}
                  <span>{requestFeedback.msg}</span>
                </div>
              )}

              <form onSubmit={handleRequest} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="reset-req-email" className="block text-xs font-mono text-muted">
                    Account Email Address
                  </label>
                  <input
                    id="reset-req-email"
                    type="email"
                    required
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none rounded"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isRequesting || !requestEmail.trim()}
                  className="w-full py-2.5 rounded bg-accent text-bg text-xs font-mono font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-sm"
                >
                  {isRequesting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>SUBMITTING REQUEST...</span>
                    </>
                  ) : (
                    <span>REQUEST RESET TOKEN</span>
                  )}
                </button>
              </form>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setActiveTab("reset")}
                  className="text-xs font-mono text-accent hover:underline cursor-pointer"
                >
                  Already have a Reset Token from your administrator?
                </button>
              </div>
            </div>
          )}

          {activeTab === "reset" && (
            <div className="space-y-4">
              {resetFeedback && (
                <div
                  className={`p-3 rounded-lg border text-xs font-mono flex items-start gap-2 ${
                    resetFeedback.type === "success"
                      ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-400"
                      : "bg-red-950/30 border-red-800/40 text-red-400"
                  }`}
                >
                  {resetFeedback.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  )}
                  <span>{resetFeedback.msg}</span>
                </div>
              )}

              <form onSubmit={handleReset} className="space-y-3.5">
                <div className="space-y-1">
                  <label htmlFor="token-input" className="block text-xs font-mono text-muted">
                    Reset Token (from link or administrator)
                  </label>
                  <input
                    id="token-input"
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Paste reset token here"
                    className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none rounded"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="new-pass-input" className="block text-xs font-mono text-muted">
                    New Password (min 8 chars)
                  </label>
                  <input
                    id="new-pass-input"
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none rounded"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="confirm-pass-input"
                    className="block text-xs font-mono text-muted"
                  >
                    Confirm New Password
                  </label>
                  <input
                    id="confirm-pass-input"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none rounded"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isResetting || !resetToken || !newPassword || !confirmPassword}
                  className="w-full py-2.5 rounded bg-accent text-bg text-xs font-mono font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-sm"
                >
                  {isResetting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>UPDATING PASSWORD...</span>
                    </>
                  ) : (
                    <span>SET NEW PASSWORD</span>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
