import { Link, useNavigate } from "@tanstack/react-router";
import { HardDriveDownload, Loader2, ShieldAlert } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { ForgotPasswordModal } from "../components/auth/ForgotPasswordModal";
import { NekoIcon } from "../components/icons/NekoIcon";
import { signIn, useCurrentUser } from "../lib/auth-client";

export function LoginPage() {
  const navigate = useNavigate();
  const { user, isLoading } = useCurrentUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Forgot password modal state
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [initialResetToken, setInitialResetToken] = useState("");
  const [initialResetEmail, setInitialResetEmail] = useState("");

  // Check URL query parameters for reset token
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || params.get("resetToken");
    const mail = params.get("email");
    if (token) {
      setInitialResetToken(token);
      if (mail) {
        setInitialResetEmail(mail);
        setEmail(mail);
      }
      setIsForgotOpen(true);
    }
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && user) {
      navigate({ to: "/" });
    }
  }, [user, isLoading, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setErrorMsg(null);

    const result = await signIn.email({
      email: email.trim().toLowerCase(),
      password,
    });

    setLoading(false);

    if (result.error) {
      setErrorMsg(result.error.message || "Invalid email or password");
    } else {
      navigate({ to: "/" });
    }
  };

  return (
    <div className="max-w-md mx-auto py-8 sm:py-12 px-4 space-y-6">
      {/* Prominent audioneko center branding */}
      <div className="text-center space-y-3">
        <div className="inline-flex p-4 rounded-2xl bg-accent-bg border border-accent/30 text-accent shadow-lg shadow-accent/10 ring-1 ring-accent/20 mb-1 transition-transform duration-300 hover:scale-105">
          <NekoIcon className="w-10 h-10 text-accent" />
        </div>
        <div className="flex items-center justify-center">
          <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-text">
            audioneko
          </span>
        </div>
        <p className="text-xs font-mono text-muted max-w-xs mx-auto">
          Private, self-hosted audiobook streaming sanctuary
        </p>
      </div>

      <div className="surface-card p-6 border border-border space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-text">
            Sign In
          </h2>
          <span className="text-[11px] font-mono text-muted">Personal Shelf</span>
        </div>
        {errorMsg && (
          <div className="p-2.5 rounded bg-red-950/30 border border-red-800/40 text-red-400 text-xs font-mono">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="login-email-input" className="block text-xs font-mono text-muted">
              Email Address
            </label>
            <input
              id="login-email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password-input" className="block text-xs font-mono text-muted">
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setInitialResetEmail(email);
                  setIsForgotOpen(true);
                }}
                className="text-[11px] font-mono text-muted hover:text-accent transition-colors cursor-pointer"
              >
                Forgot password?
              </button>
            </div>
            <input
              id="login-password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded bg-accent text-bg text-xs font-mono font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>SIGNING IN...</span>
              </>
            ) : (
              <span>SIGN IN</span>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-border flex items-start gap-2 text-subtle text-[11px] font-mono">
          <ShieldAlert className="w-4 h-4 shrink-0 text-accent mt-0.5" />
          <span>
            audioneko is private and invite-only. New accounts can only be created via a
            cryptographic invite link.
          </span>
        </div>

        <div className="pt-3 border-t border-border/50 flex justify-center">
          <Link
            to="/offline"
            className="text-[11px] font-mono text-muted hover:text-accent transition-colors flex items-center gap-1.5"
          >
            <HardDriveDownload className="w-3.5 h-3.5" />
            <span>Access Offline Audiobooks</span>
          </Link>
        </div>
      </div>

      {/* Forgot / Reset Password Dialog */}
      <ForgotPasswordModal
        isOpen={isForgotOpen}
        onClose={() => setIsForgotOpen(false)}
        initialEmail={initialResetEmail || email}
        initialToken={initialResetToken}
        onSuccess={() => {
          setErrorMsg(null);
        }}
      />
    </div>
  );
}
