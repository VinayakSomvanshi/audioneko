import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AdminInvitesPage } from "./routes/admin-invites";
import { AnalyticsPage } from "./routes/analytics";
import { AuthorsPage } from "./routes/authors";
import { BookDetailPage } from "./routes/book-detail";
import { JoinPage } from "./routes/join";
import { LibraryPage } from "./routes/library";
import { LoginPage } from "./routes/login";
import { OfflinePage } from "./routes/offline";
import { RootLayout } from "./routes/root";
import { SeriesPage } from "./routes/series";
import { ShelvesPage } from "./routes/shelves";

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

const offlineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/offline",
  component: OfflinePage,
});

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analytics",
  component: AnalyticsPage,
});

const seriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/series",
  component: SeriesPage,
});

const authorsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/authors",
  component: AuthorsPage,
});

const shelvesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shelves",
  component: ShelvesPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  bookDetailRoute,
  joinRoute,
  loginRoute,
  adminInvitesRoute,
  offlineRoute,
  analyticsRoute,
  seriesRoute,
  authorsRoute,
  shelvesRoute,
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
