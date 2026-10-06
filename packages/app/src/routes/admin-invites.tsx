import { Check, Copy, KeyRound, Loader2, Plus, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

interface InviteItem {
  id: string;
  createdBy: string;
  createdByName?: string | null;
  role: "admin" | "listener";
  expiresAt: number;
  maxUses: number;
  usedCount: number;
  createdAt: number;
}

export function AdminInvitesPage() {
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [role, setRole] = useState<"listener" | "admin">("listener");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [creating, setCreating] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/invites");
      if (res.ok) {
        const data = (await res.json()) as { invites: InviteItem[] };
        setInvites(data.invites || []);
      }
    } catch (err) {
      console.error("Failed to load invites:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setNewInviteUrl(null);

    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, maxUses, expiresInDays }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          success: boolean;
          invite: { inviteUrl: string };
        };
        setNewInviteUrl(data.invite.inviteUrl);
        fetchInvites();
      }
    } catch (err) {
      console.error("Failed to create invite:", err);
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-4 gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-accent text-xs font-mono">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>CURATOR CONTROL PLANE</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text break-words">
            Invite Management
          </h1>
          <p className="text-xs font-mono text-muted break-words">
            Issue 256-bit entropy cryptographic invite links to onboard listeners.
          </p>
        </div>
      </div>

      {/* Generator Form */}
      <div className="surface-card p-4 sm:p-6 border border-border space-y-4">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-accent shrink-0" />
          <span>Mint New Cryptographic Invite Link</span>
        </h3>

        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label htmlFor="role-select" className="block text-xs font-mono text-muted">
              Permission Role
            </label>
            <select
              id="role-select"
              value={role}
              onChange={(e) => setRole(e.target.value as "listener" | "admin")}
              className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none cursor-pointer"
            >
              <option value="listener">Listener (Standard)</option>
              <option value="admin">Admin (Curator)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="max-uses-input" className="block text-xs font-mono text-muted">
              Max Uses
            </label>
            <input
              id="max-uses-input"
              type="number"
              min={1}
              max={50}
              value={maxUses}
              onChange={(e) => setMaxUses(Number.parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="expires-input" className="block text-xs font-mono text-muted">
              Expires In (Days)
            </label>
            <input
              id="expires-input"
              type="number"
              min={1}
              max={30}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number.parseInt(e.target.value) || 7)}
              className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none"
            />
          </div>

          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2 rounded bg-accent text-bg text-xs font-mono font-medium flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-sm"
            >
              {creating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>GENERATING...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>GENERATE INVITE LINK</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Newly minted invite link preview */}
        {newInviteUrl && (
          <div className="p-3.5 rounded bg-accent-bg border border-accent/30 space-y-2 mt-4">
            <span className="text-[11px] font-mono text-accent uppercase tracking-wider font-semibold">
              Invite Link Ready (Single Use)
            </span>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                readOnly
                value={newInviteUrl}
                aria-label="Invite link URL"
                className="w-full text-xs font-mono px-3 py-1.5 bg-bg border border-border text-text outline-none rounded select-all min-w-0"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(newInviteUrl)}
                className="px-3 py-1.5 rounded surface-card hover:border-accent text-xs font-mono flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-accent" />
                    <span className="text-accent">COPIED</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>COPY</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invites Table */}
      <div className="space-y-3">
        <h3 className="text-xs font-mono text-subtle uppercase tracking-wider">
          Issued Invites ({invites.length})
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted text-xs font-mono">
            <Loader2 className="w-5 h-5 animate-spin text-accent mr-2" />
            <span>Loading invites...</span>
          </div>
        ) : invites.length === 0 ? (
          <div className="surface-card p-8 text-center text-xs font-mono text-muted border border-border">
            No active invites found. Generate one above to invite a listener.
          </div>
        ) : (
          <div className="surface-card border border-border overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-border bg-elevated/40 text-subtle text-[11px]">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Uses</th>
                  <th className="p-3">Expires</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invites.map((inv) => {
                  const now = Math.floor(Date.now() / 1000);
                  const isExpired = now >= inv.expiresAt;
                  const isExhausted = inv.usedCount >= inv.maxUses;

                  return (
                    <tr key={inv.id} className="hover:bg-elevated/20 transition-colors">
                      <td className="p-3 text-text font-mono">{inv.id}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-elevated border border-border uppercase">
                          {inv.role}
                        </span>
                      </td>
                      <td className="p-3">
                        {inv.usedCount} / {inv.maxUses}
                      </td>
                      <td className="p-3 text-muted">
                        {new Date(inv.expiresAt * 1000).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        {isExhausted ? (
                          <span className="text-subtle text-[10px]">EXHAUSTED</span>
                        ) : isExpired ? (
                          <span className="text-red-400 text-[10px]">EXPIRED</span>
                        ) : (
                          <span className="text-accent text-[10px] font-medium">ACTIVE</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
