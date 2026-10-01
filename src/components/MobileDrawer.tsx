import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { MagnifyingGlass, CaretRight } from "@phosphor-icons/react";
import type { ChainTool } from "../chains/plugin";
import { resolvePath } from "../chains/plugins";
import { cn } from "@/lib/utils";

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MobileDrawer: React.FC<MobileDrawerProps> = ({ open, onOpenChange }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { plugin, tool } = resolvePath(location.pathname);
  const navTools = plugin.tools.filter((t) => t.nav);
  const activeTool = tool?.nav ? tool : navTools.find((t) => t.id === tool?.navParent) ?? navTools[0];
  const activeToolId = activeTool.id;

  const handleSearch = () => {
    onOpenChange(false);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })
    );
  };

  const handleToolClick = (route: string) => {
    navigate(plugin.basePath + route);
    onOpenChange(false);
  };

  const handleSubTabClick = (
    tool: ChainTool,
    subId: string,
    paramKey: string
  ) => {
    // Route-based sub-tabs navigate to a sub-path (e.g. /integrations/lifi-earn)
    if (paramKey === "route") {
      navigate(`${plugin.basePath}${tool.path}/${subId}`);
      onOpenChange(false);
      return;
    }

    const params = new URLSearchParams();
    params.set(paramKey, subId);
    navigate(
      { pathname: plugin.basePath + tool.path, search: `?${params.toString()}` },
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
          {navTools.map((tool) => {
            const Icon = tool.nav!.icon;
            const subTabs = tool.nav!.subTabs;
            const isActive = tool.id === activeToolId;
            return (
              <div key={tool.id}>
                <button
                  type="button"
                  onClick={() => handleToolClick(tool.path)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {tool.nav!.label}
                  <CaretRight
                    className={cn(
                      "ml-auto size-3.5 transition-transform",
                      isActive && "rotate-90"
                    )}
                  />
                </button>

                {isActive && subTabs && (
                  <div className="ml-7 mt-1 flex flex-col gap-0.5 border-l border-border/30 pl-3">
                    {subTabs.map((sub) => {
                      const params = new URLSearchParams(location.search);
                      const currentSubId =
                        params.get(sub.paramKey) || subTabs[0].id;
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
