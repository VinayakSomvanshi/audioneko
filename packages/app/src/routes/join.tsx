import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { NekoIcon } from "../components/icons/NekoIcon";

export function JoinPage() {
  const navigate = useNavigate();
  // Extract token from query params or window location
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [inviteRole, setInviteRole] = useState<string>("listener");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get("token") || "";
    setToken(tokenParam);

    if (!tokenParam) {
      setLoading(false);
      setInviteValid(false);
      setErrorMsg("Missing invite token in link");
      return;
    }

    // Verify token with API
    fetch(`/api/invites/verify?token=${encodeURIComponent(tokenParam)}`)
      .then((res) => res.json())
      .then((data: { valid: boolean; reason?: string; role?: string }) => {
        setLoading(false);
        if (data.valid) {
          setInviteValid(true);
          setInviteRole(data.role || "listener");
        } else {
          setInviteValid(false);
          setErrorMsg(
            data.reason === "expired"
              ? "This invite link has expired"
              : data.reason === "exhausted"
                ? "This invite link has reached its maximum uses"
                : "Invalid or unrecognized invite token",
          );
        }
      })
      .catch(() => {
        setLoading(false);
        setInviteValid(false);
        setErrorMsg("Failed to verify invite token");
      });
  }, []);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/invites/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Registration failed" }));
        throw new Error(data.message || "Failed to register");
      }

      // Success: redirect to library
      navigate({ to: "/" });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Registration failed");
      setSubmitting(false);
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
          Private, invite-only audiobook streaming library
        </p>
      </div>

      <div className="surface-card p-6 border border-border space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-text">
            Join Library
          </h2>
          <span className="text-[11px] font-mono text-muted">Invite Redemption</span>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-2 text-muted">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
            <span className="text-xs font-mono">Verifying invite token...</span>
          </div>
        ) : !inviteValid ? (
          <div className="space-y-4 text-center py-4">
            <div className="flex justify-center text-accent">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-text">Invalid Invite Link</h3>
              <p className="text-xs font-mono text-muted">{errorMsg}</p>
            </div>
            <p className="text-[11px] font-mono text-subtle pt-2 border-t border-border">
              Contact the library curator for a fresh cryptographic invite link.
            </p>
            {token && (
              <div className="pt-2">
                <a
                  href={`/login?resetToken=${encodeURIComponent(token)}`}
                  className="inline-block px-3 py-1.5 text-xs font-mono text-accent hover:underline border border-accent/30 rounded bg-accent-bg/10"
                >
                  Were you trying to reset your password? Click here
                </a>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="flex items-center gap-2 p-2.5 rounded bg-accent-bg border border-accent/20 text-accent text-xs font-mono">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Valid invite link • {inviteRole.toUpperCase()} ACCESS</span>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded bg-red-950/30 border border-red-800/40 text-red-400 text-xs font-mono">
                {errorMsg}
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="name-input" className="block text-xs font-mono text-muted">
                Full Name
              </label>
              <input
                id="name-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vinayak Somvanshi"
                className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="email-input" className="block text-xs font-mono text-muted">
                Email Address
              </label>
              <input
                id="email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password-input" className="block text-xs font-mono text-muted">
                Master Password
              </label>
              <input
                id="password-input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded"
              />
              <span className="text-[10px] font-mono text-subtle">
                Minimum 8 characters. Stored securely with PBKDF2 hashing.
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded bg-accent text-bg text-xs font-mono font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>CREATING ACCOUNT...</span>
                </>
              ) : (
                <span>REDEEM INVITE & JOIN</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
