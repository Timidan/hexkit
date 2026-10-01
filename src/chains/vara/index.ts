import React from "react";
import { AddressBook } from "@phosphor-icons/react";
import type { ChainPlugin } from "../plugin";

export const vara: ChainPlugin = {
  id: "vara",
  name: "Vara",
  basePath: "/vara",
  tools: [
    {
      id: "address",
      path: "/address",
      nav: { label: "Address", shortLabel: "Address", icon: AddressBook },
      Component: React.lazy(() => import("./AddressTool")),
    },
  ],
};
