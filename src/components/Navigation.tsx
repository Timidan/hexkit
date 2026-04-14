import React, { useRef, useEffect, useLayoutEffect, useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import type { Variants } from "framer-motion";
import { Lightning, Play, Code, GitDiff, Database } from "@phosphor-icons/react";
import {
  SearchIcon,
  HashtagIcon,
  ToolIcon,
  FileTextIcon,
  ZapIcon,
} from "./icons/IconLibrary";

interface SubTab {
  id: string;
  label: string;
  shortLabel?: string;
  icon?: React.ReactNode;
  paramKey: string;
}

interface ToolDef {
  id: string;
  route: string;
  label: string;
  shortLabel: string;
  subTabs: SubTab[] | null;
}

const TOOLS: ToolDef[] = [
  {
    id: "database",
    route: "/database",
    label: "Signature Database",
    shortLabel: "Signatures",
    subTabs: [
      { id: "lookup", label: "Lookup", shortLabel: "Lookup", paramKey: "tab", icon: <HashtagIcon width={12} height={12} /> },
      { id: "search", label: "Search", shortLabel: "Search", paramKey: "tab", icon: <SearchIcon width={12} height={12} /> },
      { id: "tools", label: "Tools", shortLabel: "Tools", paramKey: "tab", icon: <ToolIcon width={12} height={12} /> },
      { id: "custom", label: "Custom", shortLabel: "Custom", paramKey: "tab", icon: <FileTextIcon width={12} height={12} /> },
      { id: "cache", label: "Cache", shortLabel: "Cache", paramKey: "tab", icon: <ZapIcon width={12} height={12} /> },
    ],
  },
  {
    id: "builder",
    route: "/builder",
    label: "Transaction Utils",
    shortLabel: "Tx Utils",
    subTabs: [
      { id: "live", label: "Live Interaction", shortLabel: "Live", paramKey: "mode", icon: <Lightning width={12} height={12} /> },
      { id: "simulation", label: "Simulation (EDB)", shortLabel: "Sim", paramKey: "mode", icon: <Play width={12} height={12} /> },
    ],
  },
  {
    id: "explorer",
    route: "/explorer",
    label: "Source Tools",
    shortLabel: "Source",
    subTabs: [
      { id: "explorer", label: "Explorer", shortLabel: "Explorer", paramKey: "tool", icon: <Code width={12} height={12} /> },
      { id: "diff", label: "Contract Diff", shortLabel: "Diff", paramKey: "tool", icon: <GitDiff width={12} height={12} /> },
      { id: "storage", label: "Storage", shortLabel: "Storage", paramKey: "tool", icon: <Database width={12} height={12} /> },
    ],
  },
  {
    id: "integrations",
    route: "/integrations",
    label: "Integrations",
    shortLabel: "Integrate",
    subTabs: [
      { id: "lifi-earn", label: "LI.FI Earn", shortLabel: "LI.FI", paramKey: "route", icon: <img src="/logos/lifi.png" alt="" width={14} height={14} className="opacity-80" /> },
    ],
  },
];

function getActiveToolId(pathname: string): string {
  if (pathname.startsWith("/builder")) return "builder";
  if (pathname.startsWith("/simulations")) return "builder";
  if (pathname.startsWith("/database")) return "database";
  if (pathname.startsWith("/explorer")) return "explorer";
  if (pathname.startsWith("/integrations")) return "integrations";
  return "database";
}

function getActiveSubTabId(tool: ToolDef, search: string, pathname: string): string | null {
  if (!tool.subTabs) return null;
  // /simulations is the history page — highlight the "simulation" sub-tab
  if (pathname.startsWith("/simulations")) return "simulation";
  const params = new URLSearchParams(search);
  // Replay is a simulation workflow even though it can carry dedicated replay params.
  if (
    tool.id === "builder" &&
    (params.get("mode") === "replay" || params.get("replay") === "txhash")
  ) {
    return "simulation";
  }
  // Route-based sub-tabs: match by pathname segment (e.g. /integrations/lifi-earn)
  if (tool.subTabs[0]?.paramKey === "route") {
    const segment = pathname.replace(new RegExp(`^${tool.route}/?`), "").split("/")[0];
    for (const sub of tool.subTabs) {
      if (sub.id === segment) return sub.id;
    }
    return tool.subTabs[0].id;
  }

  for (const sub of tool.subTabs) {
    const val = params.get(sub.paramKey);
    if (val === sub.id) return sub.id;
  }
  return tool.subTabs[0].id;
}

function measureBtn(
  rowEl: HTMLElement | null,
  activeId: string | null,
  dataAttr: string,
): { left: number; width: number } | null {
  if (!rowEl || !activeId) return null;
  const btn = rowEl.querySelector<HTMLElement>(`[data-${dataAttr}="${activeId}"]`);
  if (!btn) return null;
  const rowRect = rowEl.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  return { left: btnRect.left - rowRect.left, width: btnRect.width };
}

const SPRING = { stiffness: 320, damping: 30, mass: 0.8 };
const SUB_STAGGER = { staggerChildren: 0.04, delayChildren: 0.06 };
const SUB_ITEM: Variants = {
  hidden: { opacity: 0, y: -6, scale: 0.92 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...SPRING, type: "spring" as const },
  },
  exit: { opacity: 0, y: 4, scale: 0.95, transition: { duration: 0.12 } },
};

const Navigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const activeToolId = getActiveToolId(location.pathname);
  const activeTool = TOOLS.find((t) => t.id === activeToolId) ?? TOOLS[0];
  const activeSubId = getActiveSubTabId(activeTool, location.search, location.pathname);
  const hasSubTabs = activeTool.subTabs != null && activeTool.subTabs.length > 0;

  // Refs
  const capsuleRef = useRef<HTMLDivElement>(null);
  const mainRowRef = useRef<HTMLDivElement>(null);
  const subRowRef = useRef<HTMLDivElement>(null);

  const spotlightX = useMotionValue(0);
  const spotlightY = useMotionValue(0);
  const spotlightOpacity = useMotionValue(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = capsuleRef.current?.getBoundingClientRect();
      if (!rect) return;
      spotlightX.set(e.clientX - rect.left);
      spotlightY.set(e.clientY - rect.top);
      spotlightOpacity.set(1);
    },
    [spotlightX, spotlightY, spotlightOpacity],
  );

  const handleMouseLeave = useCallback(() => {
    spotlightOpacity.set(0);
  }, [spotlightOpacity]);

  const mainLeft = useSpring(0, SPRING);
  const mainWidth = useSpring(0, SPRING);

  const subLeft = useSpring(0, SPRING);
  const subWidth = useSpring(0, SPRING);

  const hasMountedRef = useRef(false);
  const [hasInitialRender, setHasInitialRender] = useState(true);

  const syncMainIndicator = useCallback(() => {
    const m = measureBtn(mainRowRef.current, activeToolId, "tool");
    if (!m) return;
    if (!hasMountedRef.current) {
      mainLeft.jump(m.left);
      mainWidth.jump(m.width);
    } else {
      mainLeft.set(m.left);
      mainWidth.set(m.width);
    }
  }, [activeToolId, mainLeft, mainWidth]);

  const syncSubIndicator = useCallback(() => {
    const m = measureBtn(subRowRef.current, activeSubId, "sub");
    if (!m) return;
    if (!hasMountedRef.current) {
      subLeft.jump(m.left);
      subWidth.jump(m.width);
    } else {
      subLeft.set(m.left);
      subWidth.set(m.width);
    }
  }, [activeSubId, subLeft, subWidth]);

  const syncIndicators = useCallback(() => {
    syncMainIndicator();
    syncSubIndicator();
  }, [syncMainIndicator, syncSubIndicator]);

  useLayoutEffect(() => {
    syncIndicators();
  }, [syncIndicators]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      syncIndicators();
      hasMountedRef.current = true;
      setHasInitialRender((prev) => (prev ? false : prev));
    });
    const timer = window.setTimeout(() => {
      syncIndicators();
    }, 200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [activeToolId, activeSubId, syncIndicators]);

  useEffect(() => {
    const onResize = () => syncIndicators();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncIndicators]);

  useEffect(() => {
    let cancelled = false;
    const fontSet = document.fonts;
    const handleFontsSettled = () => { if (!cancelled) syncIndicators(); };
    fontSet.ready.then(handleFontsSettled);
    fontSet.addEventListener("loadingdone", handleFontsSettled);
    return () => {
      cancelled = true;
      fontSet.removeEventListener("loadingdone", handleFontsSettled);
    };
  }, [syncIndicators]);

  useEffect(() => {
    const rows = [mainRowRef.current, subRowRef.current].filter(
      (row): row is HTMLDivElement => row !== null,
    );
    if (rows.length === 0) return;

    const observer = new ResizeObserver(() => {
      syncIndicators();
    });

    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [syncIndicators]);

  const [pressedTab, setPressedTab] = useState<string | null>(null);

  const handleToolClick = (tool: ToolDef) => {
    if (tool.id === activeToolId) return;
    navigate(tool.route);
  };

  const handleSubTabClick = (sub: SubTab) => {
    if (sub.id === activeSubId) return;

    // Route-based sub-tabs navigate to a sub-path (e.g. /integrations/lifi-earn)
    if (sub.paramKey === "route") {
      navigate(`${activeTool.route}/${sub.id}`);
      return;
    }

    const params = new URLSearchParams(location.search);
    params.set(sub.paramKey, sub.id);
    // Use the tool's canonical route when the current path doesn't match
    // (e.g. navigating from /simulations back to /builder?mode=live)
    const basePath = location.pathname.startsWith(activeTool.route)
      ? location.pathname
      : activeTool.route;
    navigate(
      { pathname: basePath, search: `?${params.toString()}` },
      { replace: true },
    );
  };

  return (
    <div className="flex justify-center px-1 pt-3 sm:px-0">
      <div
        ref={capsuleRef}
        className="capsule-nav"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Cursor spotlight overlay */}
        <motion.div
          className="capsule-spotlight"
          style={{
            background: `radial-gradient(180px circle at ${spotlightX.get()}px ${spotlightY.get()}px, rgba(255,255,255,0.06), transparent 70%)`,
            opacity: spotlightOpacity,
          }}
          ref={(el) => {
            if (!el) return;
            const unsub1 = spotlightX.on("change", (x) => {
              el.style.background = `radial-gradient(180px circle at ${x}px ${spotlightY.get()}px, rgba(255,255,255,0.06), transparent 70%)`;
            });
            const unsub2 = spotlightY.on("change", (y) => {
              el.style.background = `radial-gradient(180px circle at ${spotlightX.get()}px ${y}px, rgba(255,255,255,0.06), transparent 70%)`;
            });
            const unsub3 = spotlightOpacity.on("change", (o) => {
              el.style.opacity = String(o);
            });
            (el as any).__spotlightUnsub = () => { unsub1(); unsub2(); unsub3(); };
          }}
        />

        <div className="capsule-refraction" />

        <div className="capsule-main-row" ref={mainRowRef}>
          <motion.div
            className="capsule-indicator"
            style={{ left: mainLeft, width: mainWidth }}
          />
          {TOOLS.map((tool) => (
            <motion.button
              key={tool.id}
              type="button"
              data-tool={tool.id}
              className={`capsule-tab${tool.id === activeToolId ? " active" : ""}`}
              onClick={() => handleToolClick(tool)}
              onPointerDown={() => setPressedTab(tool.id)}
              onPointerUp={() => setPressedTab(null)}
              onPointerLeave={() => setPressedTab(null)}
              animate={{
                scale: pressedTab === tool.id ? 0.96 : 1,
              }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              <span className="hidden sm:inline">{tool.label}</span>
              <span className="sm:hidden">{tool.shortLabel}</span>
            </motion.button>
          ))}
        </div>

        <div className={`capsule-sub${hasSubTabs ? " open" : ""}`}>
          <div className="capsule-sub-inner">
            <div className="capsule-divider" />
            <div className="capsule-sub-row" ref={subRowRef}>
              <motion.div
                className="capsule-sub-indicator"
                style={{ left: subLeft, width: subWidth }}
              />
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeToolId}
                  className="capsule-sub-items"
                  variants={{ visible: { transition: SUB_STAGGER }, hidden: {}, exit: {} }}
                  initial={hasInitialRender ? false : "hidden"}
                  animate="visible"
                  exit="exit"
                >
                  {activeTool.subTabs?.map((sub) => (
                    <motion.button
                      key={sub.id}
                      type="button"
                      data-sub={sub.id}
                      className={`capsule-sub-tab${sub.id === activeSubId ? " active" : ""}`}
                      onClick={() => handleSubTabClick(sub)}
                      variants={hasInitialRender ? undefined : SUB_ITEM}
                      whileTap={{ scale: 0.94 }}
                    >
                      {sub.icon}
                      <span className="hidden sm:inline">{sub.label}</span>
                      <span className="sm:hidden">{sub.shortLabel ?? sub.label}</span>
                    </motion.button>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Navigation;
