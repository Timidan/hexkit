// Top-level Starknet sim results panel. Mirrors the EVM
// `simulation-results/` shell but adapted for the Starknet wire format
// (validate / execute / fee_transfer invocations + canonical stateDiff +
// per-CallInfo decodedSelector).

import { useMemo, useState, useCallback, useEffect } from "react";
import type { SimulateResponse, SimulationResult, FunctionInvocation } from "@/chains/starknet/simulatorTypes";
import { walkInvocations, contractLabel, shortHex, selectorName } from "./decoders";
import { CallTreeTab } from "./CallTreeTab";
import { TokenFlowTab } from "./TokenFlowTab";
import { EventsTab } from "./EventsTab";
import { StateDiffTab } from "./StateDiffTab";
import { ResourcesTab } from "./ResourcesTab";
import { DevInfoTab } from "./DevInfoTab";

export type TabKey = "trace" | "flow" | "events" | "state" | "resources" | "messages" | "dev" | "raw";

export interface StarknetSimulationResultsProps {
  /** Canonical /simulate response from the bridge. */
  response: SimulateResponse;
  /** Optional override — by default we pick `results[0]`. */
  resultIndex?: number;
  /** Hook for the LLM "Explain this …" affordance. The component renders
   *  the pill; consumers wire it to whatever LLM endpoint they have. */
  onExplainTransaction?: (result: SimulationResult) => void;
  onExplainFrame?: (frame: FunctionInvocation) => void;
  onResimulate?: () => void;
  /** Fixture / tx label rendered in the footer. */
  source?: string;
}

export function StarknetSimulationResults({
  response,
  resultIndex = 0,
  onExplainTransaction,
  onExplainFrame,
  onResimulate,
  source,
}: StarknetSimulationResultsProps) {
  const result = response.results[resultIndex];
  const [tab, setTab] = useState<TabKey>("trace");
  const [selectedFrame, setSelectedFrame] = useState<FunctionInvocation | null>(null);

  // Frame walk-order index — shared between Call tree, Resources heatmap,
  // and the step debugger so "frame #17" means the same thing everywhere.
  const frames = useMemo(() => {
    if (!result) return [];
    return Array.from(walkInvocations(result));
  }, [result]);

  // Auto-select the first event-emitting frame so the right pane has
  // something interesting on first render.
  useEffect(() => {
    if (!result || selectedFrame) return;
    const candidate = frames.find((f) => (f.events || []).length > 0) || result.executeInvocation;
    if (candidate) setSelectedFrame(candidate);
  }, [result, frames, selectedFrame]);

  // URL hash deep-link `#frame=N` — Phalcon-style shareable selection.
  useEffect(() => {
    const m = window.location.hash.match(/frame=(\d+)/);
    if (m) {
      const idx = parseInt(m[1], 10);
      if (frames[idx]) setSelectedFrame(frames[idx]);
    }
  }, [frames]);

  const setSelectedFrameWithHash = useCallback(
    (f: FunctionInvocation | null) => {
      setSelectedFrame(f);
      if (f) {
        const idx = frames.indexOf(f);
        if (idx >= 0) {
          window.history.replaceState(null, "", `#frame=${idx}`);
        }
      }
    },
    [frames],
  );

  // Keyboard shortcuts: b/space prev/next, n step in, o step out, j/k tree nav.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA"].includes(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = selectedFrame ? frames.indexOf(selectedFrame) : 0;
      const wrap = (i: number) => ((i % frames.length) + frames.length) % frames.length;
      if (e.key === "b" || e.key === "ArrowLeft" || e.key === "k") {
        e.preventDefault();
        if (frames[wrap(idx - 1)]) setSelectedFrameWithHash(frames[wrap(idx - 1)]);
      } else if (e.key === " " || e.key === "ArrowRight" || e.key === "j") {
        e.preventDefault();
        if (frames[wrap(idx + 1)]) setSelectedFrameWithHash(frames[wrap(idx + 1)]);
      } else if (e.key === "n") {
        e.preventDefault();
        const me = selectedFrame;
        if (me && me.calls && me.calls.length) {
          const child = me.calls[0];
          if (child) setSelectedFrameWithHash(child);
        }
      } else if (e.key === "o") {
        e.preventDefault();
        const me = selectedFrame;
        if (me) {
          const parent = frames.find((c) => (c.calls || []).includes(me));
          if (parent) setSelectedFrameWithHash(parent);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [frames, selectedFrame, setSelectedFrameWithHash]);

  if (!result) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 text-zinc-400">
        No simulation result at index {resultIndex}.
      </div>
    );
  }

  const sender = (result.executeInvocation || result.validateInvocation)?.contractAddress;
  const ts = new Date(response.blockContext.timestamp * 1000);
  const totalFrames = frames.length;

  return (
    <div className="text-zinc-100">
      {/* ================ Header ================ */}
      <header className="border-b border-zinc-800 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="rounded-sm bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                simulation
              </span>
              <span className="font-mono">{response.simId}</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <StatusPill status={result.status} />
              Starknet Transaction
              <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">INVOKE v3</span>
            </h2>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              {onResimulate && (
                <button
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm hover:bg-zinc-800"
                  onClick={onResimulate}
                >
                  ↻ Re-simulate
                </button>
              )}
              {onExplainTransaction && (
                <button
                  className="rounded-md border border-blue-700 bg-blue-900/40 hover:bg-blue-900/60 px-3 py-1.5 text-sm text-blue-200"
                  onClick={() => onExplainTransaction(result)}
                >
                  ✦ Explain transaction →
                </button>
              )}
            </div>
            <div className="text-xs text-zinc-500">
              <span>block {response.blockContext.blockNumber.toLocaleString()}</span>
              <span className="mx-1">·</span>
              <span>starknet {response.blockContext.starknetVersion}</span>
              <span className="mx-1">·</span>
              <span>{ts.toUTCString()}</span>
            </div>
          </div>
        </div>

        {/* 3-step status timeline */}
        <div className="flex items-center gap-2 text-xs">
          <TimelineStep label="Simulated" active />
          <div className="h-px flex-1 bg-zinc-800" />
          <TimelineStep label="Pinned to parent (L2)" />
          <div className="h-px flex-1 bg-zinc-800" />
          <TimelineStep label="Would settle on L1" muted />
        </div>

        {/* Compact stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <Stat label="Sender" value={sender ? shortHex(sender) : "—"} mono />
          <Stat label="Fee (FRI)" value={result.feeEstimate.overallFee} mono />
          <Stat label="VM steps" value={result.executionResources.steps.toLocaleString()} mono />
          <Stat label="L2 gas" value={result.executionResources.l2Gas.toLocaleString()} mono />
          <Stat label="Frames" value={totalFrames.toLocaleString()} mono />
        </div>
      </header>

      {/* ================ Tabs ================ */}
      <nav className="flex gap-1 border-b border-zinc-800 text-sm overflow-x-auto mt-4">
        <TabBtn k="trace"     cur={tab} set={setTab}>🌳 Call tree</TabBtn>
        <TabBtn k="flow"      cur={tab} set={setTab}>💸 Token flow</TabBtn>
        <TabBtn k="events"    cur={tab} set={setTab}>📡 Events</TabBtn>
        <TabBtn k="state"     cur={tab} set={setTab}>📦 State diff</TabBtn>
        <TabBtn k="resources" cur={tab} set={setTab}>⚙ Resources</TabBtn>
        <TabBtn k="dev"       cur={tab} set={setTab}>🧪 Developer info</TabBtn>
        <TabBtn k="raw"       cur={tab} set={setTab}>{`{ } Raw JSON`}</TabBtn>
      </nav>

      <div className="mt-4">
        {tab === "trace" && (
          <CallTreeTab
            result={result}
            frames={frames}
            selectedFrame={selectedFrame}
            setSelectedFrame={setSelectedFrameWithHash}
            onExplainFrame={onExplainFrame}
          />
        )}
        {tab === "flow" && <TokenFlowTab result={result} />}
        {tab === "events" && <EventsTab result={result} />}
        {tab === "state" && <StateDiffTab result={result} />}
        {tab === "resources" && (
          <ResourcesTab
            result={result}
            frames={frames}
            onJumpToFrame={(f) => {
              setTab("trace");
              setSelectedFrameWithHash(f);
            }}
          />
        )}
        {tab === "dev" && <DevInfoTab response={response} result={result} />}
        {tab === "raw" && <RawTab response={response} />}
      </div>

      {source && (
        <footer className="mt-6 border-t border-zinc-800 pt-3 text-[11px] text-zinc-500">
          Real <span className="font-mono">/simulate</span> response from{" "}
          <span className="font-mono">starknet-sim-bridge</span>
          {source && <> — {source}</>}.
        </footer>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const c =
    status === "SUCCEEDED"
      ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700"
      : "bg-red-900/40 text-red-300 border border-red-700";
  return <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${c}`}>{status}</span>;
}

function TimelineStep({ label, active, muted }: { label: string; active?: boolean; muted?: boolean }) {
  const dot = active ? "bg-emerald-500" : muted ? "bg-zinc-700" : "bg-zinc-600";
  const text = active ? "text-zinc-200" : "text-zinc-500";
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-3 h-3 rounded-full ${dot}`} />
      <span className={text}>{label}</span>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
      <div className="uppercase text-zinc-500 text-[10px]">{label}</div>
      <div className={`mt-0.5 text-zinc-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function TabBtn({
  k,
  cur,
  set,
  children,
}: {
  k: TabKey;
  cur: TabKey;
  set: (k: TabKey) => void;
  children: React.ReactNode;
}) {
  const active = k === cur;
  return (
    <button
      type="button"
      className={`px-3 py-2 border-b-2 ${active ? "border-zinc-100 text-white" : "border-transparent hover:text-white"}`}
      onClick={() => set(k)}
    >
      {children}
    </button>
  );
}

function RawTab({ response }: { response: SimulateResponse }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase text-zinc-500">
          Raw <span className="font-mono text-zinc-200">/simulate</span> response
        </div>
        <button
          className="rounded-sm bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 text-[10px]"
          onClick={() => navigator.clipboard.writeText(JSON.stringify(response, null, 2))}
        >
          copy JSON
        </button>
      </div>
      <pre className="text-xs leading-relaxed overflow-auto max-h-[70vh]">
        {JSON.stringify(response, null, 2)}
      </pre>
    </div>
  );
}

// Re-export the contract-label helper for consumer convenience.
export { contractLabel, selectorName };
