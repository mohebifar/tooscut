import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  Link,
  type ErrorComponentProps,
} from "@tanstack/react-router";

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
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
