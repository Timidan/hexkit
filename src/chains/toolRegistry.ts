// Canonical tool registry — Navigation, PersistentTools, and MobileDrawer
// all filter this list by capability before matching routes, which is what
// keeps the family boundary authoritative.
import type { ChainCapability } from "./capabilities";

export interface ToolEntry {
  id: string;
  /** Tool path without family prefix (e.g. "/builder"). */
  path: string;
  /** When true, any path starting with `path` matches. */
  prefix?: boolean;
  capability: ChainCapability;
}

export const TOOL_REGISTRY: ReadonlyArray<ToolEntry> = [
  { id: "database", path: "/database", capability: "signature-tools" },
  { id: "builder", path: "/builder", capability: "simulation" },
  { id: "simulations", path: "/simulations", capability: "simulation" },
  { id: "explorer", path: "/explorer", capability: "source-lookup" },
  { id: "integrations", path: "/integrations", prefix: true, capability: "earn" },
];

export function findToolForPath(strippedPath: string): ToolEntry | undefined {
  return TOOL_REGISTRY.find((tool) =>
    tool.prefix ? strippedPath.startsWith(tool.path) : tool.path === strippedPath,
  );
}

export function isToolAllowed(
  tool: ToolEntry,
  capabilities: ReadonlySet<ChainCapability>,
): boolean {
  return capabilities.has(tool.capability);
}
