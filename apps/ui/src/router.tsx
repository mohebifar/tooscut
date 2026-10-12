import { createRouter } from "@tanstack/react-router";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

function RoutePending() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
  );
}

// Create a new router instance
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: RoutePending,
  });

  return router;
};
