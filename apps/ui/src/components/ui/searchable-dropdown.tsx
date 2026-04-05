/**
 * SearchableDropdown — a button-triggered dropdown with a search input inside the popup.
 *
 * Built on base-ui's Combobox with the Input placed inside the Popup.
 * Provides built-in keyboard navigation, auto-highlight, and filtering.
 *
 * Uses Combobox.Collection for dynamic item rendering so that the built-in
 * filtering actually hides non-matching items.
 */

import { Combobox } from "@base-ui/react/combobox";
import { Search } from "lucide-react";
import { useCallback } from "react";

import { cn } from "@/lib/utils";

export interface SearchableDropdownItem {
  /** Unique key for the item. */
  key: string;
  /** Primary label shown in the list. */
  label: string;
  /** Optional secondary description (also searched). */
  description?: string;
  /** Whether the item is selectable. */
  disabled?: boolean;
  /** Optional icon component. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Optional trailing content (e.g. "Soon" badge). */
  trailing?: React.ReactNode;
}

interface SearchableDropdownProps {
  /** Items to display in the dropdown. */
  items: SearchableDropdownItem[];
  /** Called when an enabled item is selected. */
  onSelect: (key: string) => void;
  /** The trigger element. */
  children: React.ReactNode;
  /** Placeholder for the search input. */
  placeholder?: string;
  /** Popover alignment. */
  align?: "start" | "center" | "end";
  /** Width class for the popup. */
  className?: string;
}

function itemToString(item: SearchableDropdownItem | null): string {
  if (!item) return "";
  return item.description ? `${item.label} ${item.description}` : item.label;
}

export function SearchableDropdown({
  items,
  onSelect,
  children,
  placeholder = "Search...",
  align = "start",
  className,
}: SearchableDropdownProps) {
  const handleValueChange = useCallback(
    (value: SearchableDropdownItem | null) => {
      if (value) onSelect(value.key);
    },
    [onSelect],
  );

  return (
    <Combobox.Root<SearchableDropdownItem>
      items={items}
      value={null}
      onValueChange={handleValueChange}
      itemToStringValue={itemToString}
      autoHighlight
    >
      <Combobox.Trigger render={children as React.ReactElement} />

      <Combobox.Portal>
        <Combobox.Positioner align={align} sideOffset={4} side="bottom">
          <Combobox.Popup
            className={cn(
              "z-auto w-64 origin-(--transform-origin) overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
              className,
            )}
          >
            {/* Search input inside popup */}
            <div className="border-b p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Combobox.Input
                  placeholder={placeholder}
                  className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                />
              </div>
            </div>

            {/* Item list — Collection lets the combobox control which items render */}
            <Combobox.List className="max-h-64 overflow-y-auto p-1">
              <Combobox.Collection>
                {(item: SearchableDropdownItem) => {
                  const Icon = item.icon;
                  return (
                    <Combobox.Item
                      value={item}
                      disabled={item.disabled}
                      className={cn(
                        "flex w-full cursor-default items-center gap-3 rounded-sm px-2 py-1.5 text-sm outline-none select-none",
                        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                        "data-disabled:pointer-events-none data-disabled:opacity-50",
                      )}
                    >
                      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.label}</p>
                        {item.description && (
                          <p className="truncate text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                      </div>
                      {item.trailing}
                    </Combobox.Item>
                  );
                }}
              </Combobox.Collection>
            </Combobox.List>

            <Combobox.Empty className="text-center text-xs text-muted-foreground">
              <div className="pb-2">No results found</div>
            </Combobox.Empty>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
