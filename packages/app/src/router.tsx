import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AdminInvitesPage } from "./routes/admin-invites";
import { BookDetailPage } from "./routes/book-detail";
import { JoinPage } from "./routes/join";
import { LibraryPage } from "./routes/library";
import { LoginPage } from "./routes/login";
import { RootLayout } from "./routes/root";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LibraryPage,
});

const bookDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/book/$id",
  component: BookDetailPage,
});

const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/join",
  component: JoinPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const adminInvitesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/invites",
  component: AdminInvitesPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  bookDetailRoute,
  joinRoute,
  loginRoute,
  adminInvitesRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
