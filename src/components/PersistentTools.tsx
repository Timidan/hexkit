import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import PageSkeleton from "./shared/PageSkeleton";
import { buildFamilyPath, stripFamilyPrefix } from "../routes/familyRoutes";
import { useActiveChainFamily } from "../hooks/useActiveChainFamily";
import { DEFAULT_FAMILY_CAPABILITIES } from "../chains/capabilities";
import { TOOL_REGISTRY, isToolAllowed, type ToolEntry } from "../chains/toolRegistry";

interface ToolRoute extends ToolEntry {
  render: () => React.ReactElement;
}

const TransactionBuilderHub = React.lazy(() => import("./TransactionBuilderHub"));
const SignatureDatabase = React.lazy(() => import("./SignatureDatabase"));
const SimulationHistoryPage = React.lazy(() => import("./SimulationHistoryPage"));
const SourceTools = React.lazy(() => import("./explorer/SourceTools"));
const IntegrationsHub = React.lazy(() => import("./integrations/IntegrationsHub"));

const TOOL_RENDERERS: Record<string, () => React.ReactElement> = {
  database: () => <SignatureDatabase />,
  builder: () => <TransactionBuilderHub />,
  simulations: () => <SimulationHistoryPage />,
  explorer: () => <SourceTools />,
  integrations: () => <IntegrationsHub />,
};

/**
 * Tool paths come from the shared TOOL_REGISTRY so capability gating stays
 * authoritative here — PersistentTools filters the registry by the active
 * family's capability set BEFORE matching, which means `/starknet/builder`
 * cannot render the EVM TransactionBuilderHub even if the URL is typed by
 * hand.
 *
 * Panel cache keys include the family to prevent one family's tool state
 * being reused under another — per the Phase 2 risk in the plan.
 */
const ALL_TOOL_ROUTES: ToolRoute[] = TOOL_REGISTRY.map((entry) => ({
  ...entry,
  render: TOOL_RENDERERS[entry.id],
}));

function routeMatches(route: ToolRoute, strippedPath: string): boolean {
  return route.prefix ? strippedPath.startsWith(route.path) : route.path === strippedPath;
}

const INACTIVE_ROUTE_TIMEOUT_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

const EXIT_MS = 150;
const ENTER_MS = 300;
const ENTER_EASE = "cubic-bezier(0.25,0.46,0.45,0.94)";

const PersistentTools: React.FC = () => {
  const location = useLocation();
  const family = useActiveChainFamily();
  const strippedPath = useMemo(() => stripFamilyPrefix(location.pathname), [location.pathname]);
  const familyCapabilities = DEFAULT_FAMILY_CAPABILITIES[family];
  /** Tools available for the active family. Filters by capability BEFORE route
   *  matching so non-EVM routes can never resolve into EVM tool renderers. */
  const toolRoutes = useMemo<ToolRoute[]>(
    () => ALL_TOOL_ROUTES.filter((route) => isToolAllowed(route, familyCapabilities)),
    [familyCapabilities],
  );
  /** Cache key used for panel storage — family:toolPath. Prevents state leakage
   *  between families when Phase 4+ registers the same tool in multiple families. */
  const cacheKey = useCallback((toolPath: string) => `${family}:${toolPath}`, [family]);
  const elementsRef = useRef<Record<string, React.ReactElement>>({});
  const lastVisitRef = useRef<Record<string, number>>({});
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [visitedPaths, setVisitedPaths] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    const matched = toolRoutes.find((route) => routeMatches(route, strippedPath));
    if (matched) {
      const key = `${family}:${matched.path}`;
      initial.add(key);
      lastVisitRef.current[key] = Date.now();
    }
    return initial;
  });

  const [visiblePath, setVisiblePath] = useState(() => {
    const matched = toolRoutes.find((route) => routeMatches(route, strippedPath));
    return `${family}:${matched?.path ?? strippedPath}`;
  });
  const animatingRef = useRef(false);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enterRafRef = useRef<number | undefined>(undefined);

  // Resolve the route key for the current pathname so sub-route changes within
  // a prefix route (e.g. /integrations/lifi-earn → /integrations/other) don't
  // trigger a full panel transition — only top-level tool switches do.
  const activeRouteKey = useMemo(() => {
    const r = toolRoutes.find((route) => routeMatches(route, strippedPath));
    return cacheKey(r?.path ?? strippedPath);
  }, [strippedPath, cacheKey, toolRoutes]);

  const cleanupInactiveRoutes = useCallback(() => {
    const now = Date.now();

    setVisitedPaths((prev) => {
      const keysToRemove: string[] = [];

      prev.forEach((key) => {
        // Key the "current" route by the normalized activeRouteKey, not the
        // raw stripped path — otherwise deep prefix routes like
        // `/integrations/lifi-earn` never match and get purged while active.
        if (key === activeRouteKey) {
          lastVisitRef.current[key] = now;
          return;
        }

        const lastVisit = lastVisitRef.current[key] || 0;
        if (now - lastVisit > INACTIVE_ROUTE_TIMEOUT_MS) {
          keysToRemove.push(key);
        }
      });

      if (keysToRemove.length === 0) return prev;

      keysToRemove.forEach((key) => {
        delete elementsRef.current[key];
        delete lastVisitRef.current[key];
      });

      const next = new Set(prev);
      keysToRemove.forEach((key) => next.delete(key));
      return next;
    });
  }, [activeRouteKey]);

  useEffect(() => {
    const intervalId = setInterval(cleanupInactiveRoutes, CLEANUP_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [cleanupInactiveRoutes]);

  useEffect(() => {
    const matched = toolRoutes.find((route) => routeMatches(route, strippedPath));
    if (matched) {
      const key = cacheKey(matched.path);
      lastVisitRef.current[key] = Date.now();

      setVisitedPaths((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }
  }, [strippedPath, cacheKey, toolRoutes]);

  useEffect(() => {
    const targetPath = activeRouteKey;
    if (targetPath === visiblePath && !animatingRef.current) return;
    if (targetPath === visiblePath) return;

    // Abort any in-flight animation
    clearTimeout(cleanupTimerRef.current);
    if (enterRafRef.current) cancelAnimationFrame(enterRafRef.current);

    const oldPanel = panelRefs.current[visiblePath];
    const oldPath = visiblePath;

    animatingRef.current = true;

    if (oldPanel) {
      oldPanel.style.transition = `opacity ${EXIT_MS}ms ease-in, transform ${EXIT_MS}ms ease-in`;
      oldPanel.style.opacity = "0";
      oldPanel.style.transform = "scale(0.95)";
      oldPanel.style.pointerEvents = "none";
    }

    cleanupTimerRef.current = setTimeout(() => {
      if (oldPanel) {
        oldPanel.style.transition = "none";
        oldPanel.style.opacity = "";
        oldPanel.style.transform = "";
        oldPanel.style.pointerEvents = "";
        oldPanel.style.display = "none";
      }

      const newPanel = panelRefs.current[targetPath];
      if (newPanel) {
        newPanel.style.transition = "none";
        newPanel.style.display = "block";
        newPanel.style.opacity = "0";
        newPanel.style.transform = "scale(0.97) translateY(12px)";
      }

      setVisiblePath(targetPath);

      enterRafRef.current = requestAnimationFrame(() => {
        enterRafRef.current = requestAnimationFrame(() => {
          const panel = panelRefs.current[targetPath];
          if (panel) {
            panel.style.transition = `opacity ${ENTER_MS}ms ${ENTER_EASE}, transform ${ENTER_MS}ms ${ENTER_EASE}`;
            panel.style.opacity = "1";
            panel.style.transform = "scale(1) translateY(0)";
          }

          cleanupTimerRef.current = setTimeout(() => {
            const p = panelRefs.current[targetPath];
            if (p) {
              p.style.transition = "";
              p.style.opacity = "";
              p.style.transform = "";
            }
            const op = panelRefs.current[oldPath];
            if (op && op.style.display !== "none") {
              op.style.display = "none";
            }
            animatingRef.current = false;
          }, ENTER_MS + 50);
        });
      });
    }, EXIT_MS);

    return () => {
      clearTimeout(cleanupTimerRef.current);
      if (enterRafRef.current) cancelAnimationFrame(enterRafRef.current);
    };
  }, [activeRouteKey]);

  const activeRoute = useMemo(
    () => toolRoutes.find((route) => routeMatches(route, strippedPath)),
    [strippedPath, toolRoutes]
  );

  if (!activeRoute) {
    // EVM has tools registered → fall back to the default tool. Non-EVM
    // families have no tools in Phase 2, so render a coming-soon shell
    // instead of redirecting (the user explicitly navigated to the family).
    // Hand-typed URLs like /starknet/builder land here because the tool
    // registry is capability-filtered before this lookup.
    if (family === "evm") {
      return <Navigate to={buildFamilyPath("evm", "/database")} replace />;
    }
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {family === "starknet" ? "Starknet" : "Solana"}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-foreground">
          Tools coming soon
        </h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          HexKit is multi-chain ready at the architecture layer, but{" "}
          {family === "starknet" ? "Starknet" : "Solana"} tooling lands in a
          later phase. Keep using the EVM tools in the meantime.
        </p>
      </div>
    );
  }

  const ensureElement = (route: ToolRoute) => {
    const key = cacheKey(route.path);
    if (!elementsRef.current[key]) {
      elementsRef.current[key] = route.render();
    }
    return elementsRef.current[key];
  };

  return (
    <>
      {toolRoutes.map((route) => {
        const key = cacheKey(route.path);
        if (!visitedPaths.has(key) && route.path !== activeRoute.path) {
          return null;
        }

        const element = ensureElement(route);
        const isVisible = key === visiblePath;

        return (
          <div
            key={key}
            ref={(el) => { panelRefs.current[key] = el; }}
            data-panel-route={key}
            style={{
              display: isVisible ? "block" : "none",
              width: "100%",
            }}
          >
            <Suspense fallback={<PageSkeleton />}>
              {element}
            </Suspense>
          </div>
        );
      })}
    </>
  );
};

export default PersistentTools;
