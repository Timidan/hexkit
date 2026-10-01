import type { ComponentType, LazyExoticComponent, ReactNode } from "react";

export interface ChainSubTab {
  id: string;
  label: string;
  shortLabel?: string;
  /** "route" = path segment under the tool path; anything else = query param name. */
  paramKey: string;
  icon?: ReactNode;
}

export interface ChainTool {
  id: string;
  /** Relative to the plugin's basePath, e.g. "/builder". */
  path: string;
  /** Match any pathname that starts with path. */
  prefix?: boolean;
  /** Present = shown in Navigation and MobileDrawer. Absent = route only (e.g. /simulations). */
  nav?: {
    label: string;
    shortLabel: string;
    icon: ComponentType<{ className?: string }>;
    subTabs?: ChainSubTab[];
  };
  /** A route-only tool highlights the nav tool with this id. */
  navParent?: string;
  /** Adds the app-fullwidth layout class. */
  fullWidth?: boolean;
  /** Desktop Navigation only: overrides default sub-tab detection. Return null to fall through. */
  resolveSubTab?: (relativePath: string, params: URLSearchParams) => string | null;
  Component: LazyExoticComponent<ComponentType>;
}

export interface ChainPlugin {
  id: string;
  name: string;
  /** "" for the default chain (owns the flat routes), "/<id>" for every other chain. */
  basePath: string;
  tools: ChainTool[];
  /** Mounted once around the router, always (keeps wallet state across chain switches). */
  Provider?: ComponentType<{ children: ReactNode }>;
  WalletButton?: ComponentType;
}
