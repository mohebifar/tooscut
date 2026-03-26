import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

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
            "data-website-id": import.meta.env.VITE_UMAMI_WEBSITE_ID,
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
});

function RootComponent() {
  return <Outlet />;
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
