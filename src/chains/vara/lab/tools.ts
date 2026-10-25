import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { Cube, Flask, Stack, type Icon } from "@phosphor-icons/react";

/** `hidden` tools have no tab; search and links still open them in their group's workspace. */
type Tool = { id: string; label: string; Component: LazyExoticComponent<ComponentType>; hidden?: boolean };

/** Retired tool ids and where their links now open: Gas & Vouchers became the gas view of Message Simulation. */
export const TOOL_ALIASES: Record<string, { tool: string; view: string }> = { resources: { tool: "simulator", view: "gas" } };

/** The same groups drive desktop navigation, the mobile drawer, and tool panels. */
export const toolGroups: { id: string; path: string; label: string; shortLabel: string; icon: Icon; tools: Tool[] }[] = [
  {
    id: "transactions", path: "/transactions", label: "Programs & messages", shortLabel: "Programs", icon: Flask,
    tools: [
      { id: "program", label: "Program Interaction", Component: lazy(() => import("../ProgramTool")) },
      { id: "simulator", label: "Message Simulation", Component: lazy(() => import("./SimulatorTool")) },
      { id: "scenarios", label: "Scenario Tests", Component: lazy(() => import("./ScenarioTool")) },
      { id: "message", label: "Message Inspector", Component: lazy(() => import("../MessageTool")) },
    ],
  },
  {
    id: "program-tools", path: "/program-tools", label: "Utilities", shortLabel: "Utilities", icon: Cube,
    tools: [
      { id: "interfaces", label: "IDL Comparison", Component: lazy(() => import("./InterfaceTool")) },
      { id: "events", label: "Event Explorer", Component: lazy(() => import("./EventTool")) },
      // Search converts any pasted address, so this is a destination, not a tab.
      { id: "address", label: "Address Converter", hidden: true, Component: lazy(() => import("../AddressTool")) },
    ],
  },
  {
    id: "integrations", path: "/integrations", label: "Vara.eth", shortLabel: "Vara.eth", icon: Stack,
    tools: [
      { id: "settlement", label: "Settlement", Component: lazy(() => import("./SettlementTool")) },
    ],
  },
];
