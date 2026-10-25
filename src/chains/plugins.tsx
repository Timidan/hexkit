import type { ReactNode } from "react";
import type { ChainPlugin, ChainTool } from "./plugin";
import { evm } from "./evm";
import { vara } from "./vara";

// Index 0 is the default chain and must have basePath "".
export const CHAIN_PLUGINS: ChainPlugin[] = [evm, vara];
export const DEFAULT_PLUGIN = CHAIN_PLUGINS[0];

export function resolvePath(pathname: string): { plugin: ChainPlugin; rel: string; tool?: ChainTool } {
  const plugin = CHAIN_PLUGINS.find(
    (p) => p.basePath && (pathname === p.basePath || pathname.startsWith(p.basePath + "/")),
  ) ?? DEFAULT_PLUGIN;
  const rel = pathname.slice(plugin.basePath.length) || "/";
  const tool = plugin.tools.find((t) => t.prefix ? rel.startsWith(t.path) : rel === t.path);
  return { plugin, rel, tool };
}

export function firstNavTool(plugin: ChainPlugin): ChainTool {
  return plugin.tools.find((t) => t.nav)!;
}

export function ChainProviders({ children }: { children: ReactNode }) {
  return CHAIN_PLUGINS.reduceRight(
    (acc, p) => p.Provider ? <p.Provider>{acc}</p.Provider> : acc,
    children,
  );
}

/** Tool-specific tabs and result IDs are not shared call context. */
export function contextSearch(plugin: ChainPlugin, search: string): string {
  const current = new URLSearchParams(search), next = new URLSearchParams();
  for (const key of plugin.contextParams ?? []) {
    const value = current.get(key);
    if (value !== null) next.set(key, value);
  }
  return next.toString();
}
