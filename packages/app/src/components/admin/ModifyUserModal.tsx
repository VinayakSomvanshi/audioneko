import { AlertTriangle, Edit2, Loader2, ShieldCheck, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

export interface UserItem {
  id: string;
  name: string;
  email: string;
  role: "admin" | "listener";
  createdAt: number | string;
}

interface ModifyUserModalProps {
  user: UserItem | null;
  currentAdminId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedUser: UserItem) => void;
}

export function ModifyUserModal({
  user,
  currentAdminId,
  isOpen,
  onClose,
  onSuccess,
}: ModifyUserModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "listener">("listener");
  const [typedConfirm, setTypedConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user && isOpen) {
      setName(user.name);
      setEmail(user.email);
      setRole(user.role);
      setTypedConfirm("");
      setErrorMsg(null);
    }
  }, [user, isOpen]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, loading]);

  if (!isOpen || !user) return null;

  const isSelf = user.id === currentAdminId;
  const isConfirmed = typedConfirm.trim() === "CONFIRM";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isConfirmed || loading) return;

    if (!name.trim()) {
      setErrorMsg("Display name cannot be empty.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setErrorMsg("A valid email address is required.");
      return;
    }

    if (isSelf && role !== "admin") {
      setErrorMsg("You cannot demote your own active admin account.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
        }),
      });

      const data = (await res.json()) as { success?: boolean; user?: UserItem; error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to update user profile");
      }

      if (data.user) {
        onSuccess(data.user);
        onClose();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error modifying user.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="modify-user-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md w-full h-full border-none max-w-none max-h-none m-0"
      onClick={() => {
        if (!loading) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !loading) onClose();
      }}
    >
      <div
        className="w-full max-w-lg surface-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-bg/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent-bg border border-accent/30 text-accent">
              <Edit2 className="w-4 h-4" />
            </div>
            <div>
              <h3 id="modify-user-title" className="text-sm font-semibold tracking-tight text-text">
                Modify User Profile & Permissions
              </h3>
              <p className="text-[11px] font-mono text-muted">ID: {user.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded text-muted hover:text-text hover:bg-elevated transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-2.5 rounded bg-rose-950/30 border border-rose-800/40 text-rose-400 text-xs font-mono">
              {errorMsg}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="modify-user-name" className="block text-xs font-mono text-muted">
              Display Name
            </label>
            <input
              id="modify-user-name"
              type="text"
              required
              disabled={loading}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded border border-border"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="modify-user-email" className="block text-xs font-mono text-muted">
              Email Address
            </label>
            <input
              id="modify-user-email"
              type="email"
              required
              disabled={loading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded border border-border"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="modify-user-role" className="block text-xs font-mono text-muted">
              Instance Role & Privileges
            </label>
            <select
              id="modify-user-role"
              disabled={loading || (isSelf && role === "admin")}
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "listener")}
              className="w-full px-3 py-2 text-xs font-mono surface-card text-text focus:border-accent outline-none rounded border border-border cursor-pointer disabled:opacity-50"
            >
              <option value="listener">listener (Standard Audiobook Access)</option>
              <option value="admin">admin (Full Instance Curator Control Plane)</option>
            </select>
            {isSelf && (
              <span className="text-[10px] font-mono text-subtle block pt-1">
                You cannot demote your own logged-in admin account.
              </span>
            )}
          </div>

          {/* Strict Security Confirmation Box */}
          <div className="p-3.5 rounded bg-bg/80 border border-accent/30 space-y-2">
            <div className="flex items-center gap-1.5 text-accent text-xs font-mono font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Strict Confirmation Required</span>
            </div>
            <label htmlFor="modify-confirm-phrase" className="block text-xs font-mono text-muted">
              To apply modifications to this account, type{" "}
              <span className="text-text font-bold select-all bg-elevated px-1.5 py-0.5 rounded border border-border">
                CONFIRM
              </span>{" "}
              below:
            </label>
            <input
              id="modify-confirm-phrase"
              type="text"
              required
              disabled={loading}
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              placeholder="Type CONFIRM to authorize"
              className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/50 focus:border-accent outline-none rounded border border-border"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-1.5 rounded surface-card text-muted hover:text-text text-xs font-mono transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isConfirmed || loading}
              className="px-4 py-1.5 rounded bg-accent text-bg text-xs font-mono font-semibold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Modifications</span>
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
