import { lazy } from "react";
import { Cube, Flask, Stack } from "@phosphor-icons/react";

/** The same groups drive desktop navigation, the mobile drawer, and tool panels. */
export const toolGroups = [
  {
    id: "transactions", path: "/transactions", label: "Programs & messages", shortLabel: "Programs", icon: Flask,
    tools: [
      { id: "program", label: "Program Interaction", Component: lazy(() => import("../ProgramTool")) },
      { id: "simulator", label: "Message Simulation", Component: lazy(() => import("./SimulatorTool")) },
      { id: "scenarios", label: "Scenario Tests", Component: lazy(() => import("./ScenarioTool")) },
      { id: "resources", label: "Gas & Vouchers", Component: lazy(() => import("./ResourceTool")) },
      { id: "message", label: "Message Inspector", Component: lazy(() => import("../MessageTool")) },
    ],
  },
  {
    id: "program-tools", path: "/program-tools", label: "Utilities", shortLabel: "Utilities", icon: Cube,
    tools: [
      { id: "interfaces", label: "IDL Comparison", Component: lazy(() => import("./InterfaceTool")) },
      { id: "events", label: "Event Explorer", Component: lazy(() => import("./EventTool")) },
      { id: "address", label: "Address Converter", Component: lazy(() => import("../AddressTool")) },
    ],
  },
  {
    id: "integrations", path: "/integrations", label: "Vara.eth", shortLabel: "Vara.eth", icon: Stack,
    tools: [
      { id: "settlement", label: "Vara.eth Settlement", Component: lazy(() => import("./SettlementTool")) },
    ],
  },
];
