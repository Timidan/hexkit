import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import TxTraceView from "./TxTraceView";
import SyntheticSimView from "./SyntheticSimView";
import EstimateFeeView from "./EstimateFeeView";
import StarknetBridgeBanner from "./StarknetBridgeBanner";
import RecentSimulationsSidebar from "./RecentSimulationsSidebar";
import { extractTxHash } from "./txHashParse";
import {
  clearRecents,
  loadRecents,
  pushRecent,
  type RecentItem,
} from "./recentSimulations";
import type { InvokeFormState } from "./invokeRequestBuilder";

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

  const [recents, setRecents] = useState<RecentItem[]>(() => loadRecents());
  // When the user clicks a "synthetic" entry in the sidebar we hand the
  // form snapshot to SyntheticSimView via this prop. A monotonically
  // bumped key forces the child to re-mount so it picks up the form
  // even when the user re-selects the same entry.
  const [restoredForm, setRestoredForm] = useState<InvokeFormState | null>(null);
  const [restoreNonce, setRestoreNonce] = useState(0);

  const onTabChange = useCallback(
    (next: string) => {
      const id = parseTabParam(next);
      const np = new URLSearchParams(location.search);
      np.set("tab", id);
      navigate(
        `${location.pathname}?${np.toString()}${location.hash}`,
        { replace: true },
      );
    },
    [location.pathname, location.search, location.hash, navigate],
  );

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

  const recordTrace = useCallback((txHash: string) => {
    const next = pushRecent({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "trace",
      txHash,
      ts: Date.now(),
    });
    setRecents(next);
  }, []);

  const recordSynthetic = useCallback((form: InvokeFormState) => {
    const next = pushRecent({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "synthetic",
      form,
      ts: Date.now(),
    });
    setRecents(next);
  }, []);

  const onSelectRecent = useCallback(
    (item: RecentItem) => {
      if (item.kind === "trace") {
        const np = new URLSearchParams(location.search);
        np.set("tab", "trace");
        np.set("txHash", item.txHash);
        navigate(
          `${location.pathname}?${np.toString()}${location.hash}`,
          { replace: true },
        );
        return;
      }
      // Synthetic: switch tab + push the form snapshot down. Drop any
      // lingering ?txHash= so the shared URL reflects the active tab.
      setRestoredForm(item.form);
      setRestoreNonce((n) => n + 1);
      const np = new URLSearchParams(location.search);
      np.set("tab", "synthetic");
      np.delete("txHash");
      navigate(
        `${location.pathname}?${np.toString()}${location.hash}`,
        { replace: true },
      );
    },
    [location.pathname, location.search, location.hash, navigate],
  );

  const onClearRecents = useCallback(() => {
    setRecents(clearRecents());
  }, []);

  // Iter 14 hand-off: EstimateFeeView builds an InvokeFormState with
  // the just-estimated resource bounds applied; we flip to Speculative
  // and re-mount SyntheticSimView with that form, mirroring the recent-
  // restore path so the user can inspect or hit Simulate without having
  // to copy fields between tabs.
  const onUseEstimatedBounds = useCallback(
    (form: InvokeFormState) => {
      setRestoredForm(form);
      setRestoreNonce((n) => n + 1);
      const np = new URLSearchParams(location.search);
      np.set("tab", "synthetic");
      np.delete("txHash");
      navigate(
        `${location.pathname}?${np.toString()}${location.hash}`,
        { replace: true },
      );
    },
    [location.pathname, location.search, location.hash, navigate],
  );

  // Cross-tab sync — if another tab updates recents, pick it up here too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "hexkit:starknet-sim:recents:v1") setRecents(loadRecents());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Sidebar visibility — collapsed by default to keep the main column
  // breathable, persisted so frequent users get their preferred layout
  // back on reload.
  const [showSidebar, setShowSidebar] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("hexkit:starknet-sim:showSidebar") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "hexkit:starknet-sim:showSidebar",
        showSidebar ? "1" : "0",
      );
    } catch {
      // Storage disabled — preference just won't persist this session.
    }
  }, [showSidebar]);

  return (
    <div className="w-full px-[clamp(1rem,3vw,2.5rem)] py-6 space-y-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">Starknet simulations</h1>
          <p className="text-sm text-muted-foreground">
            Trace landed transactions, simulate speculative ones, or estimate fees via the
            <span className="font-mono mx-1">starknet-sim</span>
            bridge.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSidebar((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1"
          data-testid="toggle-recents"
        >
          {showSidebar ? "Hide recents" : "Show recents"}
          {recents.length > 0 ? ` (${recents.length})` : ""}
        </button>
      </header>

      <StarknetBridgeBanner />

      <div className="relative">
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={onTabChange}>
            {/* Wrapper allows horizontal scroll on narrow viewports.
                On sm+ the triggers grow to fill the row (flex-1); below
                that they fall back to content-width with shrink-0 so
                long labels stay readable instead of getting squashed. */}
            <div className="-mx-2 px-2 overflow-x-auto sm:mx-0 sm:px-0">
              <TabsList className="w-full min-w-max sm:min-w-0">
                <TabsTrigger
                  value="trace"
                  className="shrink-0 sm:flex-1 whitespace-nowrap"
                >
                  By transaction hash
                </TabsTrigger>
                <TabsTrigger
                  value="synthetic"
                  className="shrink-0 sm:flex-1 whitespace-nowrap"
                >
                  Speculative simulate
                </TabsTrigger>
                <TabsTrigger
                  value="estimate"
                  className="shrink-0 sm:flex-1 whitespace-nowrap"
                >
                  Estimate fee
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="trace" className="mt-3">
              <TxTraceView
                initialTxHash={initialTxHash}
                onTxHashCommit={onTxHashCommit}
                onTraceSucceeded={recordTrace}
              />
            </TabsContent>

            <TabsContent value="synthetic" className="mt-3">
              <SyntheticSimView
                key={restoreNonce}
                initialForm={restoredForm}
                onSimSucceeded={recordSynthetic}
              />
            </TabsContent>

            <TabsContent value="estimate" className="mt-3">
              <EstimateFeeView onUseEstimatedBounds={onUseEstimatedBounds} />
            </TabsContent>
          </Tabs>
        </div>

        {showSidebar && (
          <aside
            className="fixed top-4 right-4 z-30 w-[260px] max-h-[calc(100vh-2rem)] overflow-auto shadow-lg"
            data-testid="recents-drawer"
          >
            <RecentSimulationsSidebar
              items={recents}
              onSelect={onSelectRecent}
              onClear={onClearRecents}
            />
          </aside>
        )}
      </div>
    </div>
  );
};

export default StarknetSimulationsPage;
