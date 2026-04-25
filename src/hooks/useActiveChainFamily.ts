import { useLocation } from "react-router-dom";
import { useMemo } from "react";
import type { ChainFamily } from "../chains/types";
import { DEFAULT_FAMILY, parseFamilyFromPath } from "../routes/familyRoutes";

// Falls back to DEFAULT_FAMILY for `/`, `/simulation/:id`, and legacy
// flat paths that the redirect hasn't replaced yet.
export function useActiveChainFamily(): ChainFamily {
  const { pathname } = useLocation();
  return useMemo(() => parseFamilyFromPath(pathname) ?? DEFAULT_FAMILY, [pathname]);
}
