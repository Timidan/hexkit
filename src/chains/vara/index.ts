import React from "react";
import type { ChainPlugin } from "../plugin";
import { VaraWalletButton, VaraWalletProvider } from "./wallet";
import { Mark } from "./Mark";
import { toolGroups } from "./lab/tools";

const Workspace = React.lazy(() => import("./lab/LabTool"));
const LegacyTool = React.lazy(() => import("./lab/LabTool").then((m) => ({ default: m.LegacyTool })));

export const vara: ChainPlugin = {
  id: "vara",
  name: "Vara",
  contextParams: ["program", "origin", "payload", "value", "gas", "block"],
  Mark,
  basePath: "/vara",
  Provider: VaraWalletProvider,
  WalletButton: VaraWalletButton,
  tools: [
    ...toolGroups.map((group) => ({
      id: group.id,
      path: group.path,
      nav: {
        label: group.label, shortLabel: group.shortLabel, icon: group.icon,
        subTabs: group.tools.map((tool) => ({ id: tool.id, label: tool.label, paramKey: "tool" })),
      },
      Component: Workspace,
    })),
    { id: "program", path: "/program", navParent: "transactions", Component: LegacyTool },
    { id: "lab", path: "/lab", navParent: "transactions", Component: LegacyTool },
    { id: "message", path: "/message", navParent: "transactions", Component: LegacyTool },
    { id: "address", path: "/address", navParent: "program-tools", Component: LegacyTool },
  ],
};
