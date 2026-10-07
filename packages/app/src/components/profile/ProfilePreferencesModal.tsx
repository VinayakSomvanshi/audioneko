import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  Moon,
  Sliders,
  Sun,
  User,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  changeUserPassword,
  performSignOut,
  updateProfileName,
  useCurrentUser,
} from "../../lib/auth-client";
import { EQUALIZER_PRESETS, type EqualizerPresetId } from "../../lib/equalizer";
import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
  loadUserPreferences,
  saveUserPreferences,
} from "../../lib/user-preferences";

interface ProfilePreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

type TabKey = "profile" | "password" | "playback" | "appearance";

export function ProfilePreferencesModal({
  isOpen,
  onClose,
  isDark,
  onToggleTheme,
}: ProfilePreferencesModalProps) {
  const { user, isAdmin } = useCurrentUser();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("profile");

  // Profile Name Form State
  const [name, setName] = useState(user?.name || "");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  // Change Password Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  // Playback Preferences State
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const [prefsSavedNotice, setPrefsSavedNotice] = useState(false);

  // Sign out state
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Sync state on modal open
  useEffect(() => {
    if (isOpen) {
      if (user?.name) setName(user.name);
      setPrefs(loadUserPreferences());
      setNameFeedback(null);
      setPasswordFeedback(null);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [isOpen, user?.name]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSavingName(true);
    setNameFeedback(null);

    const result = await updateProfileName(name.trim());
    setIsSavingName(false);

    if (result.success) {
      setNameFeedback({ type: "success", msg: "Display name updated successfully." });
      // Invalidate current user query to refresh headers and drawer
      queryClient.invalidateQueries({ queryKey: ["adminMe"] });
    } else {
      setNameFeedback({ type: "error", msg: result.error || "Failed to update display name." });
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) return;

    if (newPassword.length < 8) {
      setPasswordFeedback({
        type: "error",
        msg: "New password must be at least 8 characters long.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: "error", msg: "New passwords do not match." });
      return;
    }

    setIsChangingPassword(true);
    setPasswordFeedback(null);

    const result = await changeUserPassword({
      currentPassword,
      newPassword,
    });
    setIsChangingPassword(false);

    if (result.success) {
      setPasswordFeedback({ type: "success", msg: "Password changed successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setPasswordFeedback({ type: "error", msg: result.error || "Failed to change password." });
    }
  };

  const handleUpdatePreference = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => {
    const updated = saveUserPreferences({ [key]: value });
    setPrefs(updated);
    setPrefsSavedNotice(true);
    setTimeout(() => setPrefsSavedNotice(false), 2000);
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="profile-preferences-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md w-full h-full border-none max-w-none max-h-none m-0"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="w-full max-w-lg surface-card border border-border rounded-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-surface/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/20 text-accent">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="profile-preferences-title"
                className="text-base font-semibold text-text tracking-tight"
              >
                Profile & Preferences
              </h2>
              <p className="text-xs font-mono text-muted">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted hover:text-text rounded-md hover:bg-surface transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border px-3 bg-elevated/30 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === "profile"
                ? "border-accent text-accent font-semibold"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("password")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === "password"
                ? "border-accent text-accent font-semibold"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Password</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("playback")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === "playback"
                ? "border-accent text-accent font-semibold"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Playback</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("appearance")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === "appearance"
                ? "border-accent text-accent font-semibold"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            <span>Appearance</span>
          </button>
        </div>

        {/* Modal Body / Tab Contents */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* TAB 1: PROFILE */}
          {activeTab === "profile" && (
            <div className="space-y-4">
              {nameFeedback && (
                <div
                  className={`p-3 rounded-lg border text-xs font-mono flex items-center gap-2 ${
                    nameFeedback.type === "success"
                      ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-400"
                      : "bg-red-950/30 border-red-800/40 text-red-400"
                  }`}
                >
                  {nameFeedback.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  )}
                  <span>{nameFeedback.msg}</span>
                </div>
              )}

              <form onSubmit={handleSaveName} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="profile-name-input"
                    className="block text-xs font-mono text-muted"
                  >
                    Display Name
                  </label>
                  <input
                    id="profile-name-input"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name or handle"
                    className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none rounded"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="profile-email-display"
                    className="block text-xs font-mono text-muted"
                  >
                    Email Address
                  </label>
                  <input
                    id="profile-email-display"
                    type="email"
                    disabled
                    value={user.email}
                    className="w-full px-3 py-2 text-xs font-mono bg-elevated/40 border border-border rounded text-subtle select-all"
                  />
                  <p className="text-[11px] font-mono text-subtle">
                    Email is anchored to your cryptographic account credentials.
                  </p>
                </div>

                <div className="p-3 surface-card border border-border rounded flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono text-text font-medium">Access Role</div>
                    <div className="text-[11px] font-mono text-muted">
                      {isAdmin
                        ? "Full server administration and curator access"
                        : "Standard audiobook streaming listener"}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      isAdmin
                        ? "bg-accent-bg text-accent border border-accent/40"
                        : "bg-elevated text-subtle border border-border"
                    }`}
                  >
                    {user.role}
                  </span>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSavingName || !name.trim() || name.trim() === user.name}
                    className="px-4 py-2 rounded bg-accent text-bg text-xs font-mono font-medium flex items-center gap-2 hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shadow-sm"
                  >
                    {isSavingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: PASSWORD */}
          {activeTab === "password" && (
            <div className="space-y-4">
              {passwordFeedback && (
                <div
                  className={`p-3 rounded-lg border text-xs font-mono flex items-center gap-2 ${
                    passwordFeedback.type === "success"
                      ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-400"
                      : "bg-red-950/30 border-red-800/40 text-red-400"
                  }`}
                >
                  {passwordFeedback.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  )}
                  <span>{passwordFeedback.msg}</span>
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="current-password-input"
                    className="block text-xs font-mono text-muted"
                  >
                    Current Password
                  </label>
                  <input
                    id="current-password-input"
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none rounded"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="new-password-input"
                    className="block text-xs font-mono text-muted"
                  >
                    New Password (minimum 8 characters)
                  </label>
                  <input
                    id="new-password-input"
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none rounded"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="confirm-password-input"
                    className="block text-xs font-mono text-muted"
                  >
                    Confirm New Password
                  </label>
                  <input
                    id="confirm-password-input"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full px-3 py-2 text-xs font-mono surface-card focus:border-accent outline-none rounded"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={
                      isChangingPassword || !currentPassword || !newPassword || !confirmPassword
                    }
                    className="px-4 py-2 rounded bg-accent text-bg text-xs font-mono font-medium flex items-center gap-2 hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shadow-sm"
                  >
                    {isChangingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>Update Password</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: PLAYBACK PREFERENCES */}
          {activeTab === "playback" && (
            <div className="space-y-5">
              {prefsSavedNotice && (
                <div className="p-2 rounded bg-emerald-950/20 border border-emerald-800/30 text-emerald-400 text-xs font-mono flex items-center gap-2 animate-fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Preferences saved automatically.</span>
                </div>
              )}

              {/* Skip Intervals */}
              <div className="space-y-3">
                <div className="text-xs font-mono text-text font-semibold uppercase tracking-wider text-muted">
                  Skip Intervals
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="surface-card p-3 border border-border rounded space-y-1.5">
                    <label htmlFor="pref-skip-back" className="block text-xs font-mono text-muted">
                      Skip Backward
                    </label>
                    <select
                      id="pref-skip-back"
                      value={prefs.seekBackwardSeconds}
                      onChange={(e) =>
                        handleUpdatePreference(
                          "seekBackwardSeconds",
                          Number.parseInt(e.target.value, 10),
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-mono surface-card focus:border-accent outline-none rounded cursor-pointer"
                    >
                      <option value={5}>5 seconds</option>
                      <option value={10}>10 seconds</option>
                      <option value={15}>15 seconds (Default)</option>
                      <option value={30}>30 seconds</option>
                      <option value={45}>45 seconds</option>
                      <option value={60}>60 seconds</option>
                    </select>
                  </div>

                  <div className="surface-card p-3 border border-border rounded space-y-1.5">
                    <label
                      htmlFor="pref-skip-forward"
                      className="block text-xs font-mono text-muted"
                    >
                      Skip Forward
                    </label>
                    <select
                      id="pref-skip-forward"
                      value={prefs.seekForwardSeconds}
                      onChange={(e) =>
                        handleUpdatePreference(
                          "seekForwardSeconds",
                          Number.parseInt(e.target.value, 10),
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-mono surface-card focus:border-accent outline-none rounded cursor-pointer"
                    >
                      <option value={10}>10 seconds</option>
                      <option value={15}>15 seconds</option>
                      <option value={30}>30 seconds (Default)</option>
                      <option value={45}>45 seconds</option>
                      <option value={60}>60 seconds</option>
                      <option value={90}>90 seconds</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Default Speed */}
              <div className="surface-card p-3.5 border border-border rounded space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="pref-speed" className="text-xs font-mono text-text font-medium">
                    Default Playback Speed
                  </label>
                  <span className="text-xs font-mono text-accent font-semibold">
                    {prefs.defaultPlaybackRate}x
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => handleUpdatePreference("defaultPlaybackRate", rate)}
                      className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors cursor-pointer ${
                        prefs.defaultPlaybackRate === rate
                          ? "bg-accent-bg text-accent border-accent/40 font-bold"
                          : "bg-surface border-border text-muted hover:text-text"
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Smart Rewind */}
              <div className="surface-card p-3.5 border border-border rounded space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono text-text font-medium">
                      Smart Resume Rewind
                    </div>
                    <div className="text-[11px] font-mono text-muted">
                      Automatically rewind playback slightly after pauses to restore context.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.smartRewindEnabled}
                    onChange={(e) => handleUpdatePreference("smartRewindEnabled", e.target.checked)}
                    className="w-4 h-4 accent-accent cursor-pointer"
                  />
                </div>

                {prefs.smartRewindEnabled && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <span className="text-[11px] font-mono text-muted">Base Rewind Duration:</span>
                    {[5, 10, 15, 25].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => handleUpdatePreference("smartRewindDurationSeconds", sec)}
                        className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                          prefs.smartRewindDurationSeconds === sec
                            ? "bg-accent-bg text-accent border-accent/40 font-bold"
                            : "bg-surface border-border text-muted hover:text-text"
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Default Equalizer Preset */}
              <div className="surface-card p-3.5 border border-border rounded space-y-2">
                <label htmlFor="pref-eq" className="block text-xs font-mono text-text font-medium">
                  Default Voice Equalizer Preset
                </label>
                <select
                  id="pref-eq"
                  value={prefs.equalizerPreset}
                  onChange={(e) =>
                    handleUpdatePreference("equalizerPreset", e.target.value as EqualizerPresetId)
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono surface-card focus:border-accent outline-none rounded cursor-pointer"
                >
                  {Object.values(EQUALIZER_PRESETS).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {p.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Headset Double-Tap Gesture */}
              <div className="surface-card p-3.5 border border-border rounded flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-text font-medium">
                    Headset Double-Tap Bookmark
                  </div>
                  <div className="text-[11px] font-mono text-muted">
                    Quickly double-tapping earbud play/pause saves an instant timestamped quote.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.doubleTapBookmark}
                  onChange={(e) => handleUpdatePreference("doubleTapBookmark", e.target.checked)}
                  className="w-4 h-4 accent-accent cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* TAB 4: APPEARANCE & SESSION */}
          {activeTab === "appearance" && (
            <div className="space-y-4">
              <div className="surface-card p-4 border border-border rounded space-y-3">
                <div className="text-xs font-mono text-text font-medium">Application Theme</div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onToggleTheme}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded border border-border bg-surface text-xs font-mono text-text hover:border-accent transition-colors cursor-pointer"
                  >
                    {isDark ? (
                      <Sun className="w-4 h-4 text-accent" />
                    ) : (
                      <Moon className="w-4 h-4 text-accent" />
                    )}
                    <span>Switch to {isDark ? "Light Mode" : "Dark Mode"}</span>
                  </button>
                </div>
                <p className="text-[11px] font-mono text-muted">
                  audioneko is optimized for nighttime listening with deep dark sober tones.
                </p>
              </div>

              <div className="surface-card p-4 border border-border rounded space-y-3">
                <div className="text-xs font-mono text-text font-medium">Session & Sign Out</div>
                <p className="text-[11px] font-mono text-muted">
                  Signing out clears session cookies and returns you to the login screen.
                </p>
                <button
                  type="button"
                  disabled={isSigningOut}
                  onClick={async () => {
                    setIsSigningOut(true);
                    onClose();
                    await performSignOut();
                  }}
                  className="w-full py-2.5 px-3 rounded border border-red-500/40 bg-red-950/20 text-red-400 text-xs font-mono font-medium hover:bg-red-950/40 transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{isSigningOut ? "Signing out..." : "Sign Out Account"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
