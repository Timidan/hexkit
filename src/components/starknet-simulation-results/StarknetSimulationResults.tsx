// Top-level Starknet sim results panel. Mirrors the EVM
// `simulation-results/` shell but adapted for the Starknet wire format
// (validate / execute / fee_transfer invocations + canonical stateDiff +
// per-CallInfo decodedSelector). Uses HexKit's shadcn-derived primitives
// + CSS vars so it themes correctly in both light and dark modes.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowsClockwise,
  ArrowSquareOut,
  DownloadSimple,
  Sparkle,
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
import {
  explorerLinks,
  networkLabel,
} from "@/components/starknet/explorerLinks";
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
import {
  buildAddressLabels,
  contractLabel,
  formatFriAmount,
  formatHexGasAmount,
  selectorName,
  shortHex,
  walkInvocations,
} from "./decoders";

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
  /** Bridge-reported chain ID. Decides whether the Voyager / Starkscan
   *  links resolve to mainnet or sepolia hosts. */
  chainId?: string | null;
  /** Bridge git SHA from /health, rendered in the footer so a shared
   *  screenshot identifies which bridge build produced this result. */
  bridgeGitSha?: string | null;
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
  chainId,
  bridgeGitSha,
}: StarknetSimulationResultsProps) {
  const result = response.results?.[resultIndex];
  const [tab, setTab] = useState<TabKey>(loadStoredTab);
  // Persist on every change so a reload lands the user back where they
  // were last looking (Call tree / State diff / Events / …). Outer
  // ?tab=… still owns the trace vs synthetic vs estimate page split.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RESULT_TAB_KEY, tab);
    } catch {
      // Quota / private mode — preference just won't carry forward.
    }
  }, [tab]);
  const [selectedFrame, setSelectedFrame] = useState<FunctionInvocation | null>(null);

  // Frame walk-order index — shared between Call tree, Resources heatmap,
  // and the step debugger so "frame #17" means the same thing everywhere.
  const frames = useMemo(
    () => (result ? Array.from(walkInvocations(result)) : []),
    [result],
  );

  // Address → label map built once from the full result. Tabs that
  // don't have a frame in hand (state diff, nonce updates, class hash
  // updates) read this to render the same labels the call tree shows.
  const addressLabels = useMemo(
    () => (result ? buildAddressLabels(result) : {}),
    [result],
  );

  // Frame → parent frame map (null for the top-level entries). Built
  // once at the response root so the FrameDetailPane can render a
  // clickable breadcrumb without having to re-walk the tree on each
  // selection.
  const parentMap = useMemo(() => {
    const map = new Map<FunctionInvocation, FunctionInvocation | null>();
    if (!result) return map;
    const tops = [
      result.validateInvocation,
      result.executeInvocation,
      result.feeTransferInvocation,
    ].filter((f): f is FunctionInvocation => Boolean(f));
    for (const top of tops) {
      map.set(top, null);
      const stack: FunctionInvocation[] = [top];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const child of cur.calls || []) {
          map.set(child, cur);
          stack.push(child);
        }
      }
    }
    return map;
  }, [result]);

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

  const explorers = txHash ? explorerLinks(txHash, chainId) : null;
  const senderLabel = sender ? contractLabel(sender) : null;
  // Meta-tx heuristic: if any frame in the trace dispatches via the
  // Argent / AVNU paymaster patterns, the user-visible call is being
  // sponsored. Voyager surfaces this as a META-TRANSACTION tag on the
  // header — useful signal for "the sender isn't the payer".
  const isMetaTx = useMemo(() => {
    return frames.some((f) => {
      const sel = selectorName(f);
      return (
        sel === "execute_from_outside_v2" ||
        sel === "execute_from_outside" ||
        sel === "execute_sponsored"
      );
    });
  }, [frames]);
  // Voyager labels the meta-tx flow with "Sponsored by 0x…" — pulled
  // from the AVNU AA Forwarder's caller (the actual paymaster).
  // Detect by walking down to the execute_from_outside_v2 frame and
  // taking its `callerAddress`, which by Argent / AVNU convention is
  // the paymaster account.
  const sponsorAddress = useMemo(() => {
    if (!isMetaTx) return null;
    for (const f of frames) {
      const sel = selectorName(f);
      if (
        sel === "execute_from_outside_v2" ||
        sel === "execute_from_outside" ||
        sel === "execute_sponsored"
      ) {
        return f.callerAddress || null;
      }
    }
    return null;
  }, [isMetaTx, frames]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="text-foreground">
        {/* Compact header — mirror of the EDB simulation results page so
            the two surfaces feel like one app. Status pill on the left,
            action icons on the right, summary grid below. */}
        <header className="flex items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold">Starknet simulation</span>
            <StatusBadge status={result.status} />
            <Badge variant="outline" size="sm">
              INVOKE v3
            </Badge>
            {isMetaTx && (
              <Badge variant="info" size="sm" data-testid="meta-tx-badge">
                META-TX
              </Badge>
            )}
            {/* Compact 3-step lifecycle pill — Voyager parity. The
                bridge runs against blockifier so the tx is always
                "Simulated"; L2 / L1 acceptance comes from the
                receipt's finality_status when present. */}
            {(() => {
              const finality = response.txReceipt?.finality_status ?? null;
              const onL2 =
                finality === "ACCEPTED_ON_L2" || finality === "ACCEPTED_ON_L1";
              const onL1 = finality === "ACCEPTED_ON_L1";
              return (
                <span className="hidden md:inline-flex items-center gap-1 ml-2 text-[10px] text-muted-foreground">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
                  <span>Simulated</span>
                  <span className="text-muted-foreground/60">›</span>
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      onL2 ? "bg-success" : "bg-muted-foreground/40"
                    }`}
                  />
                  <span>{onL2 ? "Accepted on L2" : "Speculative"}</span>
                  <span className="text-muted-foreground/60">›</span>
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      onL1 ? "bg-success" : "bg-muted-foreground/30"
                    }`}
                  />
                  <span>
                    {onL1 ? "Settled on L1" : "Pending L1 settlement"}
                  </span>
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-1.5">
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
            <Button
              variant="outline"
              size="sm"
              icon={<DownloadSimple size={14} />}
              onClick={() => downloadResponseJson(response, txHash)}
              data-testid="download-json"
            >
              Download
            </Button>
            {onExplainTransaction && (
              <Button
                variant="outline"
                size="sm"
                icon={<Sparkle size={14} />}
                onClick={() => onExplainTransaction(result)}
              >
                Explain
              </Button>
            )}
          </div>
        </header>

        {/* Two-column summary — same row pattern EDB uses, swapped to
            Starknet fields. Left column = identity (hash, network,
            block, when, sender). Right column = execution outcome
            (fee, L1 / L1 data / L2 gas, VM steps, frame count). */}
        <section className="border border-border rounded-md bg-card p-3 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <SummaryRow label="Hash">
              {txHash ? (
                <>
                  <span className="font-mono text-foreground">
                    {shortHex(txHash, 14, 6)}
                  </span>
                  <CopyButton value={txHash} className="h-4 w-4" iconSize={10} />
                  {explorers && (
                    <>
                      <a
                        href={explorers.voyager}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-0.5 text-foreground hover:underline"
                        data-testid="explorer-link-voyager"
                      >
                        Voyager
                        <ArrowSquareOut size={10} />
                      </a>
                      <a
                        href={explorers.starkscan}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-0.5 text-foreground hover:underline"
                        data-testid="explorer-link-starkscan"
                      >
                        Starkscan
                        <ArrowSquareOut size={10} />
                      </a>
                    </>
                  )}
                </>
              ) : (
                <span className="font-mono text-muted-foreground">
                  speculative · {response.simId}
                </span>
              )}
            </SummaryRow>
            <SummaryRow label="Fee">
              <span className="font-mono text-foreground">
                {formatFriAmount(result.feeEstimate.overallFee)}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {result.feeEstimate.overallFee}
              </span>
              {(() => {
                // Voyager parity: surface the fee recipient label
                // alongside the amount so users see "0.05 STRK → StarkWare
                // Sequencer" without drilling into the fee_transfer frame.
                const seq = response.blockContext.sequencerAddress;
                const seqLbl = seq ? contractLabel(seq) : null;
                if (!seqLbl) return null;
                return (
                  <span className="text-[10px] text-muted-foreground">
                    → <span className="text-foreground">{seqLbl}</span>
                  </span>
                );
              })()}
            </SummaryRow>
            <SummaryRow label="Network">
              <span className="text-foreground">{networkLabel(chainId)}</span>
            </SummaryRow>
            <SummaryRow label="L1 gas">
              <span className="font-mono text-foreground">
                {result.feeEstimate.l1GasConsumed
                  ? formatHexGasAmount(result.feeEstimate.l1GasConsumed)
                  : "—"}
              </span>
            </SummaryRow>
            <SummaryRow label="Block">
              <span className="font-mono text-foreground">
                {response.blockContext.blockNumber.toLocaleString()}
              </span>
              <span className="text-[10px] text-muted-foreground">
                · starknet {response.blockContext.starknetVersion}
              </span>
            </SummaryRow>
            <SummaryRow label="L1 data gas">
              <span className="font-mono text-foreground">
                {result.feeEstimate.l1DataGasConsumed
                  ? formatHexGasAmount(result.feeEstimate.l1DataGasConsumed)
                  : "—"}
              </span>
            </SummaryRow>
            <SummaryRow label="Time">
              <span
                className="text-foreground"
                title={ts.toUTCString()}
              >
                {humanRelative(ts)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {ts.toUTCString()}
              </span>
            </SummaryRow>
            <SummaryRow label="L2 gas">
              <span className="font-mono text-foreground">
                {result.executionResources.l2Gas.toLocaleString()}
              </span>
            </SummaryRow>
            <SummaryRow label="Sender">
              {sender ? (
                <>
                  {senderLabel && (
                    <span className="text-success">{senderLabel}</span>
                  )}
                  <span className="font-mono text-foreground">
                    {shortHex(sender, 10, 6)}
                  </span>
                  <CopyButton value={sender} className="h-4 w-4" iconSize={10} />
                  {sponsorAddress && (
                    <span className="text-[10px] text-muted-foreground">
                      · sponsored by{" "}
                      <span className="font-mono text-foreground">
                        {shortHex(sponsorAddress, 8, 4)}
                      </span>
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </SummaryRow>
            <SummaryRow label="Frames">
              <span className="font-mono text-foreground">
                {frames.length.toLocaleString()}
              </span>
              <span className="text-[10px] text-muted-foreground">
                · {result.executionResources.steps.toLocaleString()} VM steps
              </span>
            </SummaryRow>
          </div>
        </section>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TabKey)}
          className="mt-4 gap-4"
        >
          {/* Mirror of the EDB tab strip — 4 textual labels, no icons,
              flat underline. Token flow / Resources / Developer info /
              Raw JSON live behind the "More" menu so the primary tabs
              stay aligned with what users hit on every trace. */}
          <TabsList className="w-full justify-start gap-1 bg-transparent p-0 border-b border-border rounded-none h-auto">
            <TabTrigger value="trace">Trace</TabTrigger>
            <TabTrigger value="events">Events</TabTrigger>
            <TabTrigger value="state">State</TabTrigger>
            <TabTrigger value="messages">L1 messages</TabTrigger>
            <span className="ml-auto flex items-center gap-1 text-[11px]">
              <SecondaryTabButton
                value="flow"
                current={tab}
                onChange={(v) => setTab(v as TabKey)}
              >
                Token flow
              </SecondaryTabButton>
              <SecondaryTabButton
                value="resources"
                current={tab}
                onChange={(v) => setTab(v as TabKey)}
              >
                Resources
              </SecondaryTabButton>
              <SecondaryTabButton
                value="dev"
                current={tab}
                onChange={(v) => setTab(v as TabKey)}
              >
                Dev
              </SecondaryTabButton>
              <SecondaryTabButton
                value="raw"
                current={tab}
                onChange={(v) => setTab(v as TabKey)}
              >
                Raw
              </SecondaryTabButton>
            </span>
          </TabsList>

          <TabsContent value="trace">
            <CallTreeTab
              result={result}
              frames={frames}
              parentMap={parentMap}
              chainId={chainId ?? null}
              types={response.types}
              selectedFrame={selectedFrame}
              setSelectedFrame={setSelectedFrameWithHash}
              onExplainFrame={onExplainFrame}
            />
          </TabsContent>
          <TabsContent value="flow">
            <TokenFlowTab
              result={result}
              frames={frames}
              onJumpToFrame={(f) => {
                setTab("trace");
                setSelectedFrameWithHash(f);
              }}
            />
          </TabsContent>
          <TabsContent value="events">
            <EventsTab
              result={result}
              frames={frames}
              types={response.types}
              blockNumber={response.blockContext.blockNumber}
              txPosition={resultIndex}
              onJumpToFrame={(f) => {
                setTab("trace");
                setSelectedFrameWithHash(f);
              }}
            />
          </TabsContent>
          <TabsContent value="state">
            <StateDiffTab
              result={result}
              addressLabels={addressLabels}
              blockNumber={response.blockContext.blockNumber}
              blockTimestamp={response.blockContext.timestamp}
            />
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
            <MessagesTab
              result={result}
              frames={frames}
              onJumpToFrame={(f) => {
                setTab("trace");
                setSelectedFrameWithHash(f);
              }}
            />
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
          {bridgeGitSha && <> @ <span className="font-mono">{bridgeGitSha.slice(0, 7)}</span></>}
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

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  // Stable kebab-cased id used by tooling (voyager-parity harness, e2e
  // tests). Must NOT depend on the visible label string changing —
  // that's why we slug the label once and stash it as a data attr.
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <div
      className="flex items-center gap-2 py-1 border-b border-border/30 last:border-b-0"
      data-summary-row={id}
    >
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">{children}</div>
    </div>
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
    <Badge
      variant={variant}
      size="md"
      className="font-bold"
      data-status={status}
    >
      {status}
    </Badge>
  );
}

function TabTrigger({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className="data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-foreground border-b-2 border-transparent rounded-none px-3 py-2 text-sm"
    >
      {children}
    </TabsTrigger>
  );
}

/** Smaller, ghost-style buttons for the secondary tabs (Token flow,
 *  Resources, Dev, Raw). They share the same underlying tab state as
 *  the primary tab strip but don't take front-and-centre real estate. */
function SecondaryTabButton({
  value,
  current,
  onChange,
  children,
}: {
  value: string;
  current: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`px-2 py-1 rounded-md ${
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
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

/** "5m ago" / "2h ago" / "3d ago" — coarse buckets, only useful as a
 *  glance metric. The absolute UTC timestamp is right next to it. */
function humanRelative(ts: Date): string {
  const delta = Date.now() - ts.getTime();
  if (delta < 0) return "in the future";
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

const RESULT_TAB_KEY = "hexkit:starknet-sim:resultTab";
const VALID_RESULT_TABS: readonly TabKey[] = [
  "trace",
  "flow",
  "events",
  "state",
  "resources",
  "messages",
  "dev",
  "raw",
] as const;

function loadStoredTab(): TabKey {
  if (typeof window === "undefined") return "trace";
  try {
    const raw = window.localStorage.getItem(RESULT_TAB_KEY);
    if (raw && VALID_RESULT_TABS.includes(raw as TabKey)) return raw as TabKey;
  } catch {
    // Fall through to default.
  }
  return "trace";
}

/** Triggers a browser download of the raw bridge response. Filename
 *  uses the tx hash when present (trace flow) or the simId (synthetic),
 *  so an archive of multiple downloads stays self-describing. */
function downloadResponseJson(response: SimulateResponse, txHash?: string): void {
  if (typeof window === "undefined") return;
  const stem = txHash ? txHash.replace(/^0x/, "0x").slice(0, 18) : response.simId;
  const filename = `starknet-sim-${stem}.json`;
  try {
    const blob = new Blob([JSON.stringify(response, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // Browsers block this for various reasons (sandbox iframes, etc.) —
    // worst case the user can still copy from the Raw JSON tab.
  }
}

export { contractLabel, selectorName };
