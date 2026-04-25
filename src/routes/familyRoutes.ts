import type { ChainFamily } from "../chains/types";

export const FAMILY_PREFIXES: Record<ChainFamily, string> = {
  evm: "/evm",
  starknet: "/starknet",
  svm: "/solana",
};

export const DEFAULT_FAMILY: ChainFamily = "evm";

// Legacy flat paths redirect to /evm/<path>. Keep in sync with TOOL_REGISTRY.
export const LEGACY_EVM_PATHS = [
  "/builder",
  "/database",
  "/explorer",
  "/integrations",
  "/simulations",
] as const;

export function parseFamilyFromPath(pathname: string): ChainFamily | null {
  for (const family of Object.keys(FAMILY_PREFIXES) as ChainFamily[]) {
    const prefix = FAMILY_PREFIXES[family];
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return family;
    }
  }
  return null;
}

export function stripFamilyPrefix(pathname: string): string {
  const family = parseFamilyFromPath(pathname);
  if (!family) return pathname;
  const prefix = FAMILY_PREFIXES[family];
  const rest = pathname.slice(prefix.length);
  return rest.length === 0 ? "/" : rest;
}

export function buildFamilyPath(family: ChainFamily, path: string): string {
  const prefix = FAMILY_PREFIXES[family];
  if (path === "/" || path === "") return prefix;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${prefix}${normalized}`;
}

// Shape matches react-router's `To` so it can be passed to <Navigate to=.
export interface LegacyRedirectTarget {
  pathname: string;
  search: string;
  hash: string;
}

export function resolveLegacyRedirect(
  location: { pathname: string; search: string; hash: string },
): LegacyRedirectTarget | null {
  for (const legacy of LEGACY_EVM_PATHS) {
    if (location.pathname === legacy || location.pathname.startsWith(`${legacy}/`)) {
      return {
        pathname: `${FAMILY_PREFIXES.evm}${location.pathname}`,
        search: location.search,
        hash: location.hash,
      };
    }
  }
  return null;
}
