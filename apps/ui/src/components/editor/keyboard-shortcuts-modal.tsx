import { Keyboard } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "@/components/ui/dialog";

// Global callback for opening the modal from outside
let openKeyboardShortcutsModal: (() => void) | null = null;

export function openKeyboardShortcuts() {
  openKeyboardShortcutsModal?.();
}

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: Shortcut[];
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
const modKey = isMac ? "Cmd" : "Ctrl";

const shortcutSections: ShortcutSection[] = [
  {
    title: "Playback",
    shortcuts: [
      { keys: ["Space"], description: "Play / Pause" },
      { keys: ["L"], description: "Play forward (press again: 2x, 4x, 8x)" },
      { keys: ["J"], description: "Play reverse (press again: -2x, -4x, -8x)" },
      { keys: ["K"], description: "Pause and reset speed" },
      { keys: ["Home"], description: "Jump to start" },
      { keys: ["End"], description: "Jump to end" },
    ],
  },
  {
    title: "Frame Navigation",
    shortcuts: [
      { keys: [","], description: "Previous frame" },
      { keys: ["."], description: "Next frame" },
      { keys: ["<"], description: "Jump back 1 second" },
      { keys: [">"], description: "Jump forward 1 second" },
      { keys: ["\u2190"], description: "Previous frame" },
      { keys: ["\u2192"], description: "Next frame" },
    ],
  },
  {
    title: "Clip Selection & Navigation",
    shortcuts: [
      { keys: ["\u2191"], description: "Select clip on track above" },
      { keys: ["\u2193"], description: "Select clip on track below" },
      { keys: ["Escape"], description: "Clear selection" },
    ],
  },
  {
    title: "Clip Editing",
    shortcuts: [
      { keys: ["Shift", "\u2190"], description: "Nudge clip left 1 frame" },
      { keys: ["Shift", "\u2192"], description: "Nudge clip right 1 frame" },
      { keys: ["Alt", "\u2190"], description: "Nudge clip left 10 frames" },
      { keys: ["Alt", "\u2192"], description: "Nudge clip right 10 frames" },
      { keys: ["Delete"], description: "Delete selected clip(s)" },
      { keys: ["Backspace"], description: "Delete selected clip(s)" },
    ],
  },
  {
    title: "Tools",
    shortcuts: [
      { keys: ["V"], description: "Select tool" },
      { keys: ["C"], description: "Razor / Cut tool" },
    ],
  },
  {
    title: "Clipboard",
    shortcuts: [
      { keys: [modKey, "X"], description: "Cut selected clip(s)" },
      { keys: [modKey, "C"], description: "Copy selected clip(s)" },
      { keys: [modKey, "V"], description: "Paste at playhead" },
      { keys: [modKey, "D"], description: "Duplicate selected clip(s)" },
    ],
  },
  {
    title: "History",
    shortcuts: [
      { keys: [modKey, "Z"], description: "Undo" },
      { keys: [modKey, "Shift", "Z"], description: "Redo" },
    ],
  },
  {
    title: "Help",
    shortcuts: [{ keys: ["?"], description: "Show keyboard shortcuts" }],
  },
];

function KeyboardKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{shortcut.description}</span>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((key, index) => (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && <span className="text-xs text-muted-foreground">+</span>}
            <KeyboardKey>{key}</KeyboardKey>
          </span>
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  const openModal = useCallback(() => setOpen(true), []);

  // Register the global callback
  useEffect(() => {
    openKeyboardShortcutsModal = openModal;
    return () => {
      openKeyboardShortcutsModal = null;
    };
  }, [openModal]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (activeElement?.tagName === "INPUT" || activeElement?.tagName === "TEXTAREA") {
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Press <KeyboardKey>?</KeyboardKey> to toggle this panel
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="grid gap-6 sm:grid-cols-2">
            {shortcutSections.map((section) => (
              <div key={section.title}>
                <h3 className="mb-2 text-sm font-semibold text-foreground">{section.title}</h3>
                <div className="space-y-0.5">
                  {section.shortcuts.map((shortcut, index) => (
                    <ShortcutRow key={index} shortcut={shortcut} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
