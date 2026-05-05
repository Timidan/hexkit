import { useEffect, useMemo, useState } from "react";
import {
  ArrowSquareOut,
  BugBeetle,
  CaretDown,
  CaretRight,
  Check,
  Code,
  LinkSimple,
  Sparkle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton } from "@/components/ui/copy-button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getStarknetSimBridgeUrl, getBridgeHeaders } from "@/utils/env";
import { copyTextToClipboard } from "@/utils/clipboard";
import { ColorizedSnippet } from "@/lib/monaco";
import type { StarknetNetwork } from "@/config/networkConfig";
import { rpcOverrideHeaderFor } from "@/chains/starknet/simulatorClient";
import {
  useCairoSource,
  type CairoSourceResponse,
} from "@/chains/starknet/cairoSourceClient";
import type { FunctionInvocation, SimulationResult } from "@/chains/starknet/simulatorTypes";
import { useContractName } from "@/chains/starknet/contractNameClient";
import {
  classLabel,
  frameLabel,
  countSubtree,
  eventName,
  selectorName,
  shortHex,
  stripSystemArgs,
  subtreeEventCount,
} from "./decoders";
import { CallTypeGutterBadge } from "./SummaryPanel";
import { CallTreeSearch } from "./CallTreeSearch";
import {
  lastTypeSeg,
  previewForType,
  splitTupleArgs,
} from "./decodeFunctionSig";
import { markClassVerified } from "./starknetClassesAdapter";

interface Props {
  result: SimulationResult;
  frames: FunctionInvocation[];
  parentMap: Map<FunctionInvocation, FunctionInvocation | null>;
  chainId?: string | null;
  types?: Record<string, import("@/chains/starknet/simulatorTypes").AbiTypeDef>;
  selectedFrame: FunctionInvocation | null;
  setSelectedFrame: (f: FunctionInvocation) => void;
  onExplainFrame?: (f: FunctionInvocation) => void;
  onShowResources?: () => void;
}

export function CallTreeTab({
  result,
  frames,
  parentMap,
  chainId,
  types,
  selectedFrame,
  setSelectedFrame,
  onExplainFrame,
  onShowResources,
}: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-7">
        <CallTrace
          result={result}
          frames={frames}
          chainId={chainId}
          types={types}
          selectedFrame={selectedFrame}
          setSelectedFrame={setSelectedFrame}
          onShowResources={onShowResources}
        />
      </div>

      <div className="lg:col-span-5 space-y-4">
        <FrameDetailPane
          frame={selectedFrame}
          frames={frames}
          parentMap={parentMap}
          chainId={chainId}
          types={types}
          onSelect={setSelectedFrame}
          stripSys={true}
          onExplain={onExplainFrame}
        />
      </div>
    </div>
  );
}

interface CallTraceProps {
  result: SimulationResult;
  frames: FunctionInvocation[];
  chainId?: string | null;
  types?: Record<string, import("@/chains/starknet/simulatorTypes").AbiTypeDef>;
  selectedFrame: FunctionInvocation | null;
  setSelectedFrame: (f: FunctionInvocation) => void;
  onShowResources?: () => void;
  compact?: boolean;
}

export function CallTrace({
  result,
  frames,
  chainId,
  types,
  selectedFrame,
  setSelectedFrame,
  onShowResources,
  compact = false,
}: CallTraceProps) {
  const [showResources, setShowResources] = usePersistedToggle("showResources", true);
  const [executeOnly, setExecuteOnly] = usePersistedToggle("executeOnly:v2", false);
  const [onlyEvents, setOnlyEvents] = usePersistedToggle("onlyEvents", false);
  const [storageOn, setStorageOn] = usePersistedToggle("storageOn", false);
  const stripSys = true;
  const [filter, setFilter] = useState("");

  const stats = useMemo(() => {
    let totalEvents = 0;
    let maxDepth = 0;
    const uniqContracts = new Set<string>();
    const uniqClasses = new Set<string>();
    let decoded = 0;
    function walk(n: FunctionInvocation, depth = 1) {
      totalEvents += (n.events || []).length;
      maxDepth = Math.max(maxDepth, depth);
      uniqContracts.add(n.contractAddress);
      if (n.classHash) uniqClasses.add(n.classHash);
      if (selectorName(n)) decoded++;
      for (const c of n.calls || []) walk(c, depth + 1);
    }
    for (const top of [
      result.validateInvocation,
      result.executeInvocation,
      result.feeTransferInvocation,
    ]) {
      if (top) walk(top);
    }
    return {
      totalEvents,
      maxDepth,
      uniqContracts: uniqContracts.size,
      uniqClasses: uniqClasses.size,
      decoded,
    };
  }, [result]);

  const hasExecute = result.executeInvocation !== null;
  const sections: Array<[string, FunctionInvocation | null, string]> = (
    executeOnly && hasExecute
  )
    ? [
        [
          "__execute__",
          result.executeInvocation,
          "border-emerald-700/40 bg-emerald-500/5",
        ],
      ]
    : [
        ["__validate__", result.validateInvocation, "border-amber-700/40 bg-amber-500/5"],
        ["__execute__", result.executeInvocation, "border-emerald-700/40 bg-emerald-500/5"],
        ["__fee_transfer__", result.feeTransferInvocation, "border-border bg-card"],
      ];

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="m-0 text-[0.9125rem] font-semibold uppercase tracking-[0.05em] text-foreground">
              Full Call Tree
            </h3>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {frames.length} frames · max depth {stats.maxDepth} · {stats.totalEvents} events
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <CallTreeSearch
          frames={frames}
          setSelectedFrame={setSelectedFrame}
          onSearchChange={setFilter}
        />
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <FilterPill
            id="filter-gas"
            checked={showResources}
            onChange={setShowResources}
            label="Gas"
          />
          <FilterPill
            id="filter-full"
            checked={!executeOnly}
            onChange={(v) => setExecuteOnly(!v)}
            label="Full Trace"
          />
          <FilterPill
            id="filter-storage"
            checked={storageOn}
            onChange={setStorageOn}
            label="Storage"
          />
          <FilterPill
            id="filter-events"
            checked={onlyEvents}
            onChange={setOnlyEvents}
            label="Events"
          />
          <FilterPill
            id="filter-slot-xref"
            checked={false}
            onChange={() => {}}
            label="Slot X-Ref"
            disabled
          />
        </div>
      </div>

      {!compact && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Card className="px-2 py-1.5 gap-0">
            <div className="text-[9px] uppercase text-muted-foreground">unique contracts</div>
            <div className="font-mono text-foreground text-sm">{stats.uniqContracts}</div>
          </Card>
          <Card className="px-2 py-1.5 gap-0">
            <div className="text-[9px] uppercase text-muted-foreground">unique classes</div>
            <div className="font-mono text-foreground text-sm">{stats.uniqClasses}</div>
          </Card>
          <Card className="px-2 py-1.5 gap-0">
            <div className="text-[9px] uppercase text-muted-foreground">decoded selectors</div>
            <div className="font-mono text-foreground text-sm">
              {stats.decoded} / {frames.length}
            </div>
          </Card>
          <Card className="px-2 py-1.5 gap-0">
            <div className="text-[9px] uppercase text-muted-foreground">tx outcome</div>
            <div
              className={`font-mono text-sm ${
                result.status === "SUCCEEDED"
                  ? "text-success"
                  : result.status === "REVERTED"
                  ? "text-warning"
                  : "text-destructive"
              }`}
            >
              {result.status}
            </div>
          </Card>
        </div>
      )}

      <div className="space-y-2 text-sm">
        {sections.map(([label, node, cls]) =>
          node ? (
            <div key={label} className={`rounded-md border ${cls} p-2`}>
              <div className="text-[11px] uppercase tracking-wide text-foreground mb-1 flex items-center gap-2">
                {label}
                {subtreeEventCount(node) ? (
                  <Badge variant="outline" size="sm">
                    {subtreeEventCount(node)} events
                  </Badge>
                ) : null}
              </div>
              <CallNode
                ci={node}
                depth={0}
                frames={frames}
                filter={filter}
                onlyEvents={onlyEvents}
                stripSys={stripSys}
                showResources={showResources}
                totalFrames={frames.length}
                totalSteps={result.executionResources?.steps ?? 0}
                selectedFrame={selectedFrame}
                onSelect={setSelectedFrame}
                onShowResources={onShowResources}
                types={types}
                chainId={chainId}
              />
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

function FilterPill({
  id,
  checked,
  onChange,
  label,
  disabled = false,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      }`}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => !disabled && onChange(Boolean(v))}
      />
      <Label
        htmlFor={id}
        className={`text-xs text-muted-foreground ${
          disabled ? "cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        {label}
      </Label>
    </div>
  );
}

interface NodeProps {
  ci: FunctionInvocation;
  depth: number;
  frames: FunctionInvocation[];
  filter: string;
  onlyEvents: boolean;
  stripSys: boolean;
  showResources: boolean;
  totalFrames: number;
  totalSteps: number;
  selectedFrame: FunctionInvocation | null;
  onSelect: (f: FunctionInvocation) => void;
  onShowResources?: () => void;
  types?: Record<string, import("@/chains/starknet/simulatorTypes").AbiTypeDef>;
  chainId?: string | null;
}

function CallNode(props: NodeProps) {
  const {
    ci,
    depth,
    frames,
    filter,
    onlyEvents,
    stripSys,
    showResources,
    totalFrames,
    totalSteps,
    selectedFrame,
    onSelect,
    onShowResources,
    types,
    chainId,
  } = props;

  const [expanded, setExpanded] = useState(depth < 4);

  if (onlyEvents && subtreeEventCount(ci) === 0) return null;

  if (filter) {
    const matches = (n: FunctionInvocation): boolean => {
      const sn = (selectorName(n) || "").toLowerCase();
      const cl = (frameLabel(n) || "").toLowerCase();
      if (sn.includes(filter) || cl.includes(filter)) return true;
      if (n.contractAddress.toLowerCase().includes(filter)) return true;
      if (n.entryPointSelector.toLowerCase().includes(filter)) return true;
      return (n.calls || []).some(matches);
    };
    if (!matches(ci)) return null;
  }

  const labelKnown = frameLabel(ci);
  const labelIsAccount = labelKnown === "Account";
  const network = chainIdToStarknetNetwork(chainId);
  const evtCount = subtreeEventCount(ci);
  const calldata = stripSys ? stripSystemArgs(ci.calldata) : ci.calldata;
  const subtreeSize = countSubtree(ci);
  const fnum = frames.indexOf(ci);
  const isSelected = ci === selectedFrame;
  const hasChildren = (ci.calls || []).length > 0;

  // Use exact subtree steps when the bridge emitted per-call resources
  // (local blockifier path). Fall back to frame-count approximation for
  // pure RPC-trace responses where executionResources is absent.
  const exactSteps = ci.executionResources?.steps ?? null;
  const approxSteps =
    exactSteps !== null
      ? exactSteps
      : totalSteps > 0
      ? Math.round((subtreeSize / Math.max(1, totalFrames)) * totalSteps)
      : subtreeSize;
  const sharePct = Math.min(
    100,
    totalSteps > 0
      ? Math.round((approxSteps / totalSteps) * 100)
      : Math.round((subtreeSize / Math.max(1, totalFrames)) * 100),
  );

  const pctClass =
    sharePct > 50
      ? "text-destructive"
      : sharePct > 20
      ? "text-warning"
      : "text-muted-foreground";

  return (
    <div
      className="starknet-sim-call-row-wrap"
      data-frame-row={fnum >= 0 ? fnum : "?"}
    >
      <div
        role="button"
        tabIndex={0}
        data-selected={isSelected ? "true" : "false"}
        onClick={() => {
          if (hasChildren) setExpanded((v) => !v);
          onSelect(ci);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (hasChildren) setExpanded((v) => !v);
            onSelect(ci);
          }
        }}
        className={
          "starknet-sim-call-row flex items-stretch gap-0 py-1 rounded text-left transition-colors cursor-pointer " +
          (isSelected ? "bg-accent ring-1 ring-ring" : "hover:bg-muted/40")
        }
        aria-expanded={expanded}
      >
        <div className="starknet-sim-call-gutter shrink-0 flex flex-col items-start gap-0.5">
          <CallTypeGutterBadge kind={ci.callType} />
          {showResources && (
            <span
              role={onShowResources ? "button" : undefined}
              tabIndex={onShowResources ? 0 : undefined}
              onClick={(e) => {
                if (!onShowResources) return;
                e.stopPropagation();
                onShowResources();
              }}
              onKeyDown={(e) => {
                if (!onShowResources) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  onShowResources();
                }
              }}
              title={
                exactSteps !== null
                  ? `${sharePct}% of total · ${approxSteps.toLocaleString()} steps (exact)`
                  : totalSteps > 0
                  ? `${sharePct}% of total · ~${approxSteps.toLocaleString()} steps (estimated)`
                  : `${sharePct}% of total · ${subtreeSize}/${totalFrames} frames`
              }
              data-testid={`gas-chip-frame-${fnum >= 0 ? fnum : "x"}`}
              className={
                "font-mono text-[10px] tabular-nums " +
                pctClass +
                (onShowResources ? " cursor-pointer hover:text-foreground" : "")
              }
            >
              {approxSteps.toLocaleString()}
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-1.5 min-w-0 flex-1"
          style={{ paddingLeft: depth * 16 }}
        >
          <span className="w-3 text-muted-foreground shrink-0">
            {hasChildren ? (
              expanded ? (
                <CaretDown size={12} />
              ) : (
                <CaretRight size={12} />
              )
            ) : null}
          </span>
          <span className="text-muted-foreground text-[10px] font-mono w-7 shrink-0">
            #{fnum >= 0 ? fnum : "?"}
          </span>
          <DebugCallButton frame={ci} onSelect={onSelect} />
          <EdbRowSignature
            ci={ci}
            calldata={calldata}
            labelKnown={labelKnown}
            labelIsAccount={labelIsAccount}
            network={network}
            types={types}
          />
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <CairoSourceLineBadge
              frame={ci}
              chainId={chainId}
              functionName={selectorName(ci)}
              onSelectFrame={onSelect}
            />
            {evtCount ? (
              <span
                className="text-[10px] font-mono text-muted-foreground tabular-nums"
                title={`${evtCount} event${evtCount === 1 ? "" : "s"} in this subtree`}
              >
                {evtCount}
              </span>
            ) : null}
            {showResources && (
              <span
                className={`text-[10px] font-mono tabular-nums ${pctClass}`}
                title={`${subtreeSize} of ${totalFrames} frames`}
              >
                {sharePct}%
              </span>
            )}
          </div>
        </div>
      </div>
      {isSelected && (
        <InlineCairoSnippet
          frame={ci}
          chainId={chainId}
          functionName={selectorName(ci)}
          depth={depth}
        />
      )}
      {expanded && hasChildren && (
        <div className="mt-1 space-y-0.5">
          {ci.calls.map((c, i) => (
            <CallNode key={i} {...props} ci={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function InlineCairoSnippet({
  frame,
  chainId,
  functionName,
  depth,
}: {
  frame: FunctionInvocation;
  chainId?: string | null;
  functionName: string | null;
  depth: number;
}) {
  const network = chainIdToStarknetNetwork(chainId);
  const classHash = frame.classHash || null;
  const { data, loading } = useCairoSource(classHash, network);
  if (!classHash || loading || !data?.verified || !functionName) return null;
  const target = resolveCairoSourceTarget(data, functionName);
  if (!target.functionFound) return null;

  return (
    <div
      className="mt-1 mb-2 ml-0 border border-border/40 rounded bg-background/40"
      style={{ marginLeft: depth * 16 }}
      data-testid="inline-cairo-snippet"
    >
      <div className="flex items-center justify-between gap-2 px-2.5 py-1 border-b border-border/30 text-[10px]">
        <div className="flex items-center gap-1.5 min-w-0 truncate text-muted-foreground">
          <span className="font-mono truncate" title={target.file.path}>
            {target.file.path}:{target.line}
          </span>
          <Badge variant="outline" className="text-[9px] uppercase">
            Voyager · verified
          </Badge>
        </div>
        <span className="font-mono text-foreground/80 truncate max-w-[220px]">
          fn {functionName}
        </span>
      </div>
      <div className="max-h-[260px] overflow-auto">
        <ColorizedSnippet
          sourceContent={target.file.content}
          highlightLine={target.line}
          contextLines={8}
          language="cairo"
        />
      </div>
    </div>
  );
}

function DebugCallButton({
  frame,
  onSelect,
}: {
  frame: FunctionInvocation;
  onSelect: (f: FunctionInvocation) => void;
}) {
  const disabled = !frame.classHash;
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    if (disabled) return;
    onSelect(frame);
    if (typeof document !== "undefined") {
      const pane = document.querySelector('[data-testid="source-pane"]');
      pane?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    toast("Step debugger coming soon", {
      description: "Frame selected — Cairo source is open in the right rail.",
    });
  };
  const handleKey: React.KeyboardEventHandler<HTMLButtonElement> = (e) => {
    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
  };
  const button = (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKey}
      disabled={disabled}
      aria-label={disabled ? "Debugger unavailable for this frame" : "Debug this call"}
      data-testid="debug-call-btn"
      className={
        "shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-sm transition-colors " +
        (disabled
          ? "text-muted-foreground/40 cursor-not-allowed"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer")
      }
    >
      <BugBeetle size={12} />
    </button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top">
        {disabled
          ? "No class hash — debugger unavailable"
          : "Debug this call (coming soon)"}
      </TooltipContent>
    </Tooltip>
  );
}

const INLINE_VALUE_MAX = 40;
const INLINE_ROW_BUDGET = 200;

function selectorShort(hex: string | null | undefined): string {
  if (!hex) return "0x";
  if (hex.length <= 10) return hex;
  return hex.slice(0, 10);
}

interface EdbRowSignatureProps {
  ci: FunctionInvocation;
  calldata: string[];
  labelKnown: string | null;
  labelIsAccount: boolean;
  network: StarknetNetwork;
  types?: Record<string, import("@/chains/starknet/simulatorTypes").AbiTypeDef>;
}

function EdbRowSignature({
  ci,
  calldata,
  labelKnown,
  labelIsAccount,
  network,
  types,
}: EdbRowSignatureProps) {
  const sel = selectorName(ci);
  const dyn = useContractName(labelKnown ? null : ci.contractAddress, network);
  const contractDisplay = labelKnown ?? dyn.name ?? null;
  const contractClass = labelKnown
    ? labelIsAccount
      ? "text-info"
      : "text-success"
    : dyn.name
    ? "text-success"
    : "text-foreground";

  const fnAbi = ci.decodedFunctionAbi;
  const inputs = fnAbi?.inputs ?? [];
  const outputs = fnAbi?.outputs ?? [];

  const inputPreviews = decodeInlineParams(inputs, calldata, types ?? {});
  const outputPreviews = decodeInlineParams(outputs, ci.result || [], types ?? {});

  const selectorPreview = selectorShort(ci.entryPointSelector);
  const isSystemCaller = (() => {
    const c = ci.callerAddress;
    if (!c) return true;
    try {
      return BigInt(c) === 0n;
    } catch {
      return false;
    }
  })();
  const senderShort = isSystemCaller ? "system" : shortHex(ci.callerAddress, 6, 4);
  const receiverShort = shortHex(ci.contractAddress, 6, 4);

  return (
    <span className="font-mono text-xs flex items-baseline gap-0 min-w-0 truncate">
      <span className="text-yellow-400 shrink-0">[</span>
      <span className="text-muted-foreground shrink-0">Sender</span>
      <span className="text-yellow-400 shrink-0">]</span>
      <span
        className={`ml-1 shrink-0 ${isSystemCaller ? "text-muted-foreground/60 italic" : "text-foreground/80"}`}
      >
        {senderShort}
      </span>
      <span className="text-muted-foreground mx-1.5">→</span>

      <span className="text-yellow-400 shrink-0">[</span>
      <span className="text-muted-foreground shrink-0">Receiver</span>
      <span className="text-yellow-400 shrink-0">]</span>
      <span className="ml-1 text-foreground/80 shrink-0">{receiverShort}</span>
      {contractDisplay && (
        <span className={`${contractClass} ml-1 shrink-0`}>{contractDisplay}</span>
      )}
      <span className="text-muted-foreground mx-1.5">→</span>

      <span className="text-muted-foreground/70 shrink-0">{selectorPreview}</span>
      <span className="ml-1 text-foreground font-medium shrink-0">
        {sel ?? `unknown(${selectorPreview})`}
      </span>
      <span className="text-yellow-400">(</span>
      <InlineParamList rows={inputPreviews} fallbackFelts={!fnAbi ? calldata : null} />
      <span className="text-yellow-400">)</span>

      {outputs.length > 0 && (
        <>
          <span className="text-muted-foreground mx-1.5">→</span>
          <span className="text-yellow-400">(</span>
          <InlineParamList rows={outputPreviews} fallbackFelts={null} />
          <span className="text-yellow-400">)</span>
        </>
      )}
    </span>
  );
}

const SOURCE_PANE_HANDLE: {
  current: ((target: { classHash: string }) => void) | null;
} = { current: null };

const PENDING_SOURCE_INTENT: { current: { classHash: string } | null } = {
  current: null,
};

function CairoSourceLineBadge({
  frame,
  chainId,
  functionName,
  onSelectFrame,
}: {
  frame: FunctionInvocation;
  chainId?: string | null;
  functionName: string | null;
  onSelectFrame?: (f: FunctionInvocation) => void;
}) {
  const network = chainIdToStarknetNetwork(chainId);
  const classHash = frame.classHash || null;
  const { data, loading } = useCairoSource(classHash, network);
  if (!classHash || loading || !data?.verified || !functionName) return null;
  const target = resolveCairoSourceTarget(data, functionName);
  if (!target.functionFound) return null;

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    PENDING_SOURCE_INTENT.current = { classHash };
    if (onSelectFrame) onSelectFrame(frame);
    SOURCE_PANE_HANDLE.current?.({ classHash });
    if (typeof document !== "undefined") {
      const pane = document.querySelector('[data-testid="source-pane"]');
      pane?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const handleKey: React.KeyboardEventHandler<HTMLButtonElement> = (e) => {
    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKey}
          className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
          data-testid="cairo-source-line-badge"
        >
          <span className="opacity-50">·</span>
          <span className="block max-w-[180px] truncate">
            {target.file.path}:{target.line}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[10px] font-mono">
        Open Cairo source for{" "}
        <span className="text-foreground">fn {functionName}</span>
      </TooltipContent>
    </Tooltip>
  );
}

interface InlineParamRow {
  name: string;
  type: string;
  preview: string;
  full: string;
  isAddress: boolean;
}

function InlineParamList({
  rows,
  fallbackFelts,
}: {
  rows: InlineParamRow[];
  fallbackFelts: string[] | null;
}) {
  if (rows.length === 0) {
    if (fallbackFelts && fallbackFelts.length > 0) {
      const head = fallbackFelts.slice(0, 2).map((f) => shortHex(f, 6, 4)).join(", ");
      const extra =
        fallbackFelts.length > 2 ? `, +${fallbackFelts.length - 2}` : "";
      return (
        <span className="text-muted-foreground/70 truncate">
          {head}
          {extra}
        </span>
      );
    }
    return null;
  }
  let used = 0;
  const visible: InlineParamRow[] = [];
  for (const r of rows) {
    const cost = r.name.length + r.type.length + r.preview.length + 6;
    if (visible.length > 0 && used + cost > INLINE_ROW_BUDGET) break;
    visible.push(r);
    used += cost;
  }
  const hidden = rows.length - visible.length;
  return (
    <span className="truncate">
      {visible.map((r, i) => (
        <span key={i}>
          {i > 0 && <span className="text-muted-foreground/70">, </span>}
          <span className="text-pink-300/90">{r.name}</span>
          <span className="text-muted-foreground/60">: </span>
          <span className="text-cyan-400/80">{r.type}</span>
          <span className="text-muted-foreground/60"> = </span>
          <InlineValue row={r} />
        </span>
      ))}
      {hidden > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground/70 ml-1 cursor-help">
              , …+{hidden} more
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-md font-mono text-[10px] whitespace-pre-wrap break-all">
            {rows
              .slice(visible.length)
              .map((r) => `${r.name}: ${r.type} = ${r.full}`)
              .join("\n")}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

/** Truncate previews without leaving unmatched brackets. */
function balancedTruncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max - 1);
  const stack: string[] = [];
  const closers: Record<string, string> = { "[": "]", "(": ")", "{": "}", "<": ">" };
  for (const ch of head) {
    if (ch === "[" || ch === "(" || ch === "{" || ch === "<") {
      stack.push(closers[ch]);
    } else if (ch === "]" || ch === ")" || ch === "}" || ch === ">") {
      if (stack.length > 0 && stack[stack.length - 1] === ch) stack.pop();
    }
  }
  let tail = "…";
  while (stack.length > 0) tail += stack.pop();
  return head + tail;
}

function InlineValue({ row }: { row: InlineParamRow }) {
  const truncated = row.preview.length > INLINE_VALUE_MAX;
  const display = truncated
    ? balancedTruncate(row.preview, INLINE_VALUE_MAX)
    : row.preview;
  const valueClass = row.isAddress ? "text-success" : "text-foreground";
  if (!truncated && row.preview === row.full) {
    return <span className={valueClass}>{display}</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`${valueClass} cursor-help underline decoration-dotted decoration-muted-foreground/40`}
        >
          {display}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-md font-mono text-[10px] whitespace-pre-wrap break-all">
        {row.full}
      </TooltipContent>
    </Tooltip>
  );
}

function decodeInlineParams(
  params: Array<{ name: string; type: string }>,
  felts: string[],
  types: Record<string, import("@/chains/starknet/simulatorTypes").AbiTypeDef>,
): InlineParamRow[] {
  const rows: InlineParamRow[] = [];
  let i = 0;
  for (let idx = 0; idx < params.length; idx++) {
    const p = params[idx];
    if (i >= felts.length) {
      rows.push({
        name: p.name || `arg${idx}`,
        type: lastTypeSeg(p.type),
        preview: "—",
        full: "(no felt available)",
        isAddress: false,
      });
      continue;
    }
    const r = previewForType(p.type, felts, i, types, 0);
    rows.push({
      name: p.name || `arg${idx}`,
      type: lastTypeSeg(p.type),
      preview: r.preview,
      full: r.full,
      isAddress: r.isAddress,
    });
    i = r.next;
  }
  return rows;
}

export function FrameDetailPane({
  frame,
  frames,
  parentMap,
  chainId,
  types,
  onSelect,
  stripSys,
  onExplain,
}: {
  frame: FunctionInvocation | null;
  frames: FunctionInvocation[];
  parentMap: Map<FunctionInvocation, FunctionInvocation | null>;
  chainId?: string | null;
  types?: Record<string, import("@/chains/starknet/simulatorTypes").AbiTypeDef>;
  onSelect: (f: FunctionInvocation) => void;
  stripSys: boolean;
  onExplain?: (f: FunctionInvocation) => void;
}) {
  if (!frame) {
    return (
      <Card className="p-4 gap-3">
        <div className="text-xs uppercase text-muted-foreground">Selected frame</div>
        <div className="text-xs text-muted-foreground">
          Click a frame in the tree to see decoded calldata, retdata, and emitted events.
        </div>
      </Card>
    );
  }
  const sel = selectorName(frame);
  const lbl = frameLabel(frame);
  const calldata = stripSys ? stripSystemArgs(frame.calldata) : frame.calldata;
  const network = chainIdToStarknetNetwork(chainId);
  return (
    <Card className="starknet-frame-detail-card p-4 gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs uppercase text-muted-foreground">Selected frame</div>
        <div className="starknet-frame-detail-actions flex items-center gap-2">
          <CopyFrameLinkButton frame={frame} frames={frames} />
          <CopyFrameJsonButton frame={frame} />
          {onExplain && (
            <Button
              variant="outline"
              size="sm"
              icon={<Sparkle size={14} />}
              onClick={() => onExplain(frame)}
            >
              Explain
            </Button>
          )}
        </div>
      </div>
      <FrameBreadcrumb frame={frame} parentMap={parentMap} onSelect={onSelect} />
      <div className="text-sm space-y-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={frame.callType === "Call" ? "success" : "accent"} size="sm">
            {frame.callType}
          </Badge>
          <Badge variant="outline" size="sm">
            {frame.entryPointType}
          </Badge>
          {sel ? (
            <span className="font-mono text-success text-sm">{sel}()</span>
          ) : (
            <span className="font-mono text-foreground text-xs">
              {shortHex(frame.entryPointSelector)}
            </span>
          )}
        </div>
        <div className="starknet-frame-meta text-xs">
          <div className="starknet-frame-meta-row">
            <span className="starknet-frame-meta-label">contract</span>
            <div className="starknet-frame-meta-value">
              <FrameContractLabel
                address={frame.contractAddress}
                staticLabel={lbl}
                network={network}
              />
              <span
                className="starknet-frame-hash"
                title={frame.contractAddress}
              >
                {shortHex(frame.contractAddress, 12, 10)}
              </span>
              <CopyButton
                value={frame.contractAddress}
                ariaLabel="Copy contract address"
                className="h-4 w-4 shrink-0"
                iconSize={10}
              />
            </div>
          </div>
          <div className="starknet-frame-meta-row">
            <span className="starknet-frame-meta-label">class hash</span>
            <div className="starknet-frame-meta-value">
              {(() => {
                const cls = classLabel(frame.classHash);
                return cls ? (
                  <span className="font-mono text-success">{cls}</span>
                ) : null;
              })()}
              <span
                className="starknet-frame-hash"
                title={frame.classHash || undefined}
              >
                {frame.classHash ? shortHex(frame.classHash, 12, 10) : "—"}
              </span>
              {frame.classHash && (
                <CopyButton
                  value={frame.classHash}
                  ariaLabel="Copy class hash"
                  className="h-4 w-4 shrink-0"
                  iconSize={10}
                />
              )}
            </div>
          </div>
          <div className="starknet-frame-meta-row">
            <span className="starknet-frame-meta-label">caller</span>
            <span className="starknet-frame-hash" title={frame.callerAddress}>
              {shortHex(frame.callerAddress)}
            </span>
          </div>
        </div>

        <TypedParamBlock
          label={`INPUT (calldata · ${calldata.length} felt${calldata.length === 1 ? "" : "s"})`}
          params={
            frame.decodedFunctionAbi && frame.decodedFunctionAbi.inputs.length > 0
              ? frame.decodedFunctionAbi.inputs
              : null
          }
          felts={calldata}
          types={types}
        />
        <TypedParamBlock
          label={`OUTPUT (retdata · ${(frame.result || []).length} felt${(frame.result || []).length === 1 ? "" : "s"})`}
          params={
            frame.decodedFunctionAbi && frame.decodedFunctionAbi.outputs.length > 0
              ? frame.decodedFunctionAbi.outputs
              : null
          }
          felts={frame.result || []}
          types={types}
        />

        {frame.events && frame.events.length ? (
          <Card className="p-2 gap-1 bg-background">
            <div className="text-[10px] uppercase text-muted-foreground">
              {frame.events.length} event{frame.events.length === 1 ? "" : "s"} from this frame
            </div>
            <div className="text-xs space-y-1">
              {frame.events.map((ev, i) => {
                const ename = eventName(ev);
                return (
                  <div key={i} className="font-mono">
                    <span className="text-muted-foreground">[{i}]</span>{" "}
                    {ename ? (
                      <Badge variant="info" size="sm" className="font-mono">
                        {ename}
                      </Badge>
                    ) : (
                      <span className="text-foreground">{shortHex(ev.keys[0])}</span>
                    )}{" "}
                    <span className="text-muted-foreground">data:</span>[
                    {(ev.data || []).slice(0, 4).map((d) => shortHex(d)).join(", ")}
                    {(ev.data || []).length > 4 ? ", …" : ""}]
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}
      </div>
    </Card>
  );
}

function TypedParamBlock({
  label,
  params,
  felts,
  types,
}: {
  label: string;
  params: import("@/chains/starknet/simulatorTypes").AbiParam[] | null;
  felts: string[];
  types?: Record<string, import("@/chains/starknet/simulatorTypes").AbiTypeDef>;
}) {
  const valueFormat: ValueFormat = "hex";
  const showRaw = !params || params.length === 0;

  const rows: Array<{ name: string; type: string; rendered: React.ReactNode; raw: string }> = [];
  let i = 0;
  if (params) {
    for (const p of params) {
      const consumed = consumeForType(p.type, felts, i, types ?? {}, 0, valueFormat);
      rows.push({
        name: p.name || `arg${rows.length}`,
        type: p.type,
        rendered: consumed.rendered,
        raw: consumed.raw,
      });
      i = consumed.next;
    }
  }
  const tail = felts.slice(i);
  return (
    <Card className="p-2 gap-1.5 bg-background">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      </div>
      <div className="text-xs space-y-1.5">
        {showRaw ? (
          felts.length === 0 ? (
            <div className="text-muted-foreground/70">empty</div>
          ) : (
            <div className="font-mono space-y-0.5">
              {felts.map((f, j) => (
                <div key={j}>
                  <span className="text-muted-foreground/60">[{j}]</span>{" "}
                  <span className="text-foreground">{formatFelt(f, valueFormat)}</span>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            {rows.map((r, idx) => (
              <div key={idx} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-foreground">{r.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {r.type}
                  </span>
                </div>
                <div className="font-mono pl-2 break-all">{r.rendered}</div>
              </div>
            ))}
            {tail.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <div className="text-[10px] text-warning uppercase">
                  extra felts (decoder under-consumed)
                </div>
                <div className="font-mono pl-2 text-muted-foreground space-y-0.5">
                  {tail.map((f, j) => (
                    <div key={j}>
                      <span className="text-muted-foreground/60">[{i + j}]</span>{" "}
                      {formatFelt(f, valueFormat)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

type ValueFormat = "hex" | "dec" | "text";

function formatFelt(hex: string, fmt: ValueFormat): string {
  if (fmt === "hex") return hex;
  let n: bigint;
  try {
    n = BigInt(hex);
  } catch {
    return hex;
  }
  if (fmt === "dec") return n.toString();
  if (n === 0n) return "''";
  const bytes: number[] = [];
  let v = n;
  while (v > 0n) {
    bytes.unshift(Number(v & 0xffn));
    v >>= 8n;
  }
  if (bytes.every((b) => b >= 0x20 && b < 0x7f)) {
    return `'${String.fromCharCode(...bytes)}'`;
  }
  return hex;
}

function consumeForType(
  ty: string,
  felts: string[],
  i: number,
  types: Record<string, import("@/chains/starknet/simulatorTypes").AbiTypeDef>,
  depth: number,
  fmt: ValueFormat,
): { rendered: React.ReactNode; raw: string; next: number } {
  if (depth > 8) {
    const v = felts[i] ?? "—";
    return {
      rendered: <span className="text-muted-foreground">…(depth cap)</span>,
      raw: v,
      next: i + 1,
    };
  }
  const norm = ty.replace(/\s+/g, "");
  if (norm.endsWith("::u256") || norm === "u256") {
    const low = felts[i] ?? "0x0";
    const high = felts[i + 1] ?? "0x0";
    let value = "0";
    try {
      value = ((BigInt(high) << 128n) | BigInt(low)).toString();
    } catch {
      /* keep 0 */
    }
    return {
      rendered: (
        <span>
          <span className="text-foreground">{value}</span>{" "}
          <span className="text-muted-foreground/60 text-[10px]">
            (low={low}, high={high})
          </span>
        </span>
      ),
      raw: `${low}|${high}`,
      next: i + 2,
    };
  }
  if (norm.endsWith("::bool") || norm === "bool") {
    const v = felts[i] ?? "0x0";
    let display = v;
    try {
      display = BigInt(v) === 0n ? "false" : "true";
    } catch {
      /* keep raw */
    }
    return {
      rendered: <span className="text-foreground">{display}</span>,
      raw: v,
      next: i + 1,
    };
  }
  const arrayMatch = norm.match(/Array::<(.+)>$|Span::<(.+)>$/);
  if (arrayMatch) {
    const inner = arrayMatch[1] ?? arrayMatch[2] ?? "felt";
    const len = (() => {
      try {
        return Number(BigInt(felts[i] ?? "0x0"));
      } catch {
        return 0;
      }
    })();
    const safeLen = Math.min(len, 64);
    const items: React.ReactNode[] = [];
    let pos = i + 1;
    for (let j = 0; j < safeLen; j++) {
      const r = consumeForType(inner, felts, pos, types, depth + 1, fmt);
      items.push(
        <div key={j} className="border-l border-border/40 pl-2 ml-1 mt-1">
          <div className="text-muted-foreground/60 text-[10px]">[{j}]</div>
          <div>{r.rendered}</div>
        </div>,
      );
      pos = r.next;
    }
    return {
      rendered: (
        <div className="space-y-0.5">
          <div className="text-muted-foreground/70 text-[10px]">
            len={len}
            {len > safeLen ? ` (decoder clipped to ${safeLen})` : ""}
          </div>
          {items}
        </div>
      ),
      raw: `[…${len}]`,
      next: pos,
    };
  }
  if (norm.startsWith("(") && norm.endsWith(")")) {
    const inner = splitTupleArgs(norm.slice(1, -1));
    const rendered: React.ReactNode[] = [];
    let pos = i;
    for (let k = 0; k < inner.length; k++) {
      const r = consumeForType(inner[k], felts, pos, types, depth + 1, fmt);
      rendered.push(
        <div key={k} className="border-l border-border/40 pl-2 ml-1">
          <div className="text-muted-foreground/60 text-[10px]">.{k}</div>
          <div>{r.rendered}</div>
        </div>,
      );
      pos = r.next;
    }
    return {
      rendered: <div className="space-y-0.5">{rendered}</div>,
      raw: "(…)",
      next: pos,
    };
  }
  const structDef = types[ty] ?? types[norm];
  if (structDef && structDef.kind === "struct") {
    const rows: React.ReactNode[] = [];
    let pos = i;
    for (const f of structDef.fields) {
      const r = consumeForType(f.type, felts, pos, types, depth + 1, fmt);
      rows.push(
        <div key={f.name} className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-foreground">{f.name}</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {f.type}
            </span>
          </div>
          <div className="font-mono pl-2 break-all">{r.rendered}</div>
        </div>,
      );
      pos = r.next;
    }
    return {
      rendered: <div className="space-y-1 border-l border-border/40 pl-2 ml-1">{rows}</div>,
      raw: "{…}",
      next: pos,
    };
  }
  if (structDef && structDef.kind === "enum") {
    const disc = felts[i] ?? "0x0";
    let variantName = `variant ${disc}`;
    try {
      const idx = Number(BigInt(disc));
      if (structDef.variants[idx]) variantName = structDef.variants[idx].name;
    } catch {
      /* keep default */
    }
    return {
      rendered: (
        <span className="text-foreground">
          {variantName}{" "}
          <span className="text-muted-foreground/60 text-[10px]">
            (disc={disc})
          </span>
        </span>
      ),
      raw: disc,
      next: i + 1,
    };
  }
  const v = felts[i] ?? "—";
  const formatted = v === "—" ? v : formatFelt(v, fmt);
  return {
    rendered: <span className="text-foreground">{formatted}</span>,
    raw: v,
    next: i + 1,
  };
}

interface ClassInfoEntryPoint {
  selector: string;
  functionIdx?: number;
  offset?: number;
}

interface ClassInfoAbiParam {
  name: string;
  type: string;
}

type ClassInfoAbiItem =
  | {
      type: "function" | "external" | "view" | "l1_handler" | "constructor";
      name: string;
      inputs?: ClassInfoAbiParam[];
      outputs?: ClassInfoAbiParam[];
      state_mutability?: string;
    }
  | {
      type: "event";
      name: string;
      inputs?: ClassInfoAbiParam[];
      members?: ClassInfoAbiParam[];
      kind?: string;
    }
  | {
      type: "struct";
      name: string;
      members?: ClassInfoAbiParam[];
    }
  | {
      type: "enum";
      name: string;
      variants?: ClassInfoAbiParam[];
    }
  | {
      type: "interface" | "impl";
      name: string;
      items?: ClassInfoAbiItem[];
      interface_name?: string;
    };

export interface ClassInfo {
  classHash: string;
  isCairo1: boolean;
  contractClassVersion?: string | null;
  abi: ClassInfoAbiItem[] | null;
  entryPoints: {
    external: ClassInfoEntryPoint[];
    l1Handler: ClassInfoEntryPoint[];
    constructor: ClassInfoEntryPoint[];
  };
  sierraProgram: { length: number; sample: string[] } | null;
  program: { encodedLength: number } | null;
}

const classInfoCache = new Map<string, ClassInfo>();
const classInfoInflight = new Map<string, Promise<ClassInfo>>();

function classInfoCacheKey(classHash: string, network: StarknetNetwork): string {
  return `${network}:${classHash.toLowerCase()}`;
}

export function chainIdToStarknetNetwork(chainId: string | null | undefined): StarknetNetwork {
  const lower = (chainId || "").toLowerCase();
  return lower === "0x534e5f5345504f4c4941" ||
    lower === "0x534e5f494e544547524154494f4e5f5345504f4c4941"
    ? "sepolia"
    : "mainnet";
}

export async function fetchClassInfo(
  classHash: string,
  network: StarknetNetwork = "mainnet",
): Promise<ClassInfo> {
  const key = classInfoCacheKey(classHash, network);
  const cached = classInfoCache.get(key);
  if (cached) return cached;
  const flight = classInfoInflight.get(key);
  if (flight) return flight;

  const base = (getStarknetSimBridgeUrl() || "").replace(/\/+$/, "");
  if (!base) {
    throw new Error("Starknet sim bridge URL not configured");
  }
  const url = `${base}/class?class_hash=${encodeURIComponent(classHash)}`;
  const promise = (async () => {
    const response = await fetch(url, {
      method: "GET",
      headers: getBridgeHeaders(rpcOverrideHeaderFor(network)),
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`bridge /class ${response.status}: ${text || response.statusText}`);
    }
    const data = (await response.json()) as ClassInfo;
    classInfoCache.set(key, data);
    if (Array.isArray(data?.abi) && data.abi.length > 0) {
      try {
        markClassVerified(classHash);
      } catch {
        /* non-critical marker update */
      }
    }
    return data;
  })();
  classInfoInflight.set(key, promise);
  try {
    return await promise;
  } finally {
    classInfoInflight.delete(key);
  }
}

function felthexEq(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (h: string) =>
    h.replace(/^0x/i, "").replace(/^0+/, "").toLowerCase() || "0";
  return norm(a) === norm(b);
}

interface FlattenedAbi {
  functions: Array<{
    name: string;
    kind: "function" | "l1_handler" | "constructor";
    inputs: ClassInfoAbiParam[];
    outputs: ClassInfoAbiParam[];
    stateMutability?: string;
  }>;
  events: Array<{ name: string; fields: ClassInfoAbiParam[] }>;
  structs: Array<{ name: string; fields: ClassInfoAbiParam[] }>;
  enums: Array<{ name: string; variants: ClassInfoAbiParam[] }>;
}

export function flattenAbi(abi: ClassInfoAbiItem[] | null): FlattenedAbi {
  const functions: FlattenedAbi["functions"] = [];
  const events: FlattenedAbi["events"] = [];
  const structs: FlattenedAbi["structs"] = [];
  const enums: FlattenedAbi["enums"] = [];

  function walk(items: ClassInfoAbiItem[] | undefined): void {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      switch (item.type) {
        case "function":
        case "external":
        case "view":
          functions.push({
            name: item.name,
            kind: "function",
            inputs: item.inputs ?? [],
            outputs: item.outputs ?? [],
            stateMutability: item.state_mutability,
          });
          break;
        case "l1_handler":
          functions.push({
            name: item.name,
            kind: "l1_handler",
            inputs: item.inputs ?? [],
            outputs: item.outputs ?? [],
          });
          break;
        case "constructor":
          functions.push({
            name: item.name,
            kind: "constructor",
            inputs: item.inputs ?? [],
            outputs: item.outputs ?? [],
          });
          break;
        case "event":
          events.push({
            name: item.name,
            fields: item.members ?? item.inputs ?? [],
          });
          break;
        case "struct":
          if (item.members && item.members.length > 0) {
            structs.push({ name: item.name, fields: item.members });
          }
          break;
        case "enum":
          if (item.variants && item.variants.length > 0) {
            enums.push({ name: item.name, variants: item.variants });
          }
          break;
        case "interface":
        case "impl":
          walk(item.items);
          break;
        default:
          break;
      }
    }
  }
  walk(abi ?? undefined);
  return { functions, events, structs, enums };
}

function shortenName(name: string, max = 64): string {
  if (name.length <= max) return name;
  const tail = name.split("::").pop() ?? name;
  if (tail.length <= max) return tail;
  return `${name.slice(0, max - 1)}…`;
}

export function classExplorerVoyager(
  classHash: string,
  chainId: string | null | undefined,
): string {
  const lower = (chainId || "").toLowerCase();
  const host =
    lower === "0x534e5f5345504f4c4941" ||
    lower === "0x534e5f494e544547524154494f4e5f5345504f4c4941"
      ? "sepolia.voyager.online"
      : "voyager.online";
  return `https://${host}/class/${classHash}`;
}

export function SourcePane({
  frame,
  chainId,
  defaultTab = "functions",
}: {
  frame: FunctionInvocation | null;
  chainId?: string | null;
  defaultTab?: "functions" | "events" | "types" | "source";
}) {
  const classHash = frame?.classHash || null;
  const network = chainIdToStarknetNetwork(chainId);
  const cairoSource = useCairoSource(classHash, network);
  const [info, setInfo] = useState<ClassInfo | null>(() =>
    classHash ? classInfoCache.get(classInfoCacheKey(classHash, network)) ?? null : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"functions" | "events" | "types" | "source">(
    defaultTab,
  );
  useEffect(() => {
    const pending = PENDING_SOURCE_INTENT.current;
    if (
      pending &&
      classHash &&
      pending.classHash.toLowerCase() === classHash.toLowerCase()
    ) {
      setTab("source");
      PENDING_SOURCE_INTENT.current = null;
    } else {
      setTab(defaultTab);
    }
  }, [classHash, defaultTab]);
  useEffect(() => {
    const handle = (target: { classHash: string }) => {
      if (
        classHash &&
        target.classHash.toLowerCase() === classHash.toLowerCase()
      ) {
        setTab("source");
      }
    };
    SOURCE_PANE_HANDLE.current = handle;
    return () => {
      if (SOURCE_PANE_HANDLE.current === handle) {
        SOURCE_PANE_HANDLE.current = null;
      }
    };
  }, [classHash]);

  useEffect(() => {
    if (!classHash) {
      setInfo(null);
      setError(null);
      setLoading(false);
      return;
    }
    const cached = classInfoCache.get(classInfoCacheKey(classHash, network));
    if (cached) {
      setInfo(cached);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInfo(null);
    fetchClassInfo(classHash, network)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classHash, network]);

  const flattened = useMemo(() => flattenAbi(info?.abi ?? null), [info]);

  if (!frame) {
    return (
      <Card className="p-4 gap-3">
        <div className="text-xs uppercase text-muted-foreground">Cairo source</div>
        <div className="rounded bg-background border border-border p-3 text-xs text-muted-foreground leading-relaxed">
          Select a frame in the call tree to view its source.
        </div>
      </Card>
    );
  }

  if (!classHash) {
    return (
      <Card className="p-4 gap-3">
        <div className="text-xs uppercase text-muted-foreground">Cairo source</div>
        <div className="rounded bg-background border border-border p-3 text-xs text-muted-foreground leading-relaxed">
          Selected frame has no class hash (likely a revert before class load).
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 gap-3" data-testid="source-pane">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs uppercase text-muted-foreground">Cairo source</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {info ? (
            <>
              <Badge variant="outline" className="text-[10px] uppercase">
                {info.isCairo1 ? "Cairo 1" : "Cairo 0"}
              </Badge>
              {info.contractClassVersion ? (
                <Badge variant="outline" className="text-[10px]">
                  v{info.contractClassVersion}
                </Badge>
              ) : null}
              {info.isCairo1 && info.sierraProgram ? (
                <Badge variant="outline" className="text-[10px]">
                  {info.sierraProgram.length.toLocaleString()} felts
                </Badge>
              ) : null}
              {!info.isCairo1 && info.program ? (
                <Badge variant="outline" className="text-[10px]">
                  {info.program.encodedLength.toLocaleString()} bytes
                </Badge>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

        <div className="starknet-source-class-row flex items-center gap-2 text-xs flex-wrap">
        <span className="text-muted-foreground">class</span>
        <span className="font-mono text-[11px]" title={classHash}>
          {shortHex(classHash)}
        </span>
        <CopyButton value={classHash} />
        <a
          href={classExplorerVoyager(classHash, chainId)}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowSquareOut size={12} />
          Voyager
        </a>
      </div>

      {loading ? (
        <div className="rounded bg-background border border-border p-3 text-xs text-muted-foreground">
          Loading class…
        </div>
      ) : error ? (
        <div className="rounded bg-background border border-border p-3 text-xs text-destructive break-all">
          Failed to load class: {error}
        </div>
      ) : info ? (
        <ClassInfoTabs
          key={`${classHash}:${frame.entryPointSelector}`}
          info={info}
          flattened={flattened}
          activeSelector={frame.entryPointSelector}
          activeFunctionName={selectorName(frame)}
          cairoSource={cairoSource.data}
          cairoSourceLoading={cairoSource.loading}
          cairoSourceError={cairoSource.error}
          tab={tab}
          onTabChange={setTab}
        />
      ) : null}
    </Card>
  );
}

export function ClassInfoTabs({
  info,
  flattened,
  activeSelector,
  activeFunctionName,
  cairoSource,
  cairoSourceLoading,
  cairoSourceError,
  tab,
  onTabChange,
}: {
  info: ClassInfo;
  flattened: FlattenedAbi;
  activeSelector: string;
  activeFunctionName?: string | null;
  cairoSource: CairoSourceResponse | null;
  cairoSourceLoading: boolean;
  cairoSourceError: string | null;
  tab?: "functions" | "events" | "types" | "source";
  onTabChange?: (next: "functions" | "events" | "types" | "source") => void;
}) {
  const totalEntryPoints =
    info.entryPoints.external.length +
    info.entryPoints.l1Handler.length +
    info.entryPoints.constructor.length;

  const [internalTab, setInternalTab] = useState<
    "functions" | "events" | "types" | "source"
  >("functions");
  const isControlled = tab !== undefined && onTabChange !== undefined;
  const effectiveTab = isControlled ? tab! : internalTab;
  const handleTabChange = (
    next: "functions" | "events" | "types" | "source",
  ) => {
    if (!isControlled) setInternalTab(next);
    onTabChange?.(next);
  };

  return (
    <Tabs
      value={effectiveTab}
      onValueChange={(v) =>
        handleTabChange(v as "functions" | "events" | "types" | "source")
      }
      className="gap-2"
    >
      <TabsList
        className="starknet-class-info-tabs h-8"
        onClick={(e) => e.stopPropagation()}
      >
        <TabsTrigger value="functions" className="text-[11px] px-2" data-testid="class-info-tab-functions">
          Functions ({totalEntryPoints})
        </TabsTrigger>
        <TabsTrigger value="events" className="text-[11px] px-2" data-testid="class-info-tab-events">
          Events ({flattened.events.length})
        </TabsTrigger>
        <TabsTrigger value="types" className="text-[11px] px-2" data-testid="class-info-tab-types">
          Types ({flattened.structs.length + flattened.enums.length})
        </TabsTrigger>
        <TabsTrigger value="source" className="text-[11px] px-2" data-testid="class-info-tab-source">
          Source ({cairoSource?.files.length ?? 0})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="functions" className="mt-1">
        <FunctionList
          info={info}
          flattened={flattened}
          activeSelector={activeSelector}
        />
      </TabsContent>

      <TabsContent value="events" className="mt-1">
        <EventList events={flattened.events} />
      </TabsContent>

      <TabsContent value="types" className="mt-1">
        <TypeList structs={flattened.structs} enums={flattened.enums} />
      </TabsContent>

      <TabsContent value="source" className="mt-1">
        <InlineCairoSource
          source={cairoSource}
          loading={cairoSourceLoading}
          error={cairoSourceError}
          activeFunctionName={activeFunctionName}
        />
      </TabsContent>
    </Tabs>
  );
}

function InlineCairoSource({
  source,
  loading,
  error,
  activeFunctionName,
}: {
  source: CairoSourceResponse | null;
  loading: boolean;
  error: string | null;
  activeFunctionName?: string | null;
}) {
  if (loading) {
    return (
      <div className="rounded border border-border bg-background p-3 text-xs text-muted-foreground">
        Loading verified Cairo source…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded border border-border bg-background p-3 text-xs text-destructive break-all">
        Failed to load Cairo source: {error}
      </div>
    );
  }
  if (!source || !source.verified || source.files.length === 0) {
    return (
      <div className="rounded border border-border bg-background p-3 text-xs text-muted-foreground">
        Verified Cairo source is not available for this class.
      </div>
    );
  }
  const target = resolveCairoSourceTarget(source, activeFunctionName);
  return (
    <div className="rounded border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[11px]">
        <span className="font-mono truncate" title={target.file.path}>
          {target.file.path}
        </span>
        <div className="flex items-center gap-1.5">
          {target.functionFound && activeFunctionName ? (
            <Badge variant="info" className="text-[10px]">
              {activeFunctionName}
            </Badge>
          ) : null}
          <Badge variant="outline" className="text-[10px]">
            verified
          </Badge>
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <ColorizedSnippet
          sourceContent={target.file.content}
          highlightLine={target.line}
          contextLines={target.functionFound ? 18 : 30}
          language="cairo"
        />
      </div>
    </div>
  );
}

export function resolveCairoSourceTarget(
  source: CairoSourceResponse,
  activeFunctionName: string | null | undefined,
): { file: CairoSourceResponse["files"][number]; line: number; functionFound: boolean } {
  const files = source.files.length > 0 ? source.files : [{ path: "", content: "" }];
  const mainFile =
    files.find((f) => f.path === source.mainFile) ??
    files.find((f) => f.path.endsWith(".cairo")) ??
    files[0];

  const functionName = activeFunctionName?.trim();
  if (!functionName) {
    return { file: mainFile, line: 1, functionFound: false };
  }

  type FileMatch = {
    file: CairoSourceResponse["files"][number];
    line: number;
    isMethod: boolean;
    inImpl: boolean;
    hasBody: boolean;
  };
  const all: FileMatch[] = [];
  for (const file of files) {
    const fileMatches = findCairoFunctionMatches(file.content, functionName);
    for (const m of fileMatches) {
      all.push({
        file,
        line: m.line,
        isMethod: m.isMethod,
        inImpl: m.inImpl,
        hasBody: m.hasBody,
      });
    }
  }

  if (all.length === 0) {
    return { file: mainFile, line: 1, functionFound: false };
  }
  const score = (m: FileMatch) =>
    (m.hasBody ? 2 : 0) + (m.inImpl ? 1 : 0) + (m.isMethod ? 1 : 0);
  all.sort((a, b) => score(b) - score(a));
  const best = all[0];
  return { file: best.file, line: best.line, functionFound: true };
}

interface CairoFunctionMatch {
  line: number;
  isMethod: boolean;
  inImpl: boolean;
  hasBody: boolean;
}

function findCairoFunctionMatches(
  content: string,
  functionName: string,
): CairoFunctionMatch[] {
  const shortName = functionName.split("::").pop() ?? functionName;
  const escaped = escapeRegex(shortName);
  const fnRegex = new RegExp(`\\b(?:fn|func)\\s+${escaped}\\b`);
  const lines = content.split("\n");

  const cleaned: string[] = [];
  let inBlock = false;
  for (const raw of lines) {
    let out = "";
    let i = 0;
    while (i < raw.length) {
      if (inBlock) {
        const close = raw.indexOf("*/", i);
        if (close === -1) {
          i = raw.length;
          break;
        }
        i = close + 2;
        inBlock = false;
        continue;
      }
      const ch = raw[i];
      const next = raw[i + 1];
      if (ch === "/" && next === "/") break;
      if (ch === "/" && next === "*") {
        inBlock = true;
        i += 2;
        continue;
      }
      out += ch;
      i++;
    }
    cleaned.push(out);
  }

  const matches: CairoFunctionMatch[] = [];
  let depth = 0;
  const implOpenStack: number[] = [];
  let pendingImpl = false;
  for (let i = 0; i < cleaned.length; i++) {
    const line = cleaned[i];
    if (/\b(?:pub\s+)?impl\b/.test(line) && !line.includes(";")) {
      if (line.includes("{")) {
        implOpenStack.push(depth);
      } else {
        pendingImpl = true;
      }
    } else if (pendingImpl) {
      if (line.includes("{")) {
        implOpenStack.push(depth);
        pendingImpl = false;
      } else if (line.includes(";")) {
        pendingImpl = false;
      }
    }
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (
          implOpenStack.length > 0 &&
          depth <= implOpenStack[implOpenStack.length - 1]
        ) {
          implOpenStack.pop();
        }
      }
    }
    if (!fnRegex.test(line)) continue;
    const sigChunk = cleaned
      .slice(i, Math.min(i + 6, cleaned.length))
      .join(" ");
    const isMethod = /\b(?:ref\s+|mut\s+)?self\s*:/.test(sigChunk);
    const semi = sigChunk.indexOf(";");
    const brace = sigChunk.indexOf("{");
    const hasBody =
      brace !== -1 && (semi === -1 || brace < semi);
    matches.push({
      line: i + 1,
      isMethod,
      inImpl: implOpenStack.length > 0,
      hasBody,
    });
  }

  return matches;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function FunctionList({
  info,
  flattened,
  activeSelector,
}: {
  info: ClassInfo;
  flattened: FlattenedAbi;
  activeSelector: string;
}) {
  const externalAbi = flattened.functions.filter((f) => f.kind === "function");
  const constructorAbi = flattened.functions.filter((f) => f.kind === "constructor");
  const l1HandlerAbi = flattened.functions.filter((f) => f.kind === "l1_handler");

  type Row = {
    selector: string;
    sig?: { name: string; inputs: ClassInfoAbiParam[]; outputs: ClassInfoAbiParam[] };
    kind: "external" | "l1_handler" | "constructor";
  };

  const rows: Row[] = [];
  info.entryPoints.external.forEach((ep, idx) => {
    rows.push({
      selector: ep.selector,
      sig: externalAbi[idx]
        ? {
            name: externalAbi[idx].name,
            inputs: externalAbi[idx].inputs,
            outputs: externalAbi[idx].outputs,
          }
        : undefined,
      kind: "external",
    });
  });
  info.entryPoints.l1Handler.forEach((ep, idx) => {
    rows.push({
      selector: ep.selector,
      sig: l1HandlerAbi[idx]
        ? {
            name: l1HandlerAbi[idx].name,
            inputs: l1HandlerAbi[idx].inputs,
            outputs: l1HandlerAbi[idx].outputs,
          }
        : undefined,
      kind: "l1_handler",
    });
  });
  info.entryPoints.constructor.forEach((ep, idx) => {
    rows.push({
      selector: ep.selector,
      sig: constructorAbi[idx]
        ? {
            name: constructorAbi[idx].name,
            inputs: constructorAbi[idx].inputs,
            outputs: constructorAbi[idx].outputs,
          }
        : undefined,
      kind: "constructor",
    });
  });

  if (rows.length === 0) {
    return (
      <div className="rounded bg-background border border-border p-3 text-xs text-muted-foreground">
        No entry points exposed.
      </div>
    );
  }

  return (
    <div className="rounded bg-background border border-border max-h-80 overflow-auto">
      <ul className="divide-y divide-border">
        {rows.map((row, i) => {
          const active = felthexEq(row.selector, activeSelector);
          const inputs = row.sig?.inputs ?? [];
          const outputs = row.sig?.outputs ?? [];
          return (
            <li
              key={`${row.selector}-${i}`}
              className={`px-2 py-1.5 text-xs ${
                active ? "bg-muted/60 border-l-2 border-foreground" : ""
              }`}
              data-testid={active ? "active-entry-point" : undefined}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[11px] truncate">
                  {row.sig ? row.sig.name : "<selector only>"}
                </span>
                <Badge variant="outline" className="text-[9px] uppercase shrink-0">
                  {row.kind === "external" ? "ext" : row.kind === "l1_handler" ? "l1" : "ctor"}
                </Badge>
                {active ? (
                  <Badge variant="outline" className="text-[9px] uppercase shrink-0">
                    selected
                  </Badge>
                ) : null}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground/80 mt-0.5 break-all">
                {shortHex(row.selector, 14, 8)}
              </div>
              {inputs.length || outputs.length ? (
                <div className="font-mono text-[10px] mt-1 space-y-0.5">
                  {inputs.length ? (
                    <div>
                      <span className="text-muted-foreground">in </span>
                      <span>
                        ({inputs
                          .map((p) => `${p.name}: ${shortenName(p.type)}`)
                          .join(", ")})
                      </span>
                    </div>
                  ) : null}
                  {outputs.length ? (
                    <div>
                      <span className="text-muted-foreground">out</span>{" "}
                      <span>
                        ({outputs
                          .map((p) => (p.name ? `${p.name}: ` : "") + shortenName(p.type))
                          .join(", ")})
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EventList({
  events,
}: {
  events: FlattenedAbi["events"];
}) {
  if (events.length === 0) {
    return (
      <div className="rounded bg-background border border-border p-3 text-xs text-muted-foreground">
        No events declared.
      </div>
    );
  }
  return (
    <div className="rounded bg-background border border-border max-h-80 overflow-auto">
      <ul className="divide-y divide-border">
        {events.map((ev, i) => (
          <li key={`${ev.name}-${i}`} className="px-2 py-1.5 text-xs">
            <div className="font-mono text-[11px] truncate" title={ev.name}>
              {shortenName(ev.name)}
            </div>
            {ev.fields.length ? (
              <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                {ev.fields
                  .map((p) => `${p.name}: ${shortenName(p.type)}`)
                  .join(", ")}
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground/70">no fields</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TypeList({
  structs,
  enums,
}: {
  structs: FlattenedAbi["structs"];
  enums: FlattenedAbi["enums"];
}) {
  if (structs.length === 0 && enums.length === 0) {
    return (
      <div className="rounded bg-background border border-border p-3 text-xs text-muted-foreground">
        No struct or enum types exposed.
      </div>
    );
  }
  return (
    <div className="rounded bg-background border border-border max-h-80 overflow-auto divide-y divide-border">
      {structs.length ? (
        <div className="px-2 py-1.5">
          <div className="text-[10px] uppercase text-muted-foreground mb-1">Structs</div>
          <ul className="space-y-1.5">
            {structs.map((s, i) => (
              <li key={`s-${s.name}-${i}`} className="text-xs">
                <div className="font-mono text-[11px] truncate" title={s.name}>
                  {shortenName(s.name)}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {s.fields.map((f) => `${f.name}: ${shortenName(f.type)}`).join(", ")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {enums.length ? (
        <div className="px-2 py-1.5">
          <div className="text-[10px] uppercase text-muted-foreground mb-1">Enums</div>
          <ul className="space-y-1.5">
            {enums.map((e, i) => (
              <li key={`e-${e.name}-${i}`} className="text-xs">
                <div className="font-mono text-[11px] truncate" title={e.name}>
                  {shortenName(e.name)}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {e.variants.map((v) => `${v.name}${v.type ? `(${shortenName(v.type)})` : ""}`).join(" | ")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CopyFrameLinkButton({
  frame,
  frames,
}: {
  frame: FunctionInvocation;
  frames: FunctionInvocation[];
}) {
  const [copied, setCopied] = useState(false);
  const idx = frames.indexOf(frame);
  const onClick = async () => {
    if (idx < 0 || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.hash = `frame=${idx}`;
    try {
      await copyTextToClipboard(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      icon={copied ? <Check size={14} /> : <LinkSimple size={14} />}
      onClick={onClick}
      disabled={idx < 0}
      aria-label={copied ? "Copied frame link" : "Copy frame link"}
      data-testid="copy-frame-link"
    >
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

function CopyFrameJsonButton({ frame }: { frame: FunctionInvocation }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    const json = JSON.stringify(frame, null, 2);
    try {
      await copyTextToClipboard(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      icon={copied ? <Check size={14} /> : <Code size={14} />}
      onClick={onClick}
      aria-label={copied ? "Copied frame JSON" : "Copy frame JSON"}
      data-testid="copy-frame-json"
    >
      {copied ? "Copied" : "Copy JSON"}
    </Button>
  );
}

function FrameBreadcrumb({
  frame,
  parentMap,
  onSelect,
}: {
  frame: FunctionInvocation;
  parentMap: Map<FunctionInvocation, FunctionInvocation | null>;
  onSelect: (f: FunctionInvocation) => void;
}) {
  const path: FunctionInvocation[] = [];
  let cur: FunctionInvocation | null | undefined = frame;
  let safety = 0;
  while (cur && safety++ < 32) {
    path.unshift(cur);
    cur = parentMap.get(cur);
  }
  if (path.length <= 1) return null;
  return (
    <div
      className="flex items-center gap-1 flex-wrap text-[11px] text-muted-foreground"
      data-testid="frame-breadcrumb"
    >
      {path.map((f, i) => {
        const sel = selectorName(f) || shortHex(f.entryPointSelector);
        const isLast = i === path.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground/60">›</span>}
            {isLast ? (
              <span className="font-mono text-foreground">{sel}</span>
            ) : (
              <button
                type="button"
                onClick={() => onSelect(f)}
                className="font-mono hover:text-foreground hover:underline"
              >
                {sel}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

const TOGGLE_STORAGE_PREFIX = "hexkit:starknet-sim:calltree:";

function usePersistedToggle(
  key: string,
  defaultValue: boolean,
): [boolean, (next: boolean) => void] {
  const storageKey = `${TOGGLE_STORAGE_PREFIX}${key}`;
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) return defaultValue;
      return raw === "1";
    } catch {
      return defaultValue;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, value ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [storageKey, value]);
  return [value, setValue];
}

function FrameContractLabel({
  address,
  staticLabel,
  network,
}: {
  address: string;
  staticLabel: string | null;
  network: StarknetNetwork;
}) {
  const { name: dynamicLabel } = useContractName(staticLabel ? null : address, network);
  const label = staticLabel ?? dynamicLabel;
  if (!label) return null;
  return <span className="font-mono text-success">{label}</span>;
}
