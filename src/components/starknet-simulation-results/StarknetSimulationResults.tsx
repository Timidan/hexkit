// Top-level Starknet sim results panel. Mirrors the EVM
// `simulation-results/` shell but adapted for the Starknet wire format
// (validate / execute / fee_transfer invocations + canonical stateDiff +
// per-CallInfo decodedSelector). Uses HexKit's shadcn-derived primitives
// + CSS vars so it themes correctly in both light and dark modes.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowsClockwise,
  Sparkle,
  TreeStructure,
  CurrencyCircleDollar,
  RadioButton,
  Stack,
  GearSix,
  Wrench,
  Code,
  PaperPlaneRight,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyButton } from "@/components/ui/copy-button";
import type {
  FunctionInvocation,
  SimulateResponse,
  SimulationResult,
} from "@/chains/starknet/simulatorTypes";
import { CallTreeTab } from "./CallTreeTab";
import { TokenFlowTab } from "./TokenFlowTab";
import { EventsTab } from "./EventsTab";
import { StateDiffTab } from "./StateDiffTab";
import { ResourcesTab } from "./ResourcesTab";
import { MessagesTab } from "./MessagesTab";
import { DevInfoTab } from "./DevInfoTab";
import { contractLabel, selectorName, shortHex, walkInvocations } from "./decoders";

export type TabKey =
  | "trace"
  | "flow"
  | "events"
  | "state"
  | "resources"
  | "messages"
  | "dev"
  | "raw";

export interface StarknetSimulationResultsProps {
  /** Canonical /simulate response from the bridge. */
  response: SimulateResponse;
  /** Optional override — by default we pick `results[0]`. */
  resultIndex?: number;
  /** Hook for the LLM "Explain this …" affordance. */
  onExplainTransaction?: (result: SimulationResult) => void;
  onExplainFrame?: (frame: FunctionInvocation) => void;
  /** Async hook so the button can show a spinner. Treat omission as "no
   *  re-simulate available" and hide the button. */
  onResimulate?: () => void | Promise<void>;
  isResimulating?: boolean;
  /** Fixture / tx label rendered in the footer. */
  source?: string;
  /** Optional tx hash to display in the header. Shown above the title with
   *  a copy button. The /trace flow knows the hash; /simulate flows that
   *  haven't landed do not. */
  txHash?: string;
}

export function StarknetSimulationResults({
  response,
  resultIndex = 0,
  onExplainTransaction,
  onExplainFrame,
  onResimulate,
  isResimulating,
  source,
  txHash,
}: StarknetSimulationResultsProps) {
  const result = response.results?.[resultIndex];
  const [tab, setTab] = useState<TabKey>("trace");
  const [selectedFrame, setSelectedFrame] = useState<FunctionInvocation | null>(null);

  // Frame walk-order index — shared between Call tree, Resources heatmap,
  // and the step debugger so "frame #17" means the same thing everywhere.
  const frames = useMemo(
    () => (result ? Array.from(walkInvocations(result)) : []),
    [result],
  );

  // Auto-select the first event-emitting frame so the right pane has
  // something interesting on first render.
  useEffect(() => {
    if (!result || selectedFrame) return;
    const candidate =
      frames.find((f) => (f.events || []).length > 0) || result.executeInvocation;
    if (candidate) setSelectedFrame(candidate);
  }, [result, frames, selectedFrame]);

  // URL hash deep-link `#frame=N` — Phalcon-style shareable selection.
  useEffect(() => {
    const sync = () => {
      const m = window.location.hash.match(/frame=(\d+)/);
      if (!m) return;
      const idx = parseInt(m[1], 10);
      if (frames[idx]) setSelectedFrame(frames[idx]);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [frames]);

  const setSelectedFrameWithHash = useCallback(
    (f: FunctionInvocation | null) => {
      setSelectedFrame(f);
      if (f) {
        const idx = frames.indexOf(f);
        if (idx >= 0) {
          // Preserve any existing ?tab= query so jumping between frames
          // doesn't clobber the URL the parent route is maintaining.
          const url = new URL(window.location.href);
          url.hash = `frame=${idx}`;
          window.history.replaceState(null, "", url.toString());
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
      } else if (e.key === "n" && selectedFrame?.calls?.[0]) {
        e.preventDefault();
        setSelectedFrameWithHash(selectedFrame.calls[0]);
      } else if (e.key === "o" && selectedFrame) {
        e.preventDefault();
        const me = selectedFrame;
        const parent = frames.find((c) => (c.calls || []).includes(me));
        if (parent) setSelectedFrameWithHash(parent);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [frames, selectedFrame, setSelectedFrameWithHash]);

  if (!result) {
    return (
      <Card className="p-6 text-muted-foreground">
        No simulation result at index {resultIndex}.
      </Card>
    );
  }

  const sender = (result.executeInvocation || result.validateInvocation)?.contractAddress;
  const ts = new Date(response.blockContext.timestamp * 1000);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="text-foreground">
        <header className="border-b border-border pb-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" size="sm">
                  simulation
                </Badge>
                <span className="font-mono">{response.simId}</span>
              </div>
              {txHash && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>tx hash</span>
                  <span className="font-mono text-foreground">{shortHex(txHash, 16, 8)}</span>
                  <CopyButton value={txHash} className="h-4 w-4" iconSize={10} />
                </div>
              )}
              <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <StatusBadge status={result.status} />
                Starknet Transaction
                <Badge variant="outline" size="sm">
                  INVOKE v3
                </Badge>
              </h2>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                {onResimulate && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<ArrowsClockwise size={14} />}
                    loading={isResimulating}
                    onClick={() => void onResimulate()}
                  >
                    Re-simulate
                  </Button>
                )}
                {onExplainTransaction && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Sparkle size={14} />}
                    onClick={() => onExplainTransaction(result)}
                  >
                    Explain transaction
                  </Button>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                <span>block {response.blockContext.blockNumber.toLocaleString()}</span>
                <span className="mx-1">·</span>
                <span>starknet {response.blockContext.starknetVersion}</span>
                <span className="mx-1">·</span>
                <span>{ts.toUTCString()}</span>
              </div>
            </div>
          </div>

          {/* 3-step status timeline (Voyager parity) */}
          <div className="flex items-center gap-2 text-xs">
            <TimelineStep label="Simulated" active />
            <div className="h-px flex-1 bg-border" />
            <TimelineStep label="Pinned to parent (L2)" />
            <div className="h-px flex-1 bg-border" />
            <TimelineStep label="Would settle on L1" muted />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <Stat
              label="Sender"
              value={sender ? shortHex(sender) : "—"}
              copyValue={sender ?? undefined}
              tooltip="Account that authored this transaction"
            />
            <Stat
              label="Fee (FRI)"
              value={result.feeEstimate.overallFee}
              copyValue={result.feeEstimate.overallFee}
              tooltip="Overall fee in fri (10⁻¹⁸ STRK)"
            />
            <Stat
              label="VM steps"
              value={result.executionResources.steps.toLocaleString()}
              tooltip="Cairo VM step count"
            />
            <Stat
              label="L2 gas"
              value={result.executionResources.l2Gas.toLocaleString()}
              tooltip="Sierra L2-gas units consumed"
            />
            <Stat
              label="Frames"
              value={frames.length.toLocaleString()}
              tooltip="Distinct call frames in the execution tree"
            />
          </div>
        </header>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TabKey)}
          className="mt-4 gap-4"
        >
          <TabsList className="w-full justify-start overflow-x-auto bg-transparent p-0 border-b border-border rounded-none h-auto">
            <TabTrigger value="trace" icon={<TreeStructure size={14} />}>
              Call tree
            </TabTrigger>
            <TabTrigger value="flow" icon={<CurrencyCircleDollar size={14} />}>
              Token flow
            </TabTrigger>
            <TabTrigger value="events" icon={<RadioButton size={14} />}>
              Events
            </TabTrigger>
            <TabTrigger value="state" icon={<Stack size={14} />}>
              State diff
            </TabTrigger>
            <TabTrigger value="resources" icon={<GearSix size={14} />}>
              Resources
            </TabTrigger>
            <TabTrigger value="messages" icon={<PaperPlaneRight size={14} />}>
              L1 messages
            </TabTrigger>
            <TabTrigger value="dev" icon={<Wrench size={14} />}>
              Developer info
            </TabTrigger>
            <TabTrigger value="raw" icon={<Code size={14} />}>
              Raw JSON
            </TabTrigger>
          </TabsList>

          <TabsContent value="trace">
            <CallTreeTab
              result={result}
              frames={frames}
              selectedFrame={selectedFrame}
              setSelectedFrame={setSelectedFrameWithHash}
              onExplainFrame={onExplainFrame}
            />
          </TabsContent>
          <TabsContent value="flow">
            <TokenFlowTab result={result} />
          </TabsContent>
          <TabsContent value="events">
            <EventsTab result={result} />
          </TabsContent>
          <TabsContent value="state">
            <StateDiffTab result={result} />
          </TabsContent>
          <TabsContent value="resources">
            <ResourcesTab
              result={result}
              frames={frames}
              onJumpToFrame={(f) => {
                setTab("trace");
                setSelectedFrameWithHash(f);
              }}
            />
          </TabsContent>
          <TabsContent value="messages">
            <MessagesTab result={result} />
          </TabsContent>
          <TabsContent value="dev">
            <DevInfoTab response={response} result={result} />
          </TabsContent>
          <TabsContent value="raw">
            <RawTab response={response} />
          </TabsContent>
        </Tabs>

        <footer className="mt-6 border-t border-border pt-3 text-[11px] text-muted-foreground">
          Bridge: <span className="font-mono">starknet-sim-bridge</span>
          {source && <> — {source}</>}.
          <span className="mx-2">·</span>
          <span className="font-mono">b</span>/<span className="font-mono">k</span> ← prev ·{" "}
          <span className="font-mono">space</span>/<span className="font-mono">j</span> → next ·{" "}
          <span className="font-mono">n</span> step in · <span className="font-mono">o</span> step out
        </footer>
      </div>
    </TooltipProvider>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: React.ComponentProps<typeof Badge>["variant"] =
    status === "SUCCEEDED"
      ? "success"
      : status === "REVERTED"
      ? "warning"
      : "destructive";
  return (
    <Badge variant={variant} size="md" className="font-bold">
      {status}
    </Badge>
  );
}

function TimelineStep({
  label,
  active,
  muted,
}: {
  label: string;
  active?: boolean;
  muted?: boolean;
}) {
  const dot = active
    ? "bg-success"
    : muted
    ? "bg-muted-foreground/40"
    : "bg-muted-foreground/70";
  const text = active ? "text-foreground" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-3 h-3 rounded-full ${dot}`} />
      <span className={text}>{label}</span>
    </div>
  );
}

function Stat({
  label,
  value,
  tooltip,
  copyValue,
}: {
  label: string;
  value: string;
  tooltip?: string;
  copyValue?: string;
}) {
  const inner = (
    <Card className="p-2 gap-0">
      <div className="uppercase text-muted-foreground text-[10px]">{label}</div>
      <div className="mt-0.5 text-foreground font-mono flex items-center gap-1">
        <span className="truncate">{value}</span>
        {copyValue && <CopyButton value={copyValue} className="h-5 w-5" />}
      </div>
    </Card>
  );
  return tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{inner}</div>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  ) : (
    inner
  );
}

function TabTrigger({
  value,
  icon,
  children,
}: {
  value: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className="data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-foreground border-b-2 border-transparent rounded-none px-3 py-2 text-sm gap-1.5"
    >
      {icon}
      {children}
    </TabsTrigger>
  );
}

function RawTab({ response }: { response: SimulateResponse }) {
  return (
    <Card className="p-4 gap-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase text-muted-foreground">
          Raw <span className="font-mono text-foreground">/simulate</span> response
        </div>
        <CopyButton value={JSON.stringify(response, null, 2)} className="h-6 px-2" />
      </div>
      <pre className="text-xs leading-relaxed overflow-auto max-h-[70vh] font-mono">
        {JSON.stringify(response, null, 2)}
      </pre>
    </Card>
  );
}

export { contractLabel, selectorName };
