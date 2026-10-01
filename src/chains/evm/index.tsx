import React from "react";
import { Lightning, Play, Code, GitDiff, Database, Wrench, Stack } from "@phosphor-icons/react";
import {
  SearchIcon,
  HashtagIcon,
  ToolIcon,
  FileTextIcon,
  ZapIcon,
} from "../../components/icons/IconLibrary";
import RainbowKitWallet from "../../components/RainbowKitWallet";
import type { ChainPlugin } from "../plugin";
import { Provider } from "./Provider";

const TransactionBuilderHub = React.lazy(() => import("../../components/TransactionBuilderHub"));
const SignatureDatabase = React.lazy(() => import("../../components/SignatureDatabase"));
const SimulationHistoryPage = React.lazy(() => import("../../components/SimulationHistoryPage"));
const SourceTools = React.lazy(() => import("../../components/explorer/SourceTools"));
const IntegrationsHub = React.lazy(() => import("../../components/integrations/IntegrationsHub"));

export const evm: ChainPlugin = {
  id: "evm",
  name: "EVM",
  basePath: "",
  Provider,
  WalletButton: RainbowKitWallet,
  tools: [
    {
      id: "database",
      path: "/database",
      nav: {
        label: "Signature Database",
        shortLabel: "Signatures",
        icon: Database,
        subTabs: [
          { id: "lookup", label: "Lookup", shortLabel: "Lookup", paramKey: "tab", icon: <HashtagIcon width={12} height={12} /> },
          { id: "search", label: "Search", shortLabel: "Search", paramKey: "tab", icon: <SearchIcon width={12} height={12} /> },
          { id: "tools", label: "Tools", shortLabel: "Tools", paramKey: "tab", icon: <ToolIcon width={12} height={12} /> },
          { id: "custom", label: "Custom", shortLabel: "Custom", paramKey: "tab", icon: <FileTextIcon width={12} height={12} /> },
          { id: "cache", label: "Cache", shortLabel: "Cache", paramKey: "tab", icon: <ZapIcon width={12} height={12} /> },
        ],
      },
      Component: SignatureDatabase,
    },
    {
      id: "builder",
      path: "/builder",
      fullWidth: true,
      nav: {
        label: "Transaction Utils",
        shortLabel: "Tx Utils",
        icon: Wrench,
        subTabs: [
          { id: "live", label: "Live Interaction", shortLabel: "Live", paramKey: "mode", icon: <Lightning width={12} height={12} /> },
          { id: "simulation", label: "Simulation (EDB)", shortLabel: "Sim", paramKey: "mode", icon: <Play width={12} height={12} /> },
        ],
      },
      resolveSubTab: (rel, params) =>
        rel.startsWith("/simulations") || params.get("mode") === "replay" || params.get("replay") === "txhash"
          ? "simulation"
          : null,
      Component: TransactionBuilderHub,
    },
    {
      id: "simulations",
      path: "/simulations",
      navParent: "builder",
      Component: SimulationHistoryPage,
    },
    {
      id: "explorer",
      path: "/explorer",
      fullWidth: true,
      nav: {
        label: "Source Tools",
        shortLabel: "Source",
        icon: Code,
        subTabs: [
          { id: "explorer", label: "Explorer", shortLabel: "Explorer", paramKey: "tool", icon: <Code width={12} height={12} /> },
          { id: "diff", label: "Contract Diff", shortLabel: "Diff", paramKey: "tool", icon: <GitDiff width={12} height={12} /> },
          { id: "storage", label: "Storage", shortLabel: "Storage", paramKey: "tool", icon: <Database width={12} height={12} /> },
        ],
      },
      Component: SourceTools,
    },
    {
      id: "integrations",
      path: "/integrations",
      prefix: true,
      fullWidth: true,
      nav: {
        label: "Integrations",
        shortLabel: "Integrate",
        icon: Stack,
        subTabs: [
          { id: "lifi-earn", label: "LI.FI Earn", shortLabel: "LI.FI", paramKey: "route", icon: <img src="/logos/lifi.png" alt="" width={14} height={14} className="opacity-80" /> },
        ],
      },
      Component: IntegrationsHub,
    },
  ],
};
