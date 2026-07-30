import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { DiscordIcon, GithubIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Logo } from "@/components/logo";

import { appName, gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="h-5 w-5" />
          {appName}
        </span>
      ),
      url: "/docs",
      transparentMode: "top",
    },
    links: [
      { text: "Docs", url: "/docs", active: "nested-url" },
      { text: "Blog", url: "/blog", active: "nested-url" },
      {
        text: "Tooscut App",
        url: "https://tooscut.app",
        external: true,
      },
      {
        type: "icon",
        text: "Discord",
        url: "https://discord.gg/sph88Avz",
        external: true,
        icon: <HugeiconsIcon icon={DiscordIcon} />,
      },
      {
        type: "icon",
        text: "GitHub",
        url: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
        external: true,
        icon: <HugeiconsIcon icon={GithubIcon} />,
      },
    ],
  };
}
