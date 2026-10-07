import { useQuery } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
});

export const { signIn, signUp, useSession, signOut } = authClient;

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "listener";
}

export async function performSignOut() {
  try {
    await Promise.race([signOut(), new Promise((resolve) => setTimeout(resolve, 1200))]);
  } catch (err) {
    console.warn("Sign-out request failed, forcing redirect to login:", err);
  } finally {
    try {
      localStorage.removeItem("audioneko-active-shelf");
    } catch {}

    if (typeof window !== "undefined") {
      window.location.replace("/login");
    }
  }
}

export async function updateProfileName(
  name: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmed = name.trim();
    if (!trimmed) return { success: false, error: "Name cannot be empty" };

    const res = await fetch("/api/auth/update-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      return {
        success: false,
        error: data?.message || data?.error || "Failed to update profile name",
      };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error updating name",
    };
  }
}

export async function changeUserPassword(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!params.currentPassword) return { success: false, error: "Current password is required" };
    if (!params.newPassword || params.newPassword.length < 8) {
      return { success: false, error: "New password must be at least 8 characters" };
    }

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: params.currentPassword,
        newPassword: params.newPassword,
        revokeOtherSessions: true,
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      return { success: false, error: data?.message || data?.error || "Failed to update password" };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error updating password",
    };
  }
}

export async function requestPasswordReset(
  email: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return { success: false, message: "Email is required" };

    const res = await fetch("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed, redirectTo: "/login" }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      return {
        success: false,
        message: data?.message || data?.error || "Password reset request failed",
      };
    }
    return {
      success: true,
      message:
        "Reset request registered. If an email service is enabled or you have an admin link, proceed with the token.",
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Network error requesting reset",
    };
  }
}

export async function submitPasswordReset(params: {
  token: string;
  newPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!params.token) return { success: false, error: "Reset token is required" };
    if (!params.newPassword || params.newPassword.length < 8) {
      return { success: false, error: "New password must be at least 8 characters" };
    }

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: params.token.trim(),
        newPassword: params.newPassword,
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      return { success: false, error: data?.message || data?.error || "Failed to reset password" };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error resetting password",
    };
  }
}

export function useCurrentUser() {
  const { data: session, isPending } = useSession();

  const { data: adminMe, isLoading: isMeLoading } = useQuery({
    queryKey: ["adminMe"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/me");
        if (!res.ok) return null;
        return (await res.json()) as { user: CurrentUser | null; isAdmin: boolean };
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
    enabled: Boolean(session?.user),
  });

  const sessionUser = session?.user as unknown as CurrentUser | undefined;
  const sessionRole = (session?.user as { role?: string })?.role;
  const role = (adminMe?.user?.role || sessionRole || "listener") as "admin" | "listener";
  const isAdmin = Boolean(sessionUser) && (role === "admin" || adminMe?.isAdmin === true);
  const user = sessionUser ? adminMe?.user || sessionUser : undefined;

  return {
    user,
    session,
    role: user ? role : "listener",
    isAdmin,
    isLoading: isPending || (Boolean(session?.user) && isMeLoading),
  };
}
