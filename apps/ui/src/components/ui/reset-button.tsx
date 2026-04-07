import { RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";

interface ResetButtonProps {
  onClick: () => void;
  title?: string;
  className?: string;
  visible?: boolean;
}

/**
 * Small reset icon button that appears when a value is dirty.
 * Pass `visible={false}` to reserve space without showing the button.
 */
export function ResetButton({
  onClick,
  title = "Reset to default",
  className,
  visible = true,
}: ResetButtonProps) {
  if (!visible) {
    return <span className="inline-block size-5 shrink-0" />;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      title={title}
    >
      <RotateCcw className="size-3" />
    </button>
  );
}
