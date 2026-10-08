import {
  AlertTriangle,
  BarChart2,
  BookOpen,
  Check,
  Copy,
  Edit2,
  Edit3,
  Eye,
  FolderSync,
  KeyRound,
  Layers,
  Library,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AdminVisibilityResponse } from "@audioneko/shared";
import {
  type EditableBookMetadata,
  MetadataFixerModal,
} from "../components/admin/MetadataFixerModal";
import { ModifyUserModal } from "../components/admin/ModifyUserModal";
import { StrictConfirmModal } from "../components/admin/StrictConfirmModal";
import { UserStatsModal } from "../components/admin/UserStatsModal";
import { useCurrentUser } from "../lib/auth-client";
import { getBookCoverUrl } from "../lib/covers";

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      id={id}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        checked ? "bg-accent" : "bg-border hover:bg-subtle/40"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

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
  const [activeTab, setActiveTab] = useState<
    "scanner" | "invites" | "users" | "books" | "visibility"
  >("scanner");

  // Stats state
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Visibility state
  const [visibilityData, setVisibilityData] = useState<AdminVisibilityResponse | null>(null);
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "books" | "series" | "authors"
  >("all");
  const [visibilitySearch, setVisibilitySearch] = useState("");
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const searchLower = visibilitySearch.trim().toLowerCase();

  const filteredSeries = useMemo(() => {
    if (!visibilityData?.series) return [];
    if (!searchLower) return visibilityData.series;
    return visibilityData.series.filter(
      (s) =>
        s.name.toLowerCase().includes(searchLower) ||
        s.primaryAuthor.toLowerCase().includes(searchLower),
    );
  }, [visibilityData?.series, searchLower]);

  const filteredAuthors = useMemo(() => {
    if (!visibilityData?.authors) return [];
    if (!searchLower) return visibilityData.authors;
    return visibilityData.authors.filter((a) => a.name.toLowerCase().includes(searchLower));
  }, [visibilityData?.authors, searchLower]);

  const filteredBooks = useMemo(() => {
    if (!visibilityData?.books) return [];
    if (!searchLower) return visibilityData.books;
    return visibilityData.books.filter(
      (b) =>
        b.title.toLowerCase().includes(searchLower) ||
        b.author.toLowerCase().includes(searchLower) ||
        (b.series && b.series.toLowerCase().includes(searchLower)),
    );
  }, [visibilityData?.books, searchLower]);

  // Books Catalog state
  const [catalogBooks, setCatalogBooks] = useState<EditableBookMetadata[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [bookSearchQuery, setBookSearchQuery] = useState("");
  const [editingMetadataBook, setEditingMetadataBook] = useState<EditableBookMetadata | null>(null);

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
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [generatedResetLink, setGeneratedResetLink] = useState<{
    email: string;
    url: string;
    token: string;
  } | null>(null);

  // User Actions modal states
  const [statsConfirmUser, setStatsConfirmUser] = useState<UserItem | null>(null);
  const [statsUserToView, setStatsUserToView] = useState<UserItem | null>(null);
  const [modifyUser, setModifyUser] = useState<UserItem | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserItem | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

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

  const fetchCatalogBooks = useCallback(async (searchQuery = "") => {
    setBooksLoading(true);
    try {
      const url = searchQuery.trim()
        ? `/api/admin/books?q=${encodeURIComponent(searchQuery.trim())}`
        : "/api/admin/books";
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { books: EditableBookMetadata[] };
        setCatalogBooks(data.books || []);
      }
    } catch (err) {
      console.error("Failed to load catalog books:", err);
    } finally {
      setBooksLoading(false);
    }
  }, []);

  const fetchVisibilityData = useCallback(async () => {
    setVisibilityLoading(true);
    try {
      const res = await fetch("/api/admin/visibility");
      if (res.ok) {
        const data = (await res.json()) as AdminVisibilityResponse;
        setVisibilityData(data);
      }
    } catch (err) {
      console.error("Failed to load visibility settings:", err);
    } finally {
      setVisibilityLoading(false);
    }
  }, []);

  const handleToggleVisibility = async (
    type: "book" | "series" | "author",
    target: string,
    currentHidden: boolean,
  ) => {
    const key = `${type}:${target}`;
    setTogglingKey(key);
    const newHidden = !currentHidden;
    try {
      const res = await fetch("/api/admin/visibility/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, target, hidden: newHidden }),
      });
      if (res.ok) {
        await fetchVisibilityData();
        fetchStats();
      }
    } catch (err) {
      console.error("Failed to toggle visibility:", err);
    } finally {
      setTogglingKey(null);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchStats();
      fetchInvites();
      fetchUsers();
      fetchVisibilityData();
    }
  }, [isAdmin, fetchStats, fetchInvites, fetchUsers, fetchVisibilityData]);

  useEffect(() => {
    if (isAdmin && activeTab === "books" && catalogBooks.length === 0) {
      fetchCatalogBooks();
    }
  }, [isAdmin, activeTab, catalogBooks.length, fetchCatalogBooks]);

  useEffect(() => {
    if (isAdmin && activeTab === "visibility" && !visibilityData) {
      fetchVisibilityData();
    }
  }, [isAdmin, activeTab, visibilityData, fetchVisibilityData]);

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

  const handleDeleteUserConfirm = async () => {
    if (!deleteUser) return;
    setIsDeletingUser(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteUser.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to delete user account.");
      }
      setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
      setDeleteUser(null);
      fetchStats();
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleUserModified = (updated: UserItem) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setModifyUser(null);
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

        <button
          type="button"
          onClick={() => {
            setActiveTab("books");
            if (catalogBooks.length === 0) {
              fetchCatalogBooks(bookSearchQuery);
            }
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "books"
              ? "border-accent text-accent font-semibold bg-accent-bg/20"
              : "border-transparent text-muted hover:text-text hover:border-border"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Catalog & Metadata Fixer</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("visibility");
            fetchVisibilityData();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "visibility"
              ? "border-accent text-accent font-semibold bg-accent-bg/20"
              : "border-transparent text-muted hover:text-text hover:border-border"
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>Library Visibility</span>
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
                      <th className="py-2.5 px-4 font-medium text-right">Actions</th>
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
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setStatsConfirmUser(u)}
                              className="px-2.5 py-1 rounded text-xs font-mono border border-border surface-card hover:border-accent hover:text-accent transition-colors cursor-pointer flex items-center gap-1.5"
                              title="View listening telemetry and stats (strict confirmation required)"
                            >
                              <BarChart2 className="w-3 h-3 text-accent" />
                              <span>Stats</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setModifyUser(u)}
                              className="px-2.5 py-1 rounded text-xs font-mono border border-border surface-card hover:border-accent hover:text-accent transition-colors cursor-pointer flex items-center gap-1.5"
                              title="Modify user profile and role (strict confirmation required)"
                            >
                              <Edit2 className="w-3 h-3 text-muted" />
                              <span>Modify</span>
                            </button>

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
                              onClick={() => setDeleteUser(u)}
                              disabled={u.id === user?.id}
                              className="p-1.5 rounded text-xs font-mono border border-border surface-card text-muted hover:text-rose-400 hover:border-rose-400/50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title={
                                u.id === user?.id
                                  ? "Cannot delete current admin session"
                                  : "Delete user account (strict confirmation required)"
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

      {/* TAB 4: CATALOG & METADATA FIXER */}
      {activeTab === "books" && (
        <div className="space-y-6">
          <div className="surface-card p-6 border border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-accent" />
                  <span>Audio Track & Audiobook Metadata Fixer</span>
                </h3>
                <p className="text-xs font-mono text-muted mt-1">
                  Surgically patch missing or incorrect metadata (title, author, series, index,
                  year, format, and synopsis) directly in the database without re-scanning Google
                  Drive.
                </p>
              </div>

              <button
                type="button"
                onClick={() => fetchCatalogBooks(bookSearchQuery)}
                disabled={booksLoading}
                className="px-3 py-1.5 rounded border border-border bg-surface text-muted text-xs font-mono flex items-center gap-2 hover:bg-elevated hover:text-text transition-colors cursor-pointer self-start sm:self-auto shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${booksLoading ? "animate-spin" : ""}`} />
                <span>Refresh Catalog</span>
              </button>
            </div>

            {/* Search Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchCatalogBooks(bookSearchQuery);
              }}
              className="flex items-center gap-2 pt-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={bookSearchQuery}
                  onChange={(e) => setBookSearchQuery(e.target.value)}
                  placeholder="Filter catalog by book title, author, or series..."
                  className="w-full bg-elevated border border-border rounded pl-9 pr-4 py-2 text-xs font-mono text-text placeholder:text-subtle focus:outline-none focus:border-accent"
                />
              </div>
              <button
                type="submit"
                disabled={booksLoading}
                className="px-4 py-2 rounded bg-accent text-bg text-xs font-mono font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                Search
              </button>
              {bookSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setBookSearchQuery("");
                    fetchCatalogBooks("");
                  }}
                  className="px-3 py-2 rounded border border-border bg-surface text-muted text-xs font-mono hover:text-text transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </form>
          </div>

          {/* Catalog Table */}
          <div className="surface-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <span className="text-xs font-mono text-muted">
                Showing {catalogBooks.length} audiobook{catalogBooks.length === 1 ? "" : "s"}
              </span>
              {booksLoading && (
                <span className="text-xs font-mono text-accent flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading...</span>
                </span>
              )}
            </div>

            {booksLoading && catalogBooks.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-muted flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                <span>Loading audiobooks from library...</span>
              </div>
            ) : catalogBooks.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono text-muted space-y-2">
                <BookOpen className="w-8 h-8 text-subtle mx-auto opacity-50" />
                <p>No audiobooks match your search filter.</p>
                {bookSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setBookSearchQuery("");
                      fetchCatalogBooks("");
                    }}
                    className="text-accent underline cursor-pointer"
                  >
                    Clear search filter
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-elevated text-subtle border-b border-border">
                    <tr>
                      <th className="py-2.5 px-4 font-medium w-12">Cover</th>
                      <th className="py-2.5 px-4 font-medium">Title & Author</th>
                      <th className="py-2.5 px-4 font-medium">Series</th>
                      <th className="py-2.5 px-4 font-medium">Format / Specs</th>
                      <th className="py-2.5 px-4 font-medium text-center">Visibility</th>
                      <th className="py-2.5 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {catalogBooks.map((b) => {
                      const isDirectlyHidden =
                        visibilityData?.visibility.hiddenBooks.includes(b.id) ?? false;
                      const isParentSeriesHidden = Boolean(
                        b.seriesName &&
                          visibilityData?.visibility.hiddenSeries.some(
                            (s) => s.toLowerCase() === b.seriesName!.toLowerCase(),
                          ),
                      );
                      const isParentAuthorHidden = Boolean(
                        b.author &&
                          visibilityData?.visibility.hiddenAuthors.some(
                            (a) => a.toLowerCase() === b.author.toLowerCase(),
                          ),
                      );
                      const isEffectiveHidden =
                        isDirectlyHidden || isParentSeriesHidden || isParentAuthorHidden;

                      return (
                        <tr key={b.id} className="hover:bg-elevated/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="w-10 h-10 rounded border border-border bg-surface overflow-hidden flex items-center justify-center shrink-0">
                              {b.coverR2Key ? (
                                <img
                                  src={getBookCoverUrl(b)}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <span className="text-[10px] font-bold text-subtle uppercase">
                                  {b.format || "m4b"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="space-y-0.5">
                              <a
                                href={`/book/${b.id}`}
                                className="font-semibold text-text hover:text-accent transition-colors block line-clamp-1"
                              >
                                {b.title}
                              </a>
                              <div className="text-muted text-[11px] line-clamp-1">By {b.author}</div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {b.seriesName ? (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-elevated border border-border text-[11px] text-accent">
                                <span>{b.seriesName}</span>
                                {b.seriesIndex != null && (
                                  <span className="text-subtle">#{b.seriesIndex}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-subtle text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="px-1.5 py-0.5 rounded uppercase font-bold text-[10px] bg-accent-bg text-accent border border-accent/30">
                                {b.format || "m4b"}
                              </span>
                              {b.publishedYear && (
                                <span className="text-subtle">{b.publishedYear}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex items-center gap-2">
                              <ToggleSwitch
                                checked={!isEffectiveHidden}
                                disabled={togglingKey === `book:${b.id}`}
                                onChange={() =>
                                  handleToggleVisibility("book", b.id, isEffectiveHidden)
                                }
                                label={`Toggle visibility for ${b.title}`}
                              />
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                  !isEffectiveHidden
                                    ? "bg-accent-bg/30 text-accent border-accent/30"
                                    : isDirectlyHidden
                                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                      : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                }`}
                              >
                                {!isEffectiveHidden
                                  ? "Visible"
                                  : isDirectlyHidden
                                    ? "Hidden"
                                    : isParentSeriesHidden
                                      ? "Series Off"
                                      : "Author Off"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setEditingMetadataBook(b)}
                              className="px-3 py-1.5 rounded text-xs font-mono border border-border surface-card hover:border-accent hover:text-accent transition-colors cursor-pointer inline-flex items-center gap-1.5"
                              title="Edit book and track metadata tags"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-accent" />
                              <span>Fix Metadata</span>
                            </button>
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

      {/* TAB 5: LIBRARY VISIBILITY CONTROLS */}
      {activeTab === "visibility" && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="surface-card p-6 border border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                  <Eye className="w-4 h-4 text-accent" />
                  <span>Library Visibility & Catalog Display</span>
                </h3>
                <p className="text-xs font-mono text-muted mt-1">
                  Control which series, authors, and audiobooks appear in library and listener catalogs.
                  Hiding a series or author automatically hides all their audiobooks.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchVisibilityData()}
                disabled={visibilityLoading}
                className="px-3 py-1.5 rounded border border-border surface-card hover:border-accent text-xs font-mono flex items-center gap-1.5 text-muted hover:text-text transition-colors cursor-pointer self-start sm:self-auto shrink-0"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${visibilityLoading ? "animate-spin text-accent" : ""}`}
                />
                <span>Refresh</span>
              </button>
            </div>

            {/* Quick Metrics */}
            {visibilityData && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded bg-elevated/50 border border-border/60">
                  <div className="text-[11px] font-mono text-muted">Audiobooks</div>
                  <div className="text-lg font-bold font-mono text-text mt-0.5">
                    {visibilityData.books.filter((b) => !b.isHidden).length} /{" "}
                    {visibilityData.books.length}
                  </div>
                  <div className="text-[10px] font-mono text-accent">Visible in catalog</div>
                </div>

                <div className="p-3 rounded bg-elevated/50 border border-border/60">
                  <div className="text-[11px] font-mono text-muted">Series Sagas</div>
                  <div className="text-lg font-bold font-mono text-text mt-0.5">
                    {visibilityData.series.filter((s) => !s.isHidden).length} /{" "}
                    {visibilityData.series.length}
                  </div>
                  <div className="text-[10px] font-mono text-accent">Visible series</div>
                </div>

                <div className="p-3 rounded bg-elevated/50 border border-border/60">
                  <div className="text-[11px] font-mono text-muted">Authors</div>
                  <div className="text-lg font-bold font-mono text-text mt-0.5">
                    {visibilityData.authors.filter((a) => !a.isHidden).length} /{" "}
                    {visibilityData.authors.length}
                  </div>
                  <div className="text-[10px] font-mono text-accent">Visible authors</div>
                </div>
              </div>
            )}
          </div>

          {/* Filtering and Search Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-surface border border-border overflow-x-auto">
              {(["all", "series", "authors", "books"] as const).map((filterKey) => (
                <button
                  key={filterKey}
                  type="button"
                  onClick={() => setVisibilityFilter(filterKey)}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono capitalize transition-colors cursor-pointer whitespace-nowrap ${
                    visibilityFilter === filterKey
                      ? "bg-accent text-bg font-semibold"
                      : "text-muted hover:text-text hover:bg-elevated/50"
                  }`}
                >
                  {filterKey === "all"
                    ? "All Categories"
                    : `${filterKey} (${
                        filterKey === "books"
                          ? visibilityData?.books.length ?? 0
                          : filterKey === "series"
                            ? visibilityData?.series.length ?? 0
                            : visibilityData?.authors.length ?? 0
                      })`}
                </button>
              ))}
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                type="text"
                value={visibilitySearch}
                onChange={(e) => setVisibilitySearch(e.target.value)}
                placeholder="Search items..."
                className="w-full pl-9 pr-3 py-1.5 rounded bg-surface border border-border text-xs font-mono text-text placeholder:text-subtle focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {visibilityLoading && !visibilityData ? (
            <div className="surface-card p-12 text-center text-xs font-mono text-muted border border-border flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
              <span>Loading visibility rules...</span>
            </div>
          ) : !visibilityData ? (
            <div className="surface-card p-8 text-center text-xs font-mono text-muted border border-border">
              No visibility rules loaded.
            </div>
          ) : (
            <div className="space-y-6">
              {/* SECTION 1: SERIES VISIBILITY */}
              {(visibilityFilter === "all" || visibilityFilter === "series") && (
                <div className="surface-card border border-border rounded overflow-hidden">
                  <div className="p-4 bg-elevated/40 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-accent" />
                      <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-text">
                        Series Sagas ({filteredSeries.length})
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono text-subtle">
                      Hiding a series hides all its books automatically
                    </span>
                  </div>

                  {filteredSeries.length === 0 ? (
                    <div className="p-8 text-center text-xs font-mono text-subtle">
                      No series found matching filter.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-elevated/70 text-subtle border-b border-border">
                          <tr>
                            <th className="py-2.5 px-4 font-medium">Series Name</th>
                            <th className="py-2.5 px-4 font-medium">Primary Author</th>
                            <th className="py-2.5 px-4 font-medium">Books Count</th>
                            <th className="py-2.5 px-4 font-medium text-center">Status</th>
                            <th className="py-2.5 px-4 font-medium text-right">Visibility Toggle</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredSeries.map((s) => (
                            <tr key={s.id} className="hover:bg-elevated/40 transition-colors">
                              <td className="py-3 px-4 font-semibold text-text">
                                {s.name}
                              </td>
                              <td className="py-3 px-4 text-muted">
                                {s.primaryAuthor}
                              </td>
                              <td className="py-3 px-4 text-subtle">
                                <span className="px-2 py-0.5 rounded bg-elevated text-accent font-medium">
                                  {s.bookCount} audiobooks
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                    !s.isHidden
                                      ? "bg-accent-bg/30 text-accent border-accent/30"
                                      : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  }`}
                                >
                                  {!s.isHidden ? "Visible" : "Hidden"}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <ToggleSwitch
                                  checked={!s.isHidden}
                                  disabled={togglingKey === `series:${s.name}`}
                                  onChange={() =>
                                    handleToggleVisibility("series", s.name, s.isHidden)
                                  }
                                  label={`Toggle visibility for series ${s.name}`}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 2: AUTHORS VISIBILITY */}
              {(visibilityFilter === "all" || visibilityFilter === "authors") && (
                <div className="surface-card border border-border rounded overflow-hidden">
                  <div className="p-4 bg-elevated/40 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-accent" />
                      <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-text">
                        Authors ({filteredAuthors.length})
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono text-subtle">
                      Hiding an author hides their catalog and audiobooks
                    </span>
                  </div>

                  {filteredAuthors.length === 0 ? (
                    <div className="p-8 text-center text-xs font-mono text-subtle">
                      No authors found matching filter.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-elevated/70 text-subtle border-b border-border">
                          <tr>
                            <th className="py-2.5 px-4 font-medium">Author Name</th>
                            <th className="py-2.5 px-4 font-medium">Catalog Stats</th>
                            <th className="py-2.5 px-4 font-medium text-center">Status</th>
                            <th className="py-2.5 px-4 font-medium text-right">Visibility Toggle</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredAuthors.map((a) => (
                            <tr key={a.name} className="hover:bg-elevated/40 transition-colors">
                              <td className="py-3 px-4 font-semibold text-text">
                                {a.name}
                              </td>
                              <td className="py-3 px-4 text-muted">
                                <span>{a.bookCount} audiobooks</span>
                                {a.seriesCount > 0 && (
                                  <span className="text-subtle">
                                    {" "}
                                    • {a.seriesCount} series
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                    !a.isHidden
                                      ? "bg-accent-bg/30 text-accent border-accent/30"
                                      : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  }`}
                                >
                                  {!a.isHidden ? "Visible" : "Hidden"}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <ToggleSwitch
                                  checked={!a.isHidden}
                                  disabled={togglingKey === `author:${a.name}`}
                                  onChange={() =>
                                    handleToggleVisibility("author", a.name, a.isHidden)
                                  }
                                  label={`Toggle visibility for author ${a.name}`}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 3: BOOKS VISIBILITY */}
              {(visibilityFilter === "all" || visibilityFilter === "books") && (
                <div className="surface-card border border-border rounded overflow-hidden">
                  <div className="p-4 bg-elevated/40 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-accent" />
                      <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-text">
                        Individual Audiobooks ({filteredBooks.length})
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono text-subtle">
                      Toggle individual audiobook visibility
                    </span>
                  </div>

                  {filteredBooks.length === 0 ? (
                    <div className="p-8 text-center text-xs font-mono text-subtle">
                      No audiobooks found matching filter.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-elevated/70 text-subtle border-b border-border">
                          <tr>
                            <th className="py-2.5 px-4 font-medium w-12">Cover</th>
                            <th className="py-2.5 px-4 font-medium">Title & Author</th>
                            <th className="py-2.5 px-4 font-medium">Series</th>
                            <th className="py-2.5 px-4 font-medium text-center">Status</th>
                            <th className="py-2.5 px-4 font-medium text-right">Visibility Toggle</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredBooks.map((b) => (
                            <tr key={b.id} className="hover:bg-elevated/40 transition-colors">
                              <td className="py-3 px-4">
                                <div className="w-10 h-10 rounded border border-border bg-surface overflow-hidden flex items-center justify-center shrink-0">
                                  {b.coverR2Key ? (
                                    <img
                                      src={getBookCoverUrl(b as any)}
                                      alt=""
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = "none";
                                      }}
                                    />
                                  ) : (
                                    <BookOpen className="w-4 h-4 text-muted" />
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-text line-clamp-1">
                                  {b.title}
                                </div>
                                <div className="text-muted text-[11px] line-clamp-1">
                                  By {b.author}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {b.series ? (
                                  <span className="px-1.5 py-0.5 rounded bg-elevated border border-border text-[11px] text-accent">
                                    {b.series}
                                  </span>
                                ) : (
                                  <span className="text-subtle text-[11px]">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                    !b.isHidden
                                      ? "bg-accent-bg/30 text-accent border-accent/30"
                                      : b.hiddenReason === "direct"
                                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  }`}
                                >
                                  {!b.isHidden
                                    ? "Visible"
                                    : b.hiddenReason === "series"
                                      ? "Series Hidden"
                                      : b.hiddenReason === "author"
                                        ? "Author Hidden"
                                        : "Hidden Directly"}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <ToggleSwitch
                                  checked={!b.isHidden}
                                  disabled={togglingKey === `book:${b.id}`}
                                  onChange={() =>
                                    handleToggleVisibility("book", b.id, b.isHidden)
                                  }
                                  label={`Toggle visibility for ${b.title}`}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Strict Confirm Modal: View Telemetry Stats */}
      {statsConfirmUser && (
        <StrictConfirmModal
          isOpen={!!statsConfirmUser}
          onClose={() => setStatsConfirmUser(null)}
          onConfirm={() => {
            setStatsUserToView(statsConfirmUser);
            setStatsConfirmUser(null);
          }}
          title="Confirm View Telemetry"
          description={`Accessing detailed listening history and playback telemetry for ${statsConfirmUser.name} (${statsConfirmUser.email}). This listener data is strictly immutable and read-only.`}
          requiredPhrase="VIEW"
          confirmButtonText="Unlock Stats"
        />
      )}

      {/* User Stats Telemetry Modal */}
      {statsUserToView && (
        <UserStatsModal
          isOpen={!!statsUserToView}
          onClose={() => setStatsUserToView(null)}
          userId={statsUserToView.id}
          userName={statsUserToView.name}
          userEmail={statsUserToView.email}
        />
      )}

      {/* Modify User Modal */}
      {modifyUser && (
        <ModifyUserModal
          isOpen={!!modifyUser}
          onClose={() => setModifyUser(null)}
          user={modifyUser}
          currentAdminId={user?.id}
          onSuccess={handleUserModified}
        />
      )}

      {/* Strict Confirm Modal: Irreversible Delete User */}
      {deleteUser && (
        <StrictConfirmModal
          isOpen={!!deleteUser}
          onClose={() => setDeleteUser(null)}
          onConfirm={handleDeleteUserConfirm}
          title="Confirm Irreversible Account Deletion"
          description={`Permanently delete ${deleteUser.name} (${deleteUser.email}). All session records, bookmarks, audio clips, and listening progress will be permanently purged. This action cannot be undone.`}
          requiredPhrase={`DELETE ${deleteUser.email}`}
          confirmButtonText="Permanently Delete User"
          danger={true}
          isPending={isDeletingUser}
        />
      )}

      {/* Audio Track & Book Metadata Fixer Modal */}
      {editingMetadataBook && (
        <MetadataFixerModal
          isOpen={!!editingMetadataBook}
          onClose={() => setEditingMetadataBook(null)}
          book={editingMetadataBook}
          onSuccess={(updatedBook) => {
            setCatalogBooks((prev) =>
              prev.map((b) => (b.id === updatedBook.id ? { ...b, ...updatedBook } : b)),
            );
            fetchStats();
          }}
        />
      )}
    </div>
  );
}
