import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Database, Wrench, Code, MagnifyingGlass, CaretRight, Stack } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TOOLS = [
  {
    id: "database",
    route: "/database",
    label: "Signature Database",
    icon: Database,
    subTabs: [
      { id: "lookup", label: "Lookup", paramKey: "tab" },
      { id: "search", label: "Search", paramKey: "tab" },
      { id: "tools", label: "Tools", paramKey: "tab" },
      { id: "custom", label: "Custom", paramKey: "tab" },
      { id: "cache", label: "Cache", paramKey: "tab" },
    ],
  },
  {
    id: "builder",
    route: "/builder",
    label: "Transaction Utils",
    icon: Wrench,
    subTabs: [
      { id: "live", label: "Live Interaction", paramKey: "mode" },
      { id: "simulation", label: "Simulation (EDB)", paramKey: "mode" },
    ],
  },
  {
    id: "explorer",
    route: "/explorer",
    label: "Source Tools",
    icon: Code,
    subTabs: [
      { id: "explorer", label: "Explorer", paramKey: "tool" },
      { id: "diff", label: "Contract Diff", paramKey: "tool" },
      { id: "storage", label: "Storage", paramKey: "tool" },
    ],
  },
  {
    id: "integrations",
    route: "/integrations",
    label: "Integrations",
    icon: Stack,
    subTabs: [
      { id: "lifi-earn", label: "LI.FI Earn", paramKey: "route" },
    ],
  },
];

function getActiveToolId(pathname: string): string {
  if (pathname.startsWith("/builder") || pathname.startsWith("/simulations")) return "builder";
  if (pathname.startsWith("/database")) return "database";
  if (pathname.startsWith("/explorer")) return "explorer";
  if (pathname.startsWith("/integrations")) return "integrations";
  return "database";
}

const MobileDrawer: React.FC<MobileDrawerProps> = ({ open, onOpenChange }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeToolId = getActiveToolId(location.pathname);

  const handleSearch = () => {
    onOpenChange(false);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })
    );
  };

  const handleToolClick = (route: string) => {
    navigate(route);
    onOpenChange(false);
  };

  const handleSubTabClick = (
    tool: (typeof TOOLS)[number],
    subId: string,
    paramKey: string
  ) => {
    // Route-based sub-tabs navigate to a sub-path (e.g. /integrations/lifi-earn)
    if (paramKey === "route") {
      navigate(`${tool.route}/${subId}`);
      onOpenChange(false);
      return;
    }

    const params = new URLSearchParams();
    params.set(paramKey, subId);
    navigate(
      { pathname: tool.route, search: `?${params.toString()}` },
      { replace: true }
    );
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[280px] bg-background/95 backdrop-blur-sm border-r border-border/50 p-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Navigation
          </SheetTitle>
        </SheetHeader>

        <button
          type="button"
          onClick={handleSearch}
          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <MagnifyingGlass className="size-4 opacity-60" />
          <span className="opacity-70">Search...</span>
          <kbd className="ml-auto rounded border border-border/40 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px]">
            Ctrl+K
          </kbd>
        </button>

        <div className="h-px bg-border/30 mx-4 my-1" />

        <nav className="flex flex-col gap-1 px-2 py-2">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isActive = tool.id === activeToolId;
            return (
              <div key={tool.id}>
                <button
                  type="button"
                  onClick={() => handleToolClick(tool.route)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {tool.label}
                  <CaretRight
                    className={cn(
                      "ml-auto size-3.5 transition-transform",
                      isActive && "rotate-90"
                    )}
                  />
                </button>

                {isActive && tool.subTabs && (
                  <div className="ml-7 mt-1 flex flex-col gap-0.5 border-l border-border/30 pl-3">
                    {tool.subTabs.map((sub) => {
                      const params = new URLSearchParams(location.search);
                      const currentSubId =
                        params.get(sub.paramKey) || tool.subTabs[0].id;
                      const isSubActive = sub.id === currentSubId;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() =>
                            handleSubTabClick(tool, sub.id, sub.paramKey)
                          }
                          className={cn(
                            "rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                            isSubActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          )}
                        >
                          {sub.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
};

export default MobileDrawer;
