import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/ui/full-width-divider";

export function CallToAction() {
  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-col justify-between border-x">
      <FullWidthDivider className="-top-px" />
      <div className="border-b px-2 py-8">
        <h2 className="text-center text-lg font-semibold md:text-2xl">
          Ready to cut your next project?
        </h2>
        <p className="text-center text-sm text-balance text-muted-foreground md:text-base">
          No downloads, no sign-ups. Just open your browser and start editing.
        </p>
      </div>
      <div className="flex items-center justify-center gap-2 bg-secondary/80 p-4 dark:bg-secondary/40">
        <Button variant="outline" asChild>
          <a href="https://github.com/tooscut" target="_blank" rel="noopener">
            View Source
          </a>
        </Button>
        <Button asChild>
          <Link to="/projects">
            Open Editor
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </div>
      <FullWidthDivider className="-bottom-px" />
    </div>
  );
}
