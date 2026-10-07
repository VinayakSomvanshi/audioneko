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
