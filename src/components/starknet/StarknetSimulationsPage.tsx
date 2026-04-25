import React, { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import TxTraceView from "./TxTraceView";
import SyntheticSimView from "./SyntheticSimView";
import EstimateFeeView from "./EstimateFeeView";
import StarknetBridgeBanner from "./StarknetBridgeBanner";
import { extractTxHash } from "./txHashParse";

type TabId = "trace" | "synthetic" | "estimate";
const VALID_TABS: TabId[] = ["trace", "synthetic", "estimate"];

function parseTabParam(value: string | null | undefined): TabId {
  return VALID_TABS.includes(value as TabId) ? (value as TabId) : "trace";
}
function parseTxHashParam(value: string | null | undefined): string | null {
  return extractTxHash(value);
}

const StarknetSimulationsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const tab = useMemo(() => parseTabParam(params.get("tab")), [params]);
  const initialTxHash = useMemo(() => parseTxHashParam(params.get("txHash")), [params]);

  const onTabChange = useCallback(
    (next: string) => {
      const id = parseTabParam(next);
      const np = new URLSearchParams(location.search);
      np.set("tab", id);
      // Preserve the #frame=N deep-link so jumping between tabs and back
      // to Call tree restores the previously selected frame.
      navigate(
        `${location.pathname}?${np.toString()}${location.hash}`,
        { replace: true },
      );
    },
    [location.pathname, location.search, location.hash, navigate],
  );

  // TxTraceView calls back with the tx hash that was just traced (or
  // null when the input cleared) so the URL stays canonical and shareable.
  const onTxHashCommit = useCallback(
    (next: string | null) => {
      const np = new URLSearchParams(location.search);
      np.set("tab", "trace");
      if (next) np.set("txHash", next);
      else np.delete("txHash");
      navigate(
        `${location.pathname}?${np.toString()}${location.hash}`,
        { replace: true },
      );
    },
    [location.pathname, location.search, location.hash, navigate],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Starknet simulations</h1>
        <p className="text-sm text-muted-foreground">
          Trace landed transactions, simulate speculative ones, or estimate fees via the
          <span className="font-mono mx-1">starknet-sim</span>
          bridge.
        </p>
      </header>

      <StarknetBridgeBanner />

      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList className="w-full">
          <TabsTrigger value="trace" className="flex-1">
            By transaction hash
          </TabsTrigger>
          <TabsTrigger value="synthetic" className="flex-1">
            Speculative simulate
          </TabsTrigger>
          <TabsTrigger value="estimate" className="flex-1">
            Estimate fee
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trace" className="mt-3">
          <TxTraceView initialTxHash={initialTxHash} onTxHashCommit={onTxHashCommit} />
        </TabsContent>

        <TabsContent value="synthetic" className="mt-3">
          <SyntheticSimView />
        </TabsContent>

        <TabsContent value="estimate" className="mt-3">
          <EstimateFeeView />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StarknetSimulationsPage;
