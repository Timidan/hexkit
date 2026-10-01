import React from "react";
import { AddressBook, Envelope } from "@phosphor-icons/react";
import type { ChainPlugin } from "../plugin";
import { VaraWalletButton, VaraWalletProvider } from "./wallet";

export const vara: ChainPlugin = {
  id: "vara",
  name: "Vara",
  basePath: "/vara",
  Provider: VaraWalletProvider,
  WalletButton: VaraWalletButton,
  tools: [
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
