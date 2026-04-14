import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import PageSkeleton from "./shared/PageSkeleton";

interface ToolRoute {
  path: string;
  render: () => React.ReactElement;
  /** When true, match any pathname starting with `path` */
  prefix?: boolean;
}

const TransactionBuilderHub = React.lazy(() => import("./TransactionBuilderHub"));
const SignatureDatabase = React.lazy(() => import("./SignatureDatabase"));
const SimulationHistoryPage = React.lazy(() => import("./SimulationHistoryPage"));
const SourceTools = React.lazy(() => import("./explorer/SourceTools"));
const IntegrationsHub = React.lazy(() => import("./integrations/IntegrationsHub"));

const TOOL_ROUTES: ToolRoute[] = [
  { path: "/database", render: () => <SignatureDatabase /> },
  { path: "/builder", render: () => <TransactionBuilderHub /> },
  { path: "/simulations", render: () => <SimulationHistoryPage /> },
  { path: "/explorer", render: () => <SourceTools /> },
  { path: "/integrations", render: () => <IntegrationsHub />, prefix: true },
];

function routeMatches(route: ToolRoute, pathname: string): boolean {
  return route.prefix ? pathname.startsWith(route.path) : route.path === pathname;
}

const INACTIVE_ROUTE_TIMEOUT_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

const EXIT_MS = 150;
const ENTER_MS = 300;
const ENTER_EASE = "cubic-bezier(0.25,0.46,0.45,0.94)";

const PersistentTools: React.FC = () => {
  const location = useLocation();
  const elementsRef = useRef<Record<string, React.ReactElement>>({});
  const lastVisitRef = useRef<Record<string, number>>({});
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [visitedPaths, setVisitedPaths] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    const matched = TOOL_ROUTES.find((route) => routeMatches(route, location.pathname));
    if (matched) {
      initial.add(matched.path);
      lastVisitRef.current[matched.path] = Date.now();
    }
    return initial;
  });

  const [visiblePath, setVisiblePath] = useState(location.pathname);
  const animatingRef = useRef(false);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enterRafRef = useRef<number | undefined>(undefined);

  const cleanupInactiveRoutes = useCallback(() => {
    const now = Date.now();
    const currentPath = location.pathname;

    setVisitedPaths((prev) => {
      const pathsToRemove: string[] = [];

      prev.forEach((path) => {
        if (path === currentPath) {
          lastVisitRef.current[path] = now;
          return;
        }

        const lastVisit = lastVisitRef.current[path] || 0;
        if (now - lastVisit > INACTIVE_ROUTE_TIMEOUT_MS) {
          pathsToRemove.push(path);
        }
      });

      if (pathsToRemove.length === 0) return prev;

      pathsToRemove.forEach((path) => {
        delete elementsRef.current[path];
        delete lastVisitRef.current[path];
      });

      const next = new Set(prev);
      pathsToRemove.forEach((path) => next.delete(path));
      return next;
    });
  }, [location.pathname]);

  useEffect(() => {
    const intervalId = setInterval(cleanupInactiveRoutes, CLEANUP_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [cleanupInactiveRoutes]);

  useEffect(() => {
    const matched = TOOL_ROUTES.find((route) => routeMatches(route, location.pathname));
    if (matched) {
      lastVisitRef.current[matched.path] = Date.now();

      setVisitedPaths((prev) => {
        if (prev.has(matched.path)) return prev;
        const next = new Set(prev);
        next.add(matched.path);
        return next;
      });
    }
  }, [location.pathname]);

  // Resolve the route key for the current pathname so sub-route changes within
  // a prefix route (e.g. /integrations/lifi-earn → /integrations/other) don't
  // trigger a full panel transition — only top-level tool switches do.
  const activeRouteKey = useMemo(() => {
    const r = TOOL_ROUTES.find((route) => routeMatches(route, location.pathname));
    return r?.path ?? location.pathname;
  }, [location.pathname]);

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
    () => TOOL_ROUTES.find((route) => routeMatches(route, location.pathname)),
    [location.pathname]
  );

  if (!activeRoute) {
    return <Navigate to="/database" replace />;
  }

  const ensureElement = (route: ToolRoute) => {
    if (!elementsRef.current[route.path]) {
      elementsRef.current[route.path] = route.render();
    }
    return elementsRef.current[route.path];
  };

  return (
    <>
      {TOOL_ROUTES.map((route) => {
        if (!visitedPaths.has(route.path) && route.path !== activeRoute.path) {
          return null;
        }

        const element = ensureElement(route);
        const isVisible = route.path === visiblePath;

        return (
          <div
            key={route.path}
            ref={(el) => { panelRefs.current[route.path] = el; }}
            data-panel-route={route.path}
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
