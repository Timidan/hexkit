import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import { contextSearch, resolvePath } from "@/chains/plugins";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import {
  useUniversalSearch,
  type InputType,
  type RecentSearch,
} from "@/hooks/useUniversalSearch";
import {
  MagnifyingGlass,
  Code,
  GitDiff,
  Database,
  Play,
  Lightning,
  Hash,
  TreeStructure,
  ArrowCounterClockwise,
  Command as CommandIcon,
  Globe,
  FileCode,
  Wrench,
  FileText,
  GearSix,
  HardDrive,
  Wallet,
  X,
} from "@phosphor-icons/react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Code2: Code,
  GitCompare: GitDiff,
  Database,
  Play,
  Zap: Lightning,
  Hash,
  ListTree: TreeStructure,
  RotateCcw: ArrowCounterClockwise,
  Globe,
  FileCode,
  Wrench,
  FileText,
  Search: MagnifyingGlass,
  Settings: GearSix,
  HardDrive,
  Wallet,
};

interface TypeBadgeConfig {
  label: string;
  variant: "info" | "teal" | "secondary" | "warning" | "success" | "default";
}

function getInputBadge(type: InputType): TypeBadgeConfig | null {
  switch (type) {
    case "actorid":
      return { label: "32-byte ID", variant: "info" };
    case "ss58":
      return { label: "SS58 address", variant: "info" };
    case "program":
      return { label: "Program", variant: "info" };
    case "message":
      return { label: "Message", variant: "teal" };
    case "extrinsic":
      return { label: "Extrinsic", variant: "teal" };
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
  const location = useLocation();
  const { plugin } = resolvePath(location.pathname);
  const isVara = plugin.id === "vara";

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

  const handleOpenChange = setOpen;

  useEffect(() => {
    if (open) return;
    const timer = setTimeout(reset, 200);
    return () => clearTimeout(timer);
  }, [open, reset]);

  const handleToolSelect = useCallback(
    (toolId: string) => {
      executeTool(toolId);
      handleOpenChange(false);
    },
    [executeTool, handleOpenChange],
  );

  const handlePageSelect = useCallback(
    (route: string) => {
      const target = new URL(route, window.location.origin);
      new URLSearchParams(contextSearch(plugin, location.search)).forEach((value, key) => target.searchParams.set(key, value));
      navigate(target.pathname + target.search);
      handleOpenChange(false);
    },
    [navigate, handleOpenChange, plugin, location.search],
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
          <MagnifyingGlass className="size-3.5 shrink-0 opacity-60" />
          <span className="truncate text-xs opacity-60">
            Search or type a command...
          </span>
        </span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border border-border/60 bg-muted/50 px-1.5 font-mono text-[10px] font-medium opacity-50 sm:inline-flex">
          <CommandIcon className="size-2.5" />K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Command Palette"
        description="Find a tool or paste an identifier to open it"
        showCloseButton={false}
      >
        <CommandInput
          placeholder={isVara ? "Search tools, program, message, SS58…" : "Search address, tx, command..."}
          value={query}
          onValueChange={setQuery}
        />

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
                ? (isVara ? "No matching tool. Try a 32-byte ID, SS58 address, block-index, or explorer link." : "No matching tool. Try an address, tx hash, selector, signature, or calldata.")
                : "Type to search..."}
            </CommandEmpty>
          )}

          {inputType === "empty" && recentSearches.length > 0 && (
            <CommandGroup heading="Recent Searches">
              {recentSearches.map((recent, i) => (
                <CommandItem
                  key={`recent-${recent.query}-${i}`}
                  value={`recent:${recent.query}:${recent.toolId}`}
                  onSelect={() => handleRecentSelect(recent)}
                >
                  <ArrowCounterClockwise className="mr-2 size-4 opacity-50" />
                  <span className="shrink-0 text-xs">{recent.toolName}</span>
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

          <CommandGroup heading="Actions">
            {plugin.evmServices && <CommandItem
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
            </CommandItem>}
            {plugin.evmServices && onOpenRpcSettings && (
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
                <GearSix className="mr-2 size-4 opacity-70" />
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
