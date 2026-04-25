import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import TxTraceView from "./TxTraceView";
import SyntheticSimView from "./SyntheticSimView";

type TabId = "trace" | "synthetic";

const StarknetSimulationsPage: React.FC = () => {
  const [tab, setTab] = useState<TabId>("trace");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Starknet simulations</h1>
        <p className="text-sm text-muted-foreground">
          Trace landed transactions or simulate speculative ones via the
          <span className="font-mono mx-1">starknet-sim</span>
          bridge.
        </p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="w-full">
          <TabsTrigger value="trace" className="flex-1">
            By transaction hash
          </TabsTrigger>
          <TabsTrigger value="synthetic" className="flex-1">
            Speculative simulate
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trace" className="mt-3">
          <TxTraceView />
        </TabsContent>

        <TabsContent value="synthetic" className="mt-3">
          <SyntheticSimView />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StarknetSimulationsPage;
