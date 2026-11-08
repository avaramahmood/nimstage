import { Suspense } from "react";
import { createBrowserRouter, Outlet, ScrollRestoration, type RouteObject } from "react-router";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { PageSkeleton } from "@/components/skeleton";

function Root() {
  return (
    <Providers>
      <Shell>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </Shell>
      <ScrollRestoration />
    </Providers>
  );
}

// Every page is its own chunk, so the first load only ships what that page needs.
const page = (load: () => Promise<{ default: React.ComponentType }>) => ({ lazy: async () => ({ Component: (await load()).default }) });

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Root />,
    children: [
      { index: true, ...page(() => import("@/pages/home")) },
      { path: "settings", ...page(() => import("@/pages/settings")) },
      { path: "receipts", ...page(() => import("@/pages/receipts")) },
      { path: "about", ...page(() => import("@/pages/about")) },
      { path: "help", ...page(() => import("@/pages/help")) },
      { path: "terms", ...page(() => import("@/pages/terms")) },
      { path: "privacy", ...page(() => import("@/pages/privacy")) },
      { path: "signin", ...page(() => import("@/pages/signin")) },
      { path: "discover", ...page(() => import("@/pages/discover")) },
      { path: "show/:id", ...page(() => import("@/pages/show")) },
      { path: "track/:id", ...page(() => import("@/pages/track")) },
      { path: "artist/:handle", ...page(() => import("@/pages/artist")) },
      { path: "library", ...page(() => import("@/pages/library")) },
      { path: "me", ...page(() => import("@/pages/me")) },
      { path: "studio", ...page(() => import("@/pages/studio")) },
      { path: "studio/profile", ...page(() => import("@/pages/studio-profile")) },
      { path: "studio/track/new", ...page(() => import("@/pages/studio-track-new")) },
      { path: "studio/show/new", ...page(() => import("@/pages/studio-show-new")) },
      { path: "studio/post/new", ...page(() => import("@/pages/studio-post-new")) },
      { path: "studio/poll/new", ...page(() => import("@/pages/studio-poll-new")) },
      { path: "studio/tiers", ...page(() => import("@/pages/studio-tiers")) },
      { path: "admin", ...page(() => import("@/pages/admin")) },
      { path: "policy", ...page(() => import("@/pages/policy")) },
      { path: "*", ...page(() => import("@/pages/not-found")) },
    ],
  },
];

/** Separate from `routes` so tests can mount the same pages in a memory router. */
export const createAppRouter = () => createBrowserRouter(routes);
