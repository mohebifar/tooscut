import { Link, Unlink } from "lucide-react";

export function PropertySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

interface LinkablePropertySectionProps {
  title: string;
  linked: boolean;
  onLinkedChange: (linked: boolean) => void;
  children: React.ReactNode;
}

export function LinkablePropertySection({
  title,
  linked,
  onLinkedChange,
  children,
}: LinkablePropertySectionProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        <button
          type="button"
          onClick={() => onLinkedChange(!linked)}
          className={`rounded p-0.5 transition-colors ${
            linked
              ? "text-primary hover:text-primary/80"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={linked ? "Unlink X and Y" : "Link X and Y"}
        >
          {linked ? <Link className="h-3 w-3" /> : <Unlink className="h-3 w-3" />}
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-foreground">{label}</span>
      {children}
    </div>
  );
}
