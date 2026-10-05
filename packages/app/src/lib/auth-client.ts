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

  const sessionRole = (session?.user as { role?: string })?.role;
  const role = (adminMe?.user?.role || sessionRole || "listener") as "admin" | "listener";
  const isAdmin = role === "admin" || adminMe?.isAdmin === true;

  return {
    user: adminMe?.user || (session?.user as unknown as CurrentUser | undefined),
    session,
    role,
    isAdmin,
    isLoading: isPending || (Boolean(session?.user) && isMeLoading),
  };
}
