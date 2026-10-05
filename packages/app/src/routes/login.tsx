import { useNavigate } from "@tanstack/react-router";
import { Loader2, LogIn, ShieldAlert } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { signIn, useCurrentUser } from "../lib/auth-client";

export function LoginPage() {
  const navigate = useNavigate();
  const { user, isLoading } = useCurrentUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    <div className="max-w-md mx-auto py-12 px-4 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex p-3 surface-card rounded-full text-accent mb-2">
          <LogIn className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-text">Sign In</h1>
        <p className="text-xs font-mono text-muted">Access your personal audioneko shelf</p>
      </div>

      <div className="surface-card p-6 border border-border space-y-4">
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
              className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="login-password-input" className="block text-xs font-mono text-muted">
              Password
            </label>
            <input
              id="login-password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none"
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
      </div>
    </div>
  );
}
