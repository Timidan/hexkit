import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import {
  useUniversalSearch,
  type InputType,
  type RecentSearch,
} from "@/hooks/useUniversalSearch";
import {
  Search,
  Code2,
  GitCompare,
  Database,
  Play,
  Zap,
  Hash,
  ListTree,
  RotateCcw,
  Command as CommandIcon,
  Globe,
  FileCode,
  Wrench,
  FileText,
  Settings,
  HardDrive,
  Wallet,
  X,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Code2,
  GitCompare,
  Database,
  Play,
  Zap,
  Hash,
  ListTree,
  RotateCcw,
  Globe,
  FileCode,
  Wrench,
  FileText,
  Search,
  Settings,
  HardDrive,
  Wallet,
};

interface TypeBadgeConfig {
  label: string;
  variant: "info" | "teal" | "secondary" | "warning" | "success" | "default";
}

function getInputBadge(type: InputType): TypeBadgeConfig | null {
  switch (type) {
    case "address":
      return { label: "Address", variant: "info" };
    case "txhash":
      return { label: "Transaction Hash", variant: "teal" };
    case "selector":
      return { label: "Function Selector", variant: "default" };
    case "signature":
      return { label: "Text Signature", variant: "warning" };
    case "calldata":
      return { label: "Calldata", variant: "default" };
    default:
      return null;
  }
}

interface UniversalSearchBarProps {
  className?: string;
  onOpenRpcSettings?: () => void;
  onOpenStorageManager?: () => void;
}

const UniversalSearchBar: React.FC<UniversalSearchBarProps> = ({
  className,
  onOpenRpcSettings,
  onOpenStorageManager,
}) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const {
    query,
    setQuery,
    inputType,
    matchingTools,
    executeTool,
    reset,
    recentSearches,
    clearRecentSearches,
    pages,
  } = useUniversalSearch();

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) setTimeout(reset, 200);
    },
    [reset],
  );

  const handleToolSelect = useCallback(
    (toolId: string) => {
      executeTool(toolId);
      handleOpenChange(false);
    },
    [executeTool, handleOpenChange],
  );

  const handlePageSelect = useCallback(
    (route: string) => {
      navigate(route);
      handleOpenChange(false);
    },
    [navigate, handleOpenChange],
  );

  const handleRecentSelect = useCallback(
    (recent: RecentSearch) => {
      setQuery(recent.query);
      executeTool(recent.toolId, recent.query);
      handleOpenChange(false);
    },
    [setQuery, executeTool, handleOpenChange],
  );

  const badge = getInputBadge(inputType);

  return (
    <>
      {/* Trigger button in top bar */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "group h-8 w-full justify-between rounded-md px-2.5",
          "border-border/60 bg-muted/30 text-left text-muted-foreground shadow-none",
          "transition-colors hover:border-primary/25 hover:bg-muted/50 hover:text-foreground",
          className,
        )}
        onClick={() => setOpen(true)}
        aria-label="Open command palette (Ctrl+K)"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Search className="size-3.5 shrink-0 opacity-60" />
          <span className="truncate text-xs opacity-60">
            Search or type a command...
          </span>
        </span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border border-border/60 bg-muted/50 px-1.5 font-mono text-[10px] font-medium opacity-50 sm:inline-flex">
          <CommandIcon className="size-2.5" />K
        </kbd>
      </Button>

      {/* Command Dialog */}
      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Command Palette"
        description="Search for addresses, transactions, selectors, or navigate to pages"
        showCloseButton={false}
      >
        <CommandInput
          placeholder="Search address, tx, command..."
          value={query}
          onValueChange={setQuery}
        />

        {/* Type detection badge */}
        {badge && (
          <div className="flex items-center gap-2 px-4 pb-2 pt-1">
            <Badge variant={badge.variant} size="sm">
              {badge.label}
            </Badge>
          </div>
        )}

        <CommandList>
          {matchingTools.length === 0 && (
            <CommandEmpty>
              {inputType === "unknown" && query.trim()
                ? "Input not recognized. Try: address, tx hash, selector, signature, or calldata"
                : "Type to search..."}
            </CommandEmpty>
          )}

          {/* Recent Searches */}
          {inputType === "empty" && recentSearches.length > 0 && (
            <CommandGroup heading="Recent Searches">
              {recentSearches.map((recent, i) => (
                <CommandItem
                  key={`recent-${recent.query}-${i}`}
                  value={`recent:${recent.query}:${recent.toolId}`}
                  onSelect={() => handleRecentSelect(recent)}
                >
                  <RotateCcw className="mr-2 size-4 opacity-50" />
                  <span className="font-mono text-xs truncate">
                    {recent.query}
                  </span>
                </CommandItem>
              ))}
              <CommandItem
                value="clear-recent-searches"
                onSelect={clearRecentSearches}
                className="text-muted-foreground"
              >
                <X className="mr-2 size-4 opacity-50" />
                <span className="text-xs">Clear recent searches</span>
              </CommandItem>
            </CommandGroup>
          )}

          {/* Smart Results (input-type-based tools) */}
          {matchingTools.length > 0 && (
            <CommandGroup heading="Smart Results" forceMount>
              {matchingTools.map((tool) => {
                const Icon = ICON_MAP[tool.icon];
                return (
                  <CommandItem
                    key={tool.id}
                    value={`tool:${tool.id}:${tool.name}`}
                    onSelect={() => handleToolSelect(tool.id)}
                  >
                    {Icon && <Icon className="mr-2 size-4 opacity-70" />}
                    <div className="flex flex-col">
                      <span>{tool.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {tool.description}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          <CommandSeparator />

          {/* Pages */}
          <CommandGroup heading="Pages">
            {pages.map((page) => {
              const Icon = ICON_MAP[page.icon];
              return (
                <CommandItem
                  key={page.id}
                  value={`page:${page.id}:${page.name}`}
                  keywords={page.keywords}
                  onSelect={() => handlePageSelect(page.route)}
                >
                  {Icon && <Icon className="mr-2 size-4 opacity-70" />}
                  <span>{page.name}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          {/* Actions */}
          <CommandGroup heading="Actions">
            <CommandItem
              value="action:wallet:Connect Wallet"
              keywords={["wallet", "connect", "metamask"]}
              onSelect={() => {
                handleOpenChange(false);
                const btn =
                  document.querySelector<HTMLButtonElement>(
                    ".rainbowkit-connect-btn",
                  );
                btn?.click();
              }}
            >
              <Wallet className="mr-2 size-4 opacity-70" />
              <span>Connect Wallet</span>
            </CommandItem>
            {onOpenRpcSettings && (
              <CommandItem
                value="action:rpc:RPC Settings"
                keywords={[
                  "rpc",
                  "settings",
                  "network",
                  "provider",
                  "alchemy",
                  "infura",
                ]}
                onSelect={() => {
                  handleOpenChange(false);
                  onOpenRpcSettings();
                }}
              >
                <Settings className="mr-2 size-4 opacity-70" />
                <span>RPC Settings</span>
              </CommandItem>
            )}
            {onOpenStorageManager && (
              <CommandItem
                value="action:storage:Storage Manager"
                keywords={["storage", "cache", "clear", "manage"]}
                onSelect={() => {
                  handleOpenChange(false);
                  onOpenStorageManager();
                }}
              >
                <HardDrive className="mr-2 size-4 opacity-70" />
                <span>Storage Manager</span>
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
};

export default UniversalSearchBar;
