import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import PageSkeleton from "./shared/PageSkeleton";

interface ToolRoute {
  path: string;
  render: () => React.ReactElement;
}

const TransactionBuilderHub = React.lazy(() => import("./TransactionBuilderHub"));
const SignatureDatabase = React.lazy(() => import("./SignatureDatabase"));
const SimulationHistoryPage = React.lazy(() => import("./SimulationHistoryPage"));
const SourceTools = React.lazy(() => import("./explorer/SourceTools"));

const TOOL_ROUTES: ToolRoute[] = [
  { path: "/database", render: () => <SignatureDatabase /> },
  { path: "/builder", render: () => <TransactionBuilderHub /> },
  { path: "/simulations", render: () => <SimulationHistoryPage /> },
  { path: "/explorer", render: () => <SourceTools /> },
];

// Inactive route cleanup timeout (10 minutes)
const INACTIVE_ROUTE_TIMEOUT_MS = 10 * 60 * 1000;
// Cleanup check interval (1 minute)
const CLEANUP_INTERVAL_MS = 60 * 1000;

// Transition timing (ms)
const EXIT_MS = 150;
const ENTER_MS = 300;
const ENTER_EASE = "cubic-bezier(0.25,0.46,0.45,0.94)";

const PersistentTools: React.FC = () => {
  const location = useLocation();
  const elementsRef = useRef<Record<string, React.ReactElement>>({});
  const lastVisitRef = useRef<Record<string, number>>({});
  // DOM refs for each panel wrapper, keyed by route path
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [visitedPaths, setVisitedPaths] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (TOOL_ROUTES.some((route) => route.path === location.pathname)) {
      initial.add(location.pathname);
      lastVisitRef.current[location.pathname] = Date.now();
    }
    return initial;
  });

  // The path whose panel is currently visible (drives display:block/none)
  const [visiblePath, setVisiblePath] = useState(location.pathname);
  // Track if we're mid-animation to prevent React from overriding DOM styles
  const animatingRef = useRef(false);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enterRafRef = useRef<number | undefined>(undefined);

  // Cleanup function to remove inactive routes
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

  // Track visited paths and update timestamps
  useEffect(() => {
    if (TOOL_ROUTES.some((route) => route.path === location.pathname)) {
      lastVisitRef.current[location.pathname] = Date.now();

      setVisitedPaths((prev) => {
        if (prev.has(location.pathname)) return prev;
        const next = new Set(prev);
        next.add(location.pathname);
        return next;
      });
    }
  }, [location.pathname]);

  // Orchestrate exit → enter transition via direct DOM manipulation
  useEffect(() => {
    const targetPath = location.pathname;
    if (targetPath === visiblePath && !animatingRef.current) return;
    if (targetPath === visiblePath) return;

    // Abort any in-flight animation
    clearTimeout(cleanupTimerRef.current);
    if (enterRafRef.current) cancelAnimationFrame(enterRafRef.current);

    const oldPanel = panelRefs.current[visiblePath];
    const oldPath = visiblePath;

    animatingRef.current = true;

    // --- EXIT: animate old panel out via DOM ---
    if (oldPanel) {
      // The old panel is already painted with display:block, opacity:1.
      // Apply transition + target values directly — the browser will animate from the painted state.
      oldPanel.style.transition = `opacity ${EXIT_MS}ms ease-in, transform ${EXIT_MS}ms ease-in`;
      oldPanel.style.opacity = "0";
      oldPanel.style.transform = "scale(0.95)";
      oldPanel.style.pointerEvents = "none";
    }

    // After exit duration, swap panels
    cleanupTimerRef.current = setTimeout(() => {
      // Hide old panel, reset its styles
      if (oldPanel) {
        oldPanel.style.transition = "none";
        oldPanel.style.opacity = "";
        oldPanel.style.transform = "";
        oldPanel.style.pointerEvents = "";
        oldPanel.style.display = "none";
      }

      // Show new panel at enter-start position
      const newPanel = panelRefs.current[targetPath];
      if (newPanel) {
        newPanel.style.transition = "none";
        newPanel.style.display = "block";
        newPanel.style.opacity = "0";
        newPanel.style.transform = "scale(0.97) translateY(12px)";
      }

      // Update React state to match — wrapped in rAF to avoid batching issues
      setVisiblePath(targetPath);

      // After browser paints the enter-start frame, kick the enter transition
      enterRafRef.current = requestAnimationFrame(() => {
        enterRafRef.current = requestAnimationFrame(() => {
          const panel = panelRefs.current[targetPath];
          if (panel) {
            panel.style.transition = `opacity ${ENTER_MS}ms ${ENTER_EASE}, transform ${ENTER_MS}ms ${ENTER_EASE}`;
            panel.style.opacity = "1";
            panel.style.transform = "scale(1) translateY(0)";
          }

          // After enter completes, clean up inline styles so React can manage
          cleanupTimerRef.current = setTimeout(() => {
            const p = panelRefs.current[targetPath];
            if (p) {
              p.style.transition = "";
              p.style.opacity = "";
              p.style.transform = "";
            }
            // Also ensure old panel is cleaned
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
  }, [location.pathname]);

  const activeRoute = useMemo(
    () => TOOL_ROUTES.find((route) => route.path === location.pathname),
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
