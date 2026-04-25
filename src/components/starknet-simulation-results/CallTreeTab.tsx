import { useEffect, useMemo, useState } from "react";
import {
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  Check,
  Code,
  LinkSimple,
  Sparkle,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contractExplorerLinks } from "@/components/starknet/explorerLinks";
import type { FunctionInvocation, SimulationResult } from "@/chains/starknet/simulatorTypes";
import {
  classLabel,
  contractLabel,
  frameLabel,
  countSubtree,
  eventName,
  selectorName,
  shortHex,
  stripSystemArgs,
  subtreeEventCount,
} from "./decoders";

interface Props {
  result: SimulationResult;
  frames: FunctionInvocation[];
  /** Frame → parent map; root-level frames (validate / execute / fee
   *  transfer) map to null. Used by FrameDetailPane to render the
   *  ancestor breadcrumb. */
  parentMap: Map<FunctionInvocation, FunctionInvocation | null>;
  /** Bridge chain ID — feeds Voyager / Starkscan contract links beside
   *  the selected frame's address. */
  chainId?: string | null;
  /** Cairo struct / enum registry — used by the typed calldata
   *  decoder to recursively expand composite parameter types. */
  types?: Record<string, import("@/chains/starknet/simulatorTypes").AbiTypeDef>;
  selectedFrame: FunctionInvocation | null;
  setSelectedFrame: (f: FunctionInvocation) => void;
  onExplainFrame?: (f: FunctionInvocation) => void;
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
}: Props) {
  // Toggle preferences persist across reloads — users settle into a
  // mode (strip syscall args, hide silent frames, etc) and rebuilding
  // that on every page load is needless friction. Filter stays local
  // because per-tx queries don't carry between traces.
  const [stripSys, setStripSys] = usePersistedToggle("stripSys", true);
  const [onlyEvents, setOnlyEvents] = usePersistedToggle("onlyEvents", false);
  const [showResources, setShowResources] = usePersistedToggle(
    "showResources",
    true,
  );
  // Voyager hides validate / fee_transfer by default and shows only the
  // user-facing execute body; matching that since 99% of the time
  // that's what the user is here to look at.
  const [executeOnly, setExecuteOnly] = usePersistedToggle("executeOnly", true);
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

  // executeOnly hides validate / fee_transfer when there's an execute
  // body to look at. Reverted txs can leave executeInvocation null
  // (fault during validate); fall through to the full set so we don't
  // render an empty tree.
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <Card className="lg:col-span-7 p-4 gap-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Call tree</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {frames.length} frames · max depth {stats.maxDepth} · {stats.totalEvents} events
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs flex-wrap justify-end">
            <Input
              type="search"
              placeholder="filter selector / contract…"
              className="w-44 h-8 text-xs"
              value={filter}
              onChange={(e) => setFilter(e.target.value.toLowerCase().trim())}
            />
            <ToggleLabel id="strip-sys" checked={stripSys} onChange={setStripSys}>
              strip sys args
            </ToggleLabel>
            <ToggleLabel id="only-events" checked={onlyEvents} onChange={setOnlyEvents}>
              only w/ events
            </ToggleLabel>
            <ToggleLabel id="resource-bars" checked={showResources} onChange={setShowResources}>
              resource bars
            </ToggleLabel>
            <ToggleLabel id="execute-only" checked={executeOnly} onChange={setExecuteOnly}>
              execute only
            </ToggleLabel>
          </div>
        </div>

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
                  selectedFrame={selectedFrame}
                  onSelect={setSelectedFrame}
                />
              </div>
            ) : null,
          )}
        </div>
      </Card>

      {/* Right rail: Frame detail + source pane */}
      <div className="lg:col-span-5 space-y-4">
        <FrameDetailPane
          frame={selectedFrame}
          frames={frames}
          parentMap={parentMap}
          chainId={chainId}
          types={types}
          onSelect={setSelectedFrame}
          stripSys={stripSys}
          onExplain={onExplainFrame}
        />
        <SourcePane frame={selectedFrame} />
      </div>
    </div>
  );
}

function ToggleLabel({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(Boolean(v))}
      />
      <Label htmlFor={id} className="text-xs text-muted-foreground cursor-pointer">
        {children}
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
  selectedFrame: FunctionInvocation | null;
  onSelect: (f: FunctionInvocation) => void;
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
    selectedFrame,
    onSelect,
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

  const sel = selectorName(ci);
  const labelKnown = frameLabel(ci);
  const labelIsAccount = labelKnown === "Account";
  const isLib = ci.callType === "Delegate" || ci.callType === "Library";
  const evtCount = subtreeEventCount(ci);
  const calldata = stripSys ? stripSystemArgs(ci.calldata) : ci.calldata;
  const subtreeSize = countSubtree(ci);
  const sharePct = Math.min(100, Math.round((subtreeSize / totalFrames) * 100));
  const fnum = frames.indexOf(ci);
  const isSelected = ci === selectedFrame;
  const hasChildren = (ci.calls || []).length > 0;

  const barColor =
    sharePct > 50 ? "bg-destructive" : sharePct > 20 ? "bg-warning" : "bg-success";

  return (
    <div className={"rounded " + (depth ? "ml-3 border-l border-border pl-2" : "")}>
      <button
        type="button"
        onClick={() => {
          if (hasChildren) setExpanded((v) => !v);
          onSelect(ci);
        }}
        className={
          "w-full flex items-center gap-2 py-1 rounded px-1 text-left transition-colors " +
          (isSelected
            ? "bg-accent ring-1 ring-ring"
            : "hover:bg-muted/40")
        }
        aria-expanded={expanded}
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
        <Badge variant={isLib ? "accent" : "success"} size="sm">
          {ci.callType}
        </Badge>
        {sel ? (
          <span className="font-mono text-foreground">
            {sel}
            <span className="text-muted-foreground text-[10px] ml-0.5">()</span>
          </span>
        ) : (
          <span className="font-mono text-muted-foreground" title={ci.entryPointSelector}>
            {shortHex(ci.entryPointSelector)}
          </span>
        )}
        <span className="text-muted-foreground text-xs">on</span>
        {labelKnown ? (
          <>
            <span
              className={`font-mono text-xs ${
                labelIsAccount ? "text-info" : "text-success"
              }`}
            >
              {labelKnown}
            </span>
            <span className="font-mono text-muted-foreground text-[10px]">
              {shortHex(ci.contractAddress)}
            </span>
          </>
        ) : (
          <span className="font-mono text-foreground text-xs">
            {shortHex(ci.contractAddress)}
          </span>
        )}
        {evtCount ? (
          <Badge variant="info" size="sm">
            {evtCount} evt
          </Badge>
        ) : null}
        {ci.calls.length ? (
          <span className="text-muted-foreground text-[10px]">{ci.calls.length}↳</span>
        ) : null}
        {showResources ? (
          <span
            className="ml-auto flex items-center gap-1 text-[10px] font-mono text-muted-foreground"
            title={`${subtreeSize} of ${totalFrames} frames`}
          >
            <span className="w-16 h-1.5 bg-muted rounded overflow-hidden">
              <span
                className={`block h-1.5 ${barColor}`}
                style={{ width: `${Math.max(2, sharePct)}%` }}
              />
            </span>
            {sharePct}%
          </span>
        ) : null}
      </button>
      {expanded && (
        <>
          <div className="pl-2 mt-1 space-y-1 text-xs text-muted-foreground">
            <div>
              <span>calldata:</span>{" "}
              <span className="font-mono">
                [
                {calldata.slice(0, 4).map((f) => shortHex(f)).join(", ")}
                {calldata.length > 4 && (
                  <span className="text-muted-foreground/70">, …+{calldata.length - 4}</span>
                )}
                ]
              </span>
            </div>
            <div>
              <span>retdata:</span>{" "}
              <span className="font-mono">
                {(ci.result || []).length === 0 ? (
                  <span className="text-muted-foreground/70">empty</span>
                ) : (
                  <>
                    [
                    {(ci.result || []).slice(0, 4).map((f) => shortHex(f)).join(", ")}
                    {(ci.result || []).length > 4 && (
                      <span className="text-muted-foreground/70">
                        , …+{(ci.result || []).length - 4}
                      </span>
                    )}
                    ]
                  </>
                )}
              </span>
            </div>
          </div>
          {hasChildren && (
            <div className="mt-1 space-y-0.5">
              {ci.calls.map((c, i) => (
                <CallNode key={i} {...props} ci={c} depth={depth + 1} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FrameDetailPane({
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
  /** Walk-order frame array, used to compute the index for the
   *  shareable #frame=N deep-link copy button. */
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
  return (
    <Card className="p-4 gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs uppercase text-muted-foreground">Selected frame</div>
        <div className="flex items-center gap-2">
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
      <div className="text-sm space-y-2">
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
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-muted-foreground">contract:</span>{" "}
            {lbl ? <span className="font-mono text-success">{lbl}</span> : null}{" "}
            <span className="font-mono text-foreground break-all">{frame.contractAddress}</span>
            <CopyButton value={frame.contractAddress} className="h-4 w-4" iconSize={10} />
            {(() => {
              const links = contractExplorerLinks(frame.contractAddress, chainId);
              return (
                <>
                  <a
                    href={links.voyager}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-foreground hover:underline"
                    data-testid="contract-link-voyager"
                  >
                    Voyager
                    <ArrowSquareOut size={10} />
                  </a>
                  <a
                    href={links.starkscan}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-0.5 text-[10px] text-foreground hover:underline"
                    data-testid="contract-link-starkscan"
                  >
                    Starkscan
                    <ArrowSquareOut size={10} />
                  </a>
                </>
              );
            })()}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-muted-foreground">classHash:</span>{" "}
            {(() => {
              const cls = classLabel(frame.classHash);
              return cls ? (
                <span className="font-mono text-success">{cls}</span>
              ) : null;
            })()}
            <span className="font-mono text-foreground break-all">{frame.classHash || "—"}</span>
            {frame.classHash && (
              <CopyButton value={frame.classHash} className="h-4 w-4" iconSize={10} />
            )}
          </div>
          <div>
            <span className="text-muted-foreground">caller:</span>{" "}
            <span className="font-mono text-foreground">{shortHex(frame.callerAddress)}</span>
          </div>
        </div>

        {/* Voyager-style typed-input block when the bridge sent a
            decoded ABI; otherwise fall back to the raw felt array. */}
        {frame.decodedFunctionAbi && frame.decodedFunctionAbi.inputs.length > 0 ? (
          <TypedParamBlock
            label="INPUT"
            params={frame.decodedFunctionAbi.inputs}
            felts={calldata}
            types={types}
          />
        ) : (
          <DataBlock
            label={`calldata (${calldata.length} felt${calldata.length === 1 ? "" : "s"})`}
            items={calldata}
          />
        )}
        {frame.decodedFunctionAbi && frame.decodedFunctionAbi.outputs.length > 0 ? (
          <TypedParamBlock
            label="OUTPUT"
            params={frame.decodedFunctionAbi.outputs}
            felts={frame.result || []}
            types={types}
          />
        ) : (
          <DataBlock
            label={`retdata (${(frame.result || []).length} felt${(frame.result || []).length === 1 ? "" : "s"})`}
            items={frame.result || []}
          />
        )}

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

/** Cairo-aware typed-param renderer. Pairs ABI inputs with their
 *  consumed slice of the calldata felt array — primitives consume one
 *  felt each, u256 / pairs of felts collapse to a single decimal value,
 *  arrays consume `[len, …]` and render as a Span<…> of the next len
 *  felts. Anything unknown gets shown as an opaque fallback so we
 *  never hide data. */
function TypedParamBlock({
  label,
  params,
  felts,
  types,
}: {
  label: string;
  params: import("@/chains/starknet/simulatorTypes").AbiParam[];
  felts: string[];
  types?: Record<string, import("@/chains/starknet/simulatorTypes").AbiTypeDef>;
}) {
  // Voyager-style Hex / Dec / Text format toggle. Persists across the
  // session so a user who prefers decimal once gets it for every
  // frame.
  const [valueFormat, setValueFormat] = useState<ValueFormat>(() => {
    if (typeof window === "undefined") return "hex";
    try {
      const raw = window.localStorage.getItem("hexkit:starknet-sim:valueFormat");
      if (raw === "dec" || raw === "text") return raw;
    } catch {/* fall through */}
    return "hex";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("hexkit:starknet-sim:valueFormat", valueFormat);
    } catch {/* quota — preference just won't persist */}
  }, [valueFormat]);

  const rows: Array<{ name: string; type: string; rendered: React.ReactNode; raw: string }> = [];
  let i = 0;
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
  // If we consumed less than the felt array (e.g. unknown layout) tail
  // the rest as "extra" so nothing is hidden.
  const tail = felts.slice(i);
  return (
    <Card className="p-2 gap-1.5 bg-background">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
        <ValueFormatToggle value={valueFormat} onChange={setValueFormat} />
      </div>
      <div className="text-xs space-y-1.5">
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
      </div>
    </Card>
  );
}

type ValueFormat = "hex" | "dec" | "text";

/** Voyager-style segmented control for the per-block value format. */
function ValueFormatToggle({
  value,
  onChange,
}: {
  value: ValueFormat;
  onChange: (v: ValueFormat) => void;
}) {
  const opts: ValueFormat[] = ["hex", "dec", "text"];
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          data-testid={`value-format-${o}`}
          className={`px-1.5 py-0.5 text-[9px] uppercase ${
            value === o
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          } ${o === "dec" || o === "text" ? "border-l border-border" : ""}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Re-render a single felt value in the user-chosen base. Hex stays
 *  as-is; dec converts via BigInt; text decodes as ASCII when each
 *  byte is printable (Cairo's `'string'` short-strings are felts of
 *  ASCII bytes). Falls back to hex for non-printable values. */
function formatFelt(hex: string, fmt: ValueFormat): string {
  if (fmt === "hex") return hex;
  let n: bigint;
  try {
    n = BigInt(hex);
  } catch {
    return hex;
  }
  if (fmt === "dec") return n.toString();
  // text — only decode when every byte is printable ASCII (>= 0x20,
  // < 0x7f). Otherwise show hex. Useful for ABI selectors / session-
  // token bytes / Cairo short strings, noisy for everything else.
  if (n === 0n) return "''";
  let bytes: number[] = [];
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

/** Per-Cairo-type recursive felt consumer. Walks the bridge's type
 *  registry so structs, enums, and arrays of any depth get their
 *  proper field/variant breakdown rendered as nested rows. Recursion
 *  capped at depth 8 + array length 64 to keep accidental
 *  self-referential type loops from blowing the stack or the DOM. */
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
  // u256 = (low, high) — render as decimal big-int.
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
  // bool — single felt (0 or 1).
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
  // Array<T> / Span<T> — len felt followed by N items. Recurse into
  // the inner type so an array of structs renders as N expanded
  // structs rather than a flat felt list.
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
  // Tuple — `(T, U, …)` — consume each component sequentially.
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
  // Struct from the bridge's type registry — recurse into each field.
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
  // Enum — Cairo enums are emitted as (variant_index, payload_felts).
  // The actual layout depends on the variant; we conservatively show
  // the discriminator and one felt of payload. Without the variant
  // type-aware payload size, deeper expansion would mis-align.
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
  // Default: one felt, render with the user's preferred format.
  const v = felts[i] ?? "—";
  const formatted = v === "—" ? v : formatFelt(v, fmt);
  return {
    rendered: <span className="text-foreground">{formatted}</span>,
    raw: v,
    next: i + 1,
  };
}

/** Split a Cairo tuple's inner args by top-level commas, respecting
 *  nested `<...>` / `(...)` so `(felt, Array::<u256>, (a, b))` splits
 *  into 3 components. */
function splitTupleArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "<" || c === "(") depth++;
    else if (c === ">" || c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (start < inner.length) out.push(inner.slice(start).trim());
  return out.filter(Boolean);
}

function DataBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <Card className="p-2 gap-1 bg-background">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono text-xs space-y-0.5 max-h-44 overflow-auto">
        {items.length === 0 ? (
          <div className="text-muted-foreground/70">empty</div>
        ) : (
          items.map((f, i) => (
            <div key={i}>
              <span className="text-muted-foreground">[{i}]</span> {f}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function SourcePane({ frame }: { frame: FunctionInvocation | null }) {
  return (
    <Card className="p-4 gap-3">
      <div className="text-xs uppercase text-muted-foreground">Cairo source</div>
      <div className="rounded bg-background border border-border p-3 text-xs text-muted-foreground leading-relaxed">
        {frame ? (
          <>
            Cairo source unavailable for{" "}
            <span className="font-mono">{shortHex(frame.classHash) || "unverified class"}</span>.
            Verified-class lookup + <span className="font-mono">cairo-annotations</span>{" "}
            plumbing land in a future bridge release.
          </>
        ) : (
          <>Select a frame in the call tree to view its source.</>
        )}
      </div>
    </Card>
  );
}

/** Copies the current page URL with `#frame=N` set to the selected
 *  frame's walk-order index. Pairs with the existing read side
 *  (StarknetSimulationResults' useEffect that restores #frame=N on
 *  mount) so a shared link drops the recipient straight onto the same
 *  selected frame. */
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
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", url.toString());
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
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this frame JSON", json);
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      icon={copied ? <Check size={14} /> : <Code size={14} />}
      onClick={onClick}
      data-testid="copy-frame-json"
    >
      {copied ? "Copied" : "Copy JSON"}
    </Button>
  );
}

/** Renders the ancestor chain root → … → selected as clickable
 *  selectors so a user can hop back up the call stack without
 *  scrolling the tree. The current frame is rendered last and not
 *  clickable (it's already selected). */
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
  // Walk parents up the chain. Cap at 32 hops as a safety belt — call
  // depth in practice rarely exceeds 8, this just guarantees the loop
  // terminates if the parent map is somehow circular.
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

/** localStorage-backed boolean toggle. Reads once on mount, writes on
 *  change. Falls back to `defaultValue` on parse failure or when the
 *  key is unset. Quota / disabled-storage failures are swallowed. */
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
      // Quota / private mode — preference just won't persist this session.
    }
  }, [storageKey, value]);
  return [value, setValue];
}
