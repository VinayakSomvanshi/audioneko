import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AdminDashboardPage } from "./routes/admin";
import { AnalyticsPage } from "./routes/analytics";
import { AuthorsPage } from "./routes/authors";
import { BookDetailPage } from "./routes/book-detail";
import { BookmarksPage } from "./routes/bookmarks";
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

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminDashboardPage,
});

const adminInvitesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/invites",
  component: AdminDashboardPage,
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
  validateSearch: (search: Record<string, unknown>): { series?: string } => ({
    series: typeof search.series === "string" ? search.series : undefined,
  }),
  component: SeriesPage,
});

const authorsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/authors",
  validateSearch: (search: Record<string, unknown>): { author?: string } => ({
    author: typeof search.author === "string" ? search.author : undefined,
  }),
  component: AuthorsPage,
});

const shelvesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shelves",
  component: ShelvesPage,
});

const bookmarksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bookmarks",
  component: BookmarksPage,
});

const notebookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notebook",
  component: BookmarksPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  bookDetailRoute,
  joinRoute,
  loginRoute,
  adminRoute,
  adminInvitesRoute,
  offlineRoute,
  analyticsRoute,
  seriesRoute,
  authorsRoute,
  shelvesRoute,
  bookmarksRoute,
  notebookRoute,
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
