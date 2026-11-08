import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Minimum time the route loader stays visible so page content never flashes first. */
export const MIN_ROUTE_LOADER_MS = 300;

/** Slightly shorter floor for sub-tab switches within an already-loaded tool. */
export const MIN_SUBTAB_LOADER_MS = 200;

/**
 * Returns `true` while a route change is being covered by the page loader.
 *
 * The flag starts as `true` on mount so entering a tool from Home, a
 * simulation, or a direct URL also shows the loader before the page.
 * It flips to `true` during the render pass that follows a route change
 * (`useLayoutEffect`), which guarantees the loader is painted in the same
 * frame as the new route — page content cannot appear first.
 *
 * Pass `null` to disable the gate (used at the app shell while a tool route
 * is active, where `PersistentTools` owns the loader).
 */
export function useRouteLoading(routeKey: string | null, minimumMs = MIN_ROUTE_LOADER_MS): boolean {
  const isEnabled = routeKey !== null;
  const normalizedRouteKey = routeKey ?? null;
  const [isLoading, setIsLoading] = useState(isEnabled);
  const activeKeyRef = useRef<string | null>(normalizedRouteKey);
  const startedAtRef = useRef(
    typeof performance !== "undefined" ? performance.now() : Date.now(),
  );

  useLayoutEffect(() => {
    if (!isEnabled) {
      activeKeyRef.current = null;
      setIsLoading(false);
      return;
    }
    if (activeKeyRef.current === normalizedRouteKey) return;
    activeKeyRef.current = normalizedRouteKey;
    startedAtRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    setIsLoading(true);
  }, [normalizedRouteKey, isEnabled]);

  useEffect(() => {
    if (!isEnabled || !isLoading) return;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const remaining = Math.max(minimumMs - (now - startedAtRef.current), 0);
    const timer = window.setTimeout(() => setIsLoading(false), remaining);

    return () => window.clearTimeout(timer);
  }, [isEnabled, isLoading, minimumMs, normalizedRouteKey]);

  return isEnabled && isLoading;
}
