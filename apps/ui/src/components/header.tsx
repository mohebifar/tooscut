import { Link } from "@tanstack/react-router";
import { GithubIcon } from "lucide-react";

import { LogoIcon } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useScroll } from "@/hooks/use-scroll";
import { cn } from "@/lib/utils";

export function Header() {
  const scrolled = useScroll(10);

  return (
    <header
      className={cn("sticky top-0 z-50 w-full border-b border-transparent", {
        "border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/90":
          scrolled,
      })}
    >
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <a
          className="flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-muted dark:hover:bg-muted/50"
          href="/"
        >
          <LogoIcon className="h-5 w-5" />
          <span className="font-semibold tracking-tight">Tooscut</span>
        </a>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <a href="https://github.com/mohebifar/tooscut" target="_blank" rel="noopener">
              <GithubIcon className="h-4 w-4" />
              GitHub
            </a>
          </Button>
          <Button asChild>
            <Link to="/projects">Open Editor</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
