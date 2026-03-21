import { LogoIcon } from "@/components/logo";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-6">
        <div className="flex items-center gap-2">
          <LogoIcon className="h-4 w-4 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            &copy; {new Date().getFullYear()} Tooscut. Licensed under{" "}
            <a
              href="https://polyformproject.org/licenses/noncommercial/1.0.0/"
              className="underline hover:text-foreground"
              target="_blank"
              rel="noopener"
            >
              PolyForm Noncommercial 1.0.0
            </a>
            .
          </p>
        </div>
        <a
          href="https://github.com/mohebifar/tooscut"
          target="_blank"
          rel="noopener"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
