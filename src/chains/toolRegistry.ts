// Canonical tool registry — route gates, Navigation, PersistentTools, and
// MobileDrawer all derive from this module so family boundaries stay
// authoritative.
import type { ElementType } from "react";
import {
  Code,
  Database,
  GitDiff,
  Lightning,
  Play,
  Stack,
  Wrench,
} from "@phosphor-icons/react";
import {
  FileTextIcon,
  HashtagIcon,
  SearchIcon,
  ToolIcon,
  ZapIcon,
} from "../components/icons/IconLibrary";
import { DEFAULT_FAMILY_CAPABILITIES, type ChainCapability } from "./capabilities";
import type { ChainFamily } from "./types";

export interface ToolEntry {
  id: string;
  /** Tool path without family prefix (e.g. "/builder"). */
  path: string;
  /** When true, any path starting with `path` matches. */
  prefix?: boolean;
  capability: ChainCapability;
  /** Route-only entries can activate a rendered nav tool. */
  navigationParentId?: string;
}

export type ToolIconComponent = ElementType<{ className?: string }>;

export type ToolSubTabIcon =
  | {
      type: "component";
      component: ElementType<{
        width?: number | string;
        height?: number | string;
        className?: string;
      }>;
    }
  | {
      type: "image";
      src: string;
      alt: string;
      width: number;
      height: number;
      className?: string;
    };

export interface ToolSubTab {
  id: string;
  label: string;
  shortLabel?: string;
  paramKey: string;
  icon?: ToolSubTabIcon;
  /** Additional capability required for this sub-tool, if narrower than parent. */
  capability?: ChainCapability;
  /** Drawer-only visibility override for sub-tabs that desktop still shows. */
  drawerFamilies?: ReadonlyArray<ChainFamily>;
}

export interface ToolNavigationEntry extends ToolEntry {
  label: string;
  shortLabel: string;
  icon: ToolIconComponent;
  subTabs: ReadonlyArray<ToolSubTab> | null;
}

export type ToolNavigationSurface = "navigation" | "mobile-drawer";

export const TOOL_REGISTRY: ReadonlyArray<ToolEntry> = [
  { id: "database", path: "/database", capability: "signature-tools" },
  // `/builder` is gated by the dedicated `tx-builder` capability (EVM-only)
  // so Starknet/SVM, which legitimately have `simulation` for their trace
  // views, don't accidentally surface TransactionBuilderHub — it hard-depends
  // on wagmi's `useAccount` and would crash a non-EVM provider tree.
  { id: "builder", path: "/builder", capability: "tx-builder" },
  { id: "simulations", path: "/simulations", capability: "simulation", navigationParentId: "builder" },
  { id: "explorer", path: "/explorer", prefix: true, capability: "source-lookup" },
  { id: "integrations", path: "/integrations", prefix: true, capability: "earn" },
];

const TOOL_NAVIGATION_METADATA: Partial<
  Record<string, Omit<ToolNavigationEntry, keyof ToolEntry>>
> = {
  database: {
    label: "Signature Database",
    shortLabel: "Signatures",
    icon: Database,
    subTabs: [
      {
        id: "lookup",
        label: "Lookup",
        shortLabel: "Lookup",
        paramKey: "tab",
        icon: { type: "component", component: HashtagIcon },
      },
      {
        id: "search",
        label: "Search",
        shortLabel: "Search",
        paramKey: "tab",
        icon: { type: "component", component: SearchIcon },
      },
      {
        id: "tools",
        label: "Tools",
        shortLabel: "Tools",
        paramKey: "tab",
        icon: { type: "component", component: ToolIcon },
      },
      {
        id: "custom",
        label: "Custom",
        shortLabel: "Custom",
        paramKey: "tab",
        icon: { type: "component", component: FileTextIcon },
      },
      {
        id: "cache",
        label: "Cache",
        shortLabel: "Cache",
        paramKey: "tab",
        icon: { type: "component", component: ZapIcon },
      },
    ],
  },
  builder: {
    label: "Transaction Utils",
    shortLabel: "Tx Utils",
    icon: Wrench,
    subTabs: [
      {
        id: "live",
        label: "Live Interaction",
        shortLabel: "Live",
        paramKey: "mode",
        icon: { type: "component", component: Lightning },
      },
      {
        id: "simulation",
        label: "Simulation",
        shortLabel: "Sim",
        paramKey: "mode",
        icon: { type: "component", component: Play },
      },
    ],
  },
  explorer: {
    label: "Source Tools",
    shortLabel: "Source",
    icon: Code,
    subTabs: [
      {
        id: "explorer",
        label: "Explorer",
        shortLabel: "Explorer",
        paramKey: "tool",
        icon: { type: "component", component: Code },
        drawerFamilies: ["evm"],
      },
      {
        id: "diff",
        label: "Contract Diff",
        shortLabel: "Diff",
        paramKey: "tool",
        icon: { type: "component", component: GitDiff },
        capability: "bytecode-diff",
      },
      {
        id: "storage",
        label: "Storage",
        shortLabel: "Storage",
        paramKey: "tool",
        icon: { type: "component", component: Database },
        capability: "storage-layout",
      },
    ],
  },
  integrations: {
    label: "Integrations",
    shortLabel: "Integrate",
    icon: Stack,
    subTabs: [
      {
        id: "lifi-earn",
        label: "LI.FI Earn",
        shortLabel: "LI.FI",
        paramKey: "route",
        icon: {
          type: "image",
          src: "/logos/lifi.png",
          alt: "",
          width: 14,
          height: 14,
          className: "opacity-80",
        },
      },
    ],
  },
};

export const TOOL_NAVIGATION_ITEMS: ReadonlyArray<ToolNavigationEntry> = TOOL_REGISTRY
  .map((entry) => {
    const metadata = TOOL_NAVIGATION_METADATA[entry.id];
    return metadata ? { ...entry, ...metadata } : null;
  })
  .filter((tool): tool is ToolNavigationEntry => tool !== null);

export function getToolSubTabsForFamily(
  tool: ToolNavigationEntry,
  family: ChainFamily,
  surface: ToolNavigationSurface,
): ReadonlyArray<ToolSubTab> | null {
  if (!tool.subTabs) return null;

  const familyCapabilities = DEFAULT_FAMILY_CAPABILITIES[family];
  const subTabs = tool.subTabs.filter((subTab) => {
    if (subTab.capability && !familyCapabilities.has(subTab.capability)) return false;
    if (
      surface === "mobile-drawer" &&
      subTab.drawerFamilies &&
      !subTab.drawerFamilies.includes(family)
    ) {
      return false;
    }
    return true;
  });

  return subTabs.length > 0 ? subTabs : null;
}

export function getNavigationToolsForFamily(
  family: ChainFamily,
  surface: ToolNavigationSurface,
): ReadonlyArray<ToolNavigationEntry> {
  const familyCapabilities = DEFAULT_FAMILY_CAPABILITIES[family];
  return TOOL_NAVIGATION_ITEMS
    .filter((tool) => isToolAllowed(tool, familyCapabilities))
    .map((tool) => ({
      ...tool,
      subTabs: getToolSubTabsForFamily(tool, family, surface),
    }));
}

export function getActiveNavigationToolId(strippedPath: string): string {
  const routeTool = TOOL_REGISTRY.find((tool) => strippedPath.startsWith(tool.path));
  const toolId = routeTool?.navigationParentId ?? routeTool?.id;
  if (toolId && TOOL_NAVIGATION_ITEMS.some((tool) => tool.id === toolId)) {
    return toolId;
  }
  return TOOL_NAVIGATION_ITEMS[0]?.id ?? "database";
}

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
