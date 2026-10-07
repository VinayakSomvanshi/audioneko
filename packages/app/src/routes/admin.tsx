import {
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  FolderSync,
  KeyRound,
  Library,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useCurrentUser } from "../lib/auth-client";

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

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: "admin" | "listener";
  createdAt: number | string;
}

interface AdminStats {
  booksCount: number;
  authorsCount: number;
  seriesCount: number;
  usersCount: number;
  invitesCount: number;
}

interface ScanResult {
  added: number;
  updated: number;
  totalDriveAudioFiles: number;
  errors?: string[];
}

export function AdminDashboardPage() {
  const { user, isAdmin, isLoading: authLoading } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<"scanner" | "invites" | "users">("scanner");

  // Stats state
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Scanner state
  const [folderId, setFolderId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Invites state
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [role, setRole] = useState<"listener" | "admin">("listener");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Users state
  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [generatedResetLink, setGeneratedResetLink] = useState<{
    email: string;
    url: string;
    token: string;
  } | null>(null);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        const data = (await res.json()) as AdminStats;
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load admin stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchInvites = useCallback(async () => {
    setInvitesLoading(true);
    try {
      const res = await fetch("/api/invites");
      if (res.ok) {
        const data = (await res.json()) as { invites: InviteItem[] };
        setInvites(data.invites || []);
      }
    } catch (err) {
      console.error("Failed to load invites:", err);
    } finally {
      setInvitesLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = (await res.json()) as { users: UserItem[] };
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchStats();
      fetchInvites();
      fetchUsers();
    }
  }, [isAdmin, fetchStats, fetchInvites, fetchUsers]);

  // Handle trigger drive scan
  const handleTriggerScan = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setScanning(true);
    setScanResult(null);
    setScanError(null);

    try {
      const body = folderId.trim() ? { folderId: folderId.trim() } : {};
      const res = await fetch("/api/admin/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { success?: boolean; result?: ScanResult; error?: string };
      if (!res.ok || data.error) {
        setScanError(data.error || "Library scan request failed.");
      } else if (data.result) {
        setScanResult(data.result);
        fetchStats();
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  // Handle create invite
  const handleCreateInvite = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingInvite(true);
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
        fetchStats();
      }
    } catch (err) {
      console.error("Failed to create invite:", err);
    } finally {
      setCreatingInvite(false);
    }
  };

  // Handle revoke invite
  const handleRevokeInvite = async (inviteId: string) => {
    setRevokingId(inviteId);
    try {
      const res = await fetch(`/api/admin/invites/${inviteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
        fetchStats();
      }
    } catch (err) {
      console.error("Failed to revoke invite:", err);
    } finally {
      setRevokingId(null);
    }
  };

  // Handle update user role
  const handleToggleUserRole = async (targetUser: UserItem) => {
    const nextRole = targetUser.role === "admin" ? "listener" : "admin";
    if (targetUser.id === user?.id && nextRole !== "admin") {
      alert("You cannot demote your own active admin account.");
      return;
    }

    setUpdatingUserId(targetUser.id);
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === targetUser.id ? { ...u, role: nextRole } : u)),
        );
      }
    } catch (err) {
      console.error("Failed to update user role:", err);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleGenerateResetLink = async (targetUser: UserItem) => {
    setResettingUserId(targetUser.id);
    setGeneratedResetLink(null);
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/reset-token`, {
        method: "POST",
      });
      const data = (await res.json()) as { success?: boolean; resetUrl?: string; token?: string };
      if (data.success && data.resetUrl && data.token) {
        setGeneratedResetLink({
          email: targetUser.email,
          url: data.resetUrl,
          token: data.token,
        });
      }
    } catch (err) {
      console.error("Failed to generate reset link:", err);
    } finally {
      setResettingUserId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <p className="text-xs font-mono text-muted">Authenticating curator privileges...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto surface-card p-8 border border-border mt-12 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-accent mx-auto" />
        <h2 className="text-base font-bold text-text">Admin Access Required</h2>
        <p className="text-xs font-mono text-muted">
          Your current account ({user?.email || "guest"}) does not have curator/admin privileges.
          Sign in with an authorized admin account to manage library indexing and invites.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-32">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border pb-4 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-accent text-xs font-mono font-medium">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>CURATOR CONTROL PLANE</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text break-words">
            Admin Management
          </h1>
          <p className="text-xs font-mono text-muted break-words">
            Google Drive automated sync, cryptographic invites, user access, and active shelf
            maintenance.
          </p>
        </div>

        {/* Global Quick Action: Re-scan */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleTriggerScan()}
            disabled={scanning}
            className="w-full sm:w-auto justify-center px-4 py-2 rounded bg-accent text-bg text-xs font-mono font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-sm"
          >
            {scanning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FolderSync className="w-4 h-4" />
            )}
            <span>{scanning ? "Scanning Library..." : "Sync Google Drive"}</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="surface-card p-4 border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-[11px] font-mono">Audiobooks</span>
            <Library className="w-4 h-4 text-accent" />
          </div>
          <div className="text-2xl font-bold font-mono text-text">
            {stats ? stats.booksCount : statsLoading ? "…" : "—"}
          </div>
        </div>

        <div className="surface-card p-4 border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-[11px] font-mono">Authors</span>
            <Users className="w-4 h-4 text-accent" />
          </div>
          <div className="text-2xl font-bold font-mono text-text">
            {stats ? stats.authorsCount : statsLoading ? "…" : "—"}
          </div>
        </div>

        <div className="surface-card p-4 border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-[11px] font-mono">Series</span>
            <BookOpen className="w-4 h-4 text-accent" />
          </div>
          <div className="text-2xl font-bold font-mono text-text">
            {stats ? stats.seriesCount : statsLoading ? "…" : "—"}
          </div>
        </div>

        <div className="surface-card p-4 border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-[11px] font-mono">Users</span>
            <UserCheck className="w-4 h-4 text-accent" />
          </div>
          <div className="text-2xl font-bold font-mono text-text">
            {stats ? stats.usersCount : statsLoading ? "…" : "—"}
          </div>
        </div>

        <div className="surface-card p-4 border border-border flex flex-col justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-[11px] font-mono">Active Invites</span>
            <KeyRound className="w-4 h-4 text-accent" />
          </div>
          <div className="text-2xl font-bold font-mono text-text">
            {stats ? stats.invitesCount : statsLoading ? "…" : "—"}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border overflow-x-auto pb-px">
        <button
          type="button"
          onClick={() => setActiveTab("scanner")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "scanner"
              ? "border-accent text-accent font-semibold bg-accent-bg/20"
              : "border-transparent text-muted hover:text-text hover:border-border"
          }`}
        >
          <FolderSync className="w-4 h-4" />
          <span>Google Drive Scanner</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("invites")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "invites"
              ? "border-accent text-accent font-semibold bg-accent-bg/20"
              : "border-transparent text-muted hover:text-text hover:border-border"
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Invite Generator & Management</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "users"
              ? "border-accent text-accent font-semibold bg-accent-bg/20"
              : "border-transparent text-muted hover:text-text hover:border-border"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Management</span>
        </button>
      </div>

      {/* TAB 1: SCANNER */}
      {activeTab === "scanner" && (
        <div className="space-y-6">
          <div className="surface-card p-6 border border-border space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                  <FolderSync className="w-4 h-4 text-accent" />
                  <span>Automated Library Indexer & Metadata Enricher</span>
                </h3>
                <p className="text-xs font-mono text-muted mt-1">
                  Recursively crawls your root Google Drive folder, parses M4B chapter atoms,
                  downloads embedded 1:1 covers, and auto-queries Apple Books / iTunes for high-res
                  artwork.
                </p>
              </div>
            </div>

            <form onSubmit={handleTriggerScan} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label htmlFor="folder-input" className="block text-xs font-mono text-muted">
                  Google Drive Folder ID (Leave blank to use environment default)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="folder-input"
                    type="text"
                    placeholder="1Eb41o9yGeJoojEYniUZvRCjaxBziLN-Z"
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded"
                  />
                  <button
                    type="submit"
                    disabled={scanning}
                    className="px-5 py-2 rounded bg-accent text-bg text-xs font-mono font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer whitespace-nowrap shadow-sm"
                  >
                    {scanning ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span>{scanning ? "Indexing Drive Files..." : "Run Full Scan"}</span>
                  </button>
                </div>
              </div>
            </form>

            {/* Scan Progress / Results Display */}
            {scanning && (
              <div className="p-4 border border-accent/40 bg-accent-bg/10 rounded flex items-center gap-3 text-xs font-mono text-accent">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>
                  Querying Google Drive API, analyzing M4B containers, and enriching book
                  metadata... Please hold.
                </span>
              </div>
            )}

            {scanError && (
              <div className="p-4 border border-rose-500/40 bg-rose-500/10 rounded flex items-start gap-3 text-xs font-mono text-rose-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Scan Failed</div>
                  <div>{scanError}</div>
                </div>
              </div>
            )}

            {scanResult && (
              <div className="p-4 border border-border bg-elevated rounded space-y-3">
                <div className="flex items-center gap-2 text-xs font-mono text-accent font-semibold">
                  <Check className="w-4 h-4" />
                  <span>Library Scan Completed Successfully</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="surface-card p-3 border border-border">
                    <span className="text-muted block text-[10px]">Files Discovered</span>
                    <span className="font-bold text-text text-base">
                      {scanResult.totalDriveAudioFiles}
                    </span>
                  </div>
                  <div className="surface-card p-3 border border-border">
                    <span className="text-muted block text-[10px]">New Audiobooks Added</span>
                    <span className="font-bold text-accent text-base">{scanResult.added}</span>
                  </div>
                  <div className="surface-card p-3 border border-border">
                    <span className="text-muted block text-[10px]">Updated / Rescanned</span>
                    <span className="font-bold text-text text-base">{scanResult.updated}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: INVITES */}
      {activeTab === "invites" && (
        <div className="space-y-6">
          {/* New Invite Form */}
          <div className="surface-card p-6 border border-border space-y-4">
            <h3 className="text-sm font-semibold text-text flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-accent" />
              <span>Mint New Cryptographic Invite Link</span>
            </h3>

            <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                  <option value="listener">Listener (Standard Streaming)</option>
                  <option value="admin">Admin (Curator Control Plane)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="max-uses-input" className="block text-xs font-mono text-muted">
                  Maximum Uses
                </label>
                <input
                  id="max-uses-input"
                  type="number"
                  min={1}
                  max={100}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number.parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded"
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
                  max={60}
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number.parseInt(e.target.value, 10) || 7)}
                  className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded"
                />
              </div>

              <div className="sm:col-span-3 flex justify-end">
                <button
                  type="submit"
                  disabled={creatingInvite}
                  className="px-5 py-2 rounded bg-accent text-bg text-xs font-mono font-medium flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-sm"
                >
                  {creatingInvite ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Generate Invite Link</span>
                </button>
              </div>
            </form>

            {newInviteUrl && (
              <div className="p-4 border border-accent/40 bg-accent-bg/10 rounded space-y-2 mt-4">
                <span className="text-[11px] font-mono text-accent font-semibold block">
                  New Invite Created (Share with your listener):
                </span>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={newInviteUrl}
                    className="flex-1 px-3 py-1.5 text-xs font-mono bg-bg border border-border rounded text-text select-all min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(newInviteUrl, "new-link")}
                    className="px-3 py-1.5 bg-accent text-bg text-xs font-mono font-medium rounded flex items-center justify-center gap-1.5 hover:opacity-90 cursor-pointer shrink-0"
                  >
                    {copiedId === "new-link" ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedId === "new-link" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Invites List Table */}
          <div className="surface-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted">
                Active & Exhausted Invites ({invites.length})
              </h3>
              <button
                type="button"
                onClick={() => fetchInvites()}
                disabled={invitesLoading}
                className="text-xs font-mono text-subtle hover:text-text flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${invitesLoading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            {invitesLoading && invites.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono text-muted">
                Loading invite links...
              </div>
            ) : invites.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono text-muted">
                No invite links have been minted yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-elevated text-subtle border-b border-border">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Invite ID</th>
                      <th className="py-2.5 px-4 font-medium">Role</th>
                      <th className="py-2.5 px-4 font-medium">Uses</th>
                      <th className="py-2.5 px-4 font-medium">Expires</th>
                      <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invites.map((inv) => {
                      const isExpired = inv.expiresAt * 1000 < Date.now();
                      const isExhausted = inv.usedCount >= inv.maxUses;
                      const isActive = !isExpired && !isExhausted;

                      return (
                        <tr key={inv.id} className="hover:bg-elevated/40 transition-colors">
                          <td className="py-3 px-4 text-text font-mono">
                            <span className="truncate block max-w-[140px]">{inv.id}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                                inv.role === "admin"
                                  ? "bg-accent-bg text-accent border border-accent/40"
                                  : "bg-elevated text-muted border border-border"
                              }`}
                            >
                              {inv.role}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-text font-bold">{inv.usedCount}</span>
                            <span className="text-subtle"> / {inv.maxUses}</span>
                          </td>
                          <td className="py-3 px-4 text-muted">
                            {new Date(inv.expiresAt * 1000).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isActive ? (
                                <span className="text-[10px] text-emerald-400 font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                                  Active
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted font-mono px-2 py-0.5 rounded bg-elevated border border-border">
                                  {isExhausted ? "Exhausted" : "Expired"}
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => handleRevokeInvite(inv.id)}
                                disabled={revokingId === inv.id}
                                className="p-1.5 text-muted hover:text-rose-400 surface-card border border-border rounded transition-colors cursor-pointer"
                                title="Revoke / Delete Invite"
                              >
                                {revokingId === inv.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
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
      )}

      {/* TAB 3: USERS */}
      {activeTab === "users" && (
        <div className="space-y-6">
          <div className="surface-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text">Registered Listeners & Admins</h3>
                <p className="text-xs font-mono text-muted">
                  Users registered on this private audioneko server instance.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchUsers()}
                disabled={usersLoading}
                className="text-xs font-mono text-subtle hover:text-text flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${usersLoading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            {generatedResetLink && (
              <div className="p-4 bg-accent-bg/15 border-b border-accent/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-accent font-semibold flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Password Reset Link for {generatedResetLink.email}:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setGeneratedResetLink(null)}
                    className="text-[11px] font-mono text-muted hover:text-text cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedResetLink.url}
                    className="flex-1 px-3 py-1.5 text-xs font-mono bg-bg border border-border rounded text-text select-all min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedResetLink.url, "reset-link")}
                    className="px-3 py-1.5 bg-accent text-bg text-xs font-mono font-medium rounded flex items-center justify-center gap-1.5 hover:opacity-90 cursor-pointer shrink-0"
                  >
                    {copiedId === "reset-link" ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedId === "reset-link" ? "Copied" : "Copy Link"}</span>
                  </button>
                </div>
              </div>
            )}

            {usersLoading && users.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono text-muted">
                Loading registered users...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-elevated text-subtle border-b border-border">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Name</th>
                      <th className="py-2.5 px-4 font-medium">Email</th>
                      <th className="py-2.5 px-4 font-medium">Role</th>
                      <th className="py-2.5 px-4 font-medium text-right">Access Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-elevated/40 transition-colors">
                        <td className="py-3 px-4 font-semibold text-text">
                          <div className="flex items-center gap-2">
                            <span>{u.name}</span>
                            {u.id === user?.id && (
                              <span className="text-[10px] text-accent border border-accent/40 px-1 rounded">
                                You
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted">{u.email}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono ${
                              u.role === "admin"
                                ? "bg-accent-bg text-accent border border-accent/40 font-bold"
                                : "bg-elevated text-muted border border-border"
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleGenerateResetLink(u)}
                              disabled={resettingUserId === u.id}
                              className="px-2.5 py-1 rounded text-xs font-mono border border-border surface-card hover:border-accent hover:text-accent transition-colors cursor-pointer flex items-center gap-1.5"
                              title="Generate 1-click password reset link for user"
                            >
                              {resettingUserId === u.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <KeyRound className="w-3 h-3 text-accent" />
                              )}
                              <span>Reset Link</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleUserRole(u)}
                              disabled={updatingUserId === u.id || u.id === user?.id}
                              className={`px-3 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
                                u.role === "admin"
                                  ? "border-border text-muted hover:text-rose-400 hover:border-rose-400/50"
                                  : "border-accent/40 text-accent hover:bg-accent-bg"
                              } disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                              {updatingUserId === u.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : u.role === "admin" ? (
                                "Demote to Listener"
                              ) : (
                                "Promote to Admin"
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
