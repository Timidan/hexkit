import React from "react";
import { AddressBook, Cube, Envelope } from "@phosphor-icons/react";
import type { ChainPlugin } from "../plugin";
import { VaraWalletButton, VaraWalletProvider } from "./wallet";
import { Mark } from "./Mark";

export const vara: ChainPlugin = {
  id: "vara",
  name: "Vara",
  Mark,
  basePath: "/vara",
  Provider: VaraWalletProvider,
  WalletButton: VaraWalletButton,
  tools: [
    {
      id: "program",
      path: "/program",
      nav: { label: "Program", shortLabel: "Program", icon: Cube },
      Component: React.lazy(() => import("./ProgramTool")),
    },
    {
      id: "message",
      path: "/message",
      nav: { label: "Message Case", shortLabel: "Case", icon: Envelope },
      Component: React.lazy(() => import("./MessageTool")),
    },
    {
      id: "address",
      path: "/address",
      nav: { label: "Address", shortLabel: "Address", icon: AddressBook },
      Component: React.lazy(() => import("./AddressTool")),
    },
  ],
};
