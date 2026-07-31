import { PostHogProvider, usePostHog } from "@posthog/react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  Link,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "../components/ui/button";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Tooscut - Video Editor",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
    scripts: [
      import.meta.env.VITE_UMAMI_WEBSITE_ID
        ? {
            defer: true,
            src: "https://cloud.umami.is/script.js",
            crossOrigin: "anonymous",
            "data-website-id": import.meta.env.VITE_UMAMI_WEBSITE_ID as string,
          }
        : undefined,
      import.meta.env.DEV
        ? {
            src: "https://unpkg.com/react-scan/dist/auto.global.js",
            crossOrigin: "anonymous",
            strategy: "beforeInteractive",
          }
        : undefined,
    ],
  }),

  component: RootComponent,
  shellComponent: RootDocument,
  errorComponent: RootErrorComponent,
});

function RootComponent() {
  return <Outlet />;
}

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const posthog = usePostHog();

  useEffect(() => {
    posthog.captureException(error);
  }, [posthog, error]);

  console.error(error);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The editor hit an unexpected error. Your project is autosaved, so it's safe to reload.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild>
          <Link to="/">Go to projects</Link>
        </Button>
      </div>
    </div>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const phToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN as string | undefined;
  const phHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined;

  if (import.meta.env.DEV && !phToken) {
    console.error(
      "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
    );
  }

  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <PostHogProvider
          apiKey={phToken ?? ""}
          options={{
            api_host: "/ingest",
            ui_host: phHost ?? "https://us.posthog.com",
            defaults: "2025-05-24",
            capture_exceptions: true,
            debug: import.meta.env.DEV,
          }}
        >
          {children}
        </PostHogProvider>
        <Scripts />
      </body>
    </html>
  );
}
