import React, { useRef, useEffect, useLayoutEffect, useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";
import type { ChainSubTab, ChainTool } from "../chains/plugin";
import { contextSearch, resolvePath } from "../chains/plugins";

function getActiveSubTabId(tool: ChainTool, params: URLSearchParams, rel: string): string | null {
  const resolved = tool.resolveSubTab?.(rel, params);
  if (resolved != null) return resolved;
  const subTabs = tool.nav?.subTabs;
  if (!subTabs?.length) return null;
  // Route-based sub-tabs: match by pathname segment (e.g. /integrations/lifi-earn).
  // Return null when URL has no segment yet so handleSubTabClick doesn't
  // falsely short-circuit on the first subtab and leave the user on a blank
  // parent route (e.g. /integrations with no body).
  if (subTabs[0]?.paramKey === "route") {
    const segment = rel.replace(new RegExp(`^${tool.path}/?`), "").split("/")[0];
    if (!segment) return null;
    for (const sub of subTabs) {
      if (sub.id === segment) return sub.id;
    }
    return subTabs[0].id;
  }

  for (const sub of subTabs) {
    const val = params.get(sub.paramKey);
    if (val === sub.id) return sub.id;
  }
  return subTabs[0].id;
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
const SUB_STAGGER = { staggerChildren: 0, delayChildren: 0 };
const SUB_ITEM: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.12, ease: [0.23, 1, 0.32, 1] as const },
  },
  exit: { opacity: 0, transition: { duration: 0.12, ease: [0.23, 1, 0.32, 1] as const } },
};

const Navigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const { plugin, rel, tool } = resolvePath(location.pathname);
  const navTools = plugin.tools.filter((t) => t.nav);
  const activeTool = tool?.nav ? tool : navTools.find((t) => t.id === tool?.navParent) ?? navTools[0];
  const activeToolId = activeTool.id;
  const activeSubId = getActiveSubTabId(activeTool, new URLSearchParams(location.search), rel);
  const hasSubTabs = activeTool.nav?.subTabs != null && activeTool.nav.subTabs.length > 0;

  const subItemVariant: Variants = reduce
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.12, ease: [0.23, 1, 0.32, 1] as const } },
        exit: { opacity: 0, transition: { duration: 0.12, ease: [0.23, 1, 0.32, 1] as const } },
      }
    : SUB_ITEM;

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
    if (!hasMountedRef.current || reduce) {
      mainLeft.jump(m.left);
      mainWidth.jump(m.width);
    } else {
      mainLeft.set(m.left);
      mainWidth.set(m.width);
    }
  }, [activeToolId, mainLeft, mainWidth, reduce]);

  const syncSubIndicator = useCallback(() => {
    const m = measureBtn(subRowRef.current, activeSubId, "sub");
    if (!m) return;
    if (!hasMountedRef.current || reduce) {
      subLeft.jump(m.left);
      subWidth.jump(m.width);
    } else {
      subLeft.set(m.left);
      subWidth.set(m.width);
    }
  }, [activeSubId, subLeft, subWidth, reduce]);

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

  const handleToolClick = (tool: ChainTool) => {
    if (tool.id === activeToolId) return;
    navigate({ pathname: plugin.basePath + tool.path, search: contextSearch(plugin, location.search) });
  };

  const handleSubTabClick = (sub: ChainSubTab) => {
    if (sub.id === activeSubId) return;

    // Route-based sub-tabs navigate to a sub-path (e.g. /integrations/lifi-earn)
    if (sub.paramKey === "route") {
      navigate(`${plugin.basePath}${activeTool.path}/${sub.id}`);
      return;
    }

    const params = new URLSearchParams(location.search);
    params.set(sub.paramKey, sub.id);
    // Use the tool's canonical route when the current path doesn't match
    // (e.g. navigating from /simulations back to /builder?mode=live)
    const basePath = rel.startsWith(activeTool.path)
      ? location.pathname
      : plugin.basePath + activeTool.path;
    navigate(
      { pathname: basePath, search: `?${params.toString()}` },
      { replace: true },
    );
  };

  return (
    <nav aria-label={`${plugin.name} tools`} className={`flex justify-center px-1 pt-3 sm:px-0 ${plugin.id}-navigation`}>
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
          {navTools.map((tool) => (
            <motion.button
              key={tool.id}
              type="button"
              data-tool={tool.id}
              aria-current={tool.id === activeToolId ? "true" : undefined}
              className={`capsule-tab${tool.id === activeToolId ? " active" : ""}`}
              onClick={() => handleToolClick(tool)}
              onPointerDown={() => setPressedTab(tool.id)}
              onPointerUp={() => setPressedTab(null)}
              onPointerLeave={() => setPressedTab(null)}
              // Native scale prop only — animating a raw `transform` string leaves
              // the element at matrix(0,…) when framer interpolates back to "none".
              animate={{ scale: reduce ? 1 : pressedTab === tool.id ? 0.96 : 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              <span className="hidden sm:inline">{tool.nav!.label}</span>
              <span className="sm:hidden">{tool.nav!.shortLabel}</span>
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
                  {activeTool.nav?.subTabs?.map((sub) => (
                    <motion.button
                      key={sub.id}
                      type="button"
                      data-sub={sub.id}
                      aria-current={sub.id === activeSubId ? "page" : undefined}
                      className={`capsule-sub-tab${sub.id === activeSubId ? " active" : ""}`}
                      onClick={() => handleSubTabClick(sub)}
                      variants={hasInitialRender ? undefined : subItemVariant}
                      whileTap={reduce ? undefined : { scale: 0.96 }}
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
    </nav>
  );
};

export default Navigation;
