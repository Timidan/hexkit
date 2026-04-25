import { useMemo, useState } from "react";
import type { FunctionInvocation, SimulationResult } from "@/chains/starknet/simulatorTypes";
import {
  selectorName,
  contractLabel,
  shortHex,
  countSubtree,
  subtreeEventCount,
  stripSystemArgs,
  eventName,
} from "./decoders";

interface Props {
  result: SimulationResult;
  frames: FunctionInvocation[];
  selectedFrame: FunctionInvocation | null;
  setSelectedFrame: (f: FunctionInvocation) => void;
  onExplainFrame?: (f: FunctionInvocation) => void;
}

export function CallTreeTab({ result, frames, selectedFrame, setSelectedFrame, onExplainFrame }: Props) {
  const [stripSys, setStripSys] = useState(true);
  const [onlyEvents, setOnlyEvents] = useState(false);
  const [showResources, setShowResources] = useState(true);
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
    for (const top of [result.validateInvocation, result.executeInvocation, result.feeTransferInvocation]) {
      if (top) walk(top);
    }
    return { totalEvents, maxDepth, uniqContracts: uniqContracts.size, uniqClasses: uniqClasses.size, decoded };
  }, [result]);

  const sections: Array<[string, FunctionInvocation | null, string]> = [
    ["__validate__", result.validateInvocation, "border-amber-800/60 bg-amber-950/20"],
    ["__execute__", result.executeInvocation, "border-emerald-800/60 bg-emerald-950/20"],
    ["__fee_transfer__", result.feeTransferInvocation, "border-zinc-800 bg-zinc-950/40"],
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-7 rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-zinc-500">Call tree</div>
            <div className="text-xs text-zinc-400 mt-0.5">
              {frames.length} frames · max depth {stats.maxDepth} · {stats.totalEvents} events
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400 flex-wrap justify-end">
            <input
              type="search"
              placeholder="filter selector / contract…"
              className="rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-xs w-44 focus:outline-none focus:border-zinc-500"
              value={filter}
              onChange={(e) => setFilter(e.target.value.toLowerCase().trim())}
            />
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={stripSys}
                onChange={(e) => setStripSys(e.target.checked)}
                className="accent-zinc-300"
              />
              strip sys args
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={onlyEvents}
                onChange={(e) => setOnlyEvents(e.target.checked)}
                className="accent-zinc-300"
              />
              only w/ events
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={showResources}
                onChange={(e) => setShowResources(e.target.checked)}
                className="accent-zinc-300"
              />
              resource bars
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Card label="unique contracts" value={stats.uniqContracts.toString()} />
          <Card label="unique classes" value={stats.uniqClasses.toString()} />
          <Card label="decoded selectors" value={`${stats.decoded} / ${frames.length}`} />
          <Card
            label="tx outcome"
            value={result.status}
            tone={result.status === "SUCCEEDED" ? "ok" : "err"}
          />
        </div>

        <div className="space-y-2 text-sm">
          {sections.map(([label, node, cls]) =>
            node ? (
              <div key={label} className={`rounded-md border ${cls} p-2`}>
                <div className="text-[11px] uppercase tracking-wide text-zinc-300 mb-1 flex items-center gap-2">
                  {label}
                  {subtreeEventCount(node) ? (
                    <span className="rounded-sm bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                      {subtreeEventCount(node)} events
                    </span>
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
      </div>

      {/* Right rail: Frame detail + source pane */}
      <div className="lg:col-span-5 space-y-4">
        <FrameDetailPane frame={selectedFrame} stripSys={stripSys} onExplain={onExplainFrame} />
        <SourcePane frame={selectedFrame} />
      </div>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "ok" | "err" }) {
  const c = tone === "ok" ? "text-emerald-300" : tone === "err" ? "text-red-300" : "text-zinc-200";
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
      <div className="text-[9px] uppercase text-zinc-500">{label}</div>
      <div className={`font-mono text-sm ${c}`}>{value}</div>
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
  const { ci, depth, frames, filter, onlyEvents, stripSys, showResources, totalFrames, selectedFrame, onSelect } = props;

  if (onlyEvents && subtreeEventCount(ci) === 0) return null;

  if (filter) {
    const matches = (n: FunctionInvocation): boolean => {
      const sn = (selectorName(n) || "").toLowerCase();
      const cl = (contractLabel(n.contractAddress) || "").toLowerCase();
      if (sn.includes(filter) || cl.includes(filter)) return true;
      if (n.contractAddress.toLowerCase().includes(filter)) return true;
      if (n.entryPointSelector.toLowerCase().includes(filter)) return true;
      return (n.calls || []).some(matches);
    };
    if (!matches(ci)) return null;
  }

  const sel = selectorName(ci);
  const labelKnown = contractLabel(ci.contractAddress);
  const isLib = ci.callType === "Delegate" || ci.callType === "Library";
  const evtCount = subtreeEventCount(ci);
  const calldata = stripSys ? stripSystemArgs(ci.calldata) : ci.calldata;
  const subtreeSize = countSubtree(ci);
  const sharePct = Math.min(100, Math.round((subtreeSize / totalFrames) * 100));
  const fnum = frames.indexOf(ci);
  const isSelected = ci === selectedFrame;

  const barColor = sharePct > 50 ? "bg-red-500" : sharePct > 20 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <details
      open={depth < 4}
      className={"rounded " + (depth ? "ml-3 border-l border-zinc-800 pl-2" : "")}
    >
      <summary
        className={
          "flex items-center gap-2 py-1 rounded px-1 cursor-pointer " +
          (isSelected ? "bg-blue-900/30 ring-1 ring-blue-700" : "hover:bg-zinc-800/40")
        }
        onClick={(e) => {
          e.preventDefault();
          onSelect(ci);
        }}
      >
        <span className="text-zinc-500 text-[10px] font-mono w-7">#{fnum >= 0 ? fnum : "?"}</span>
        <span
          className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${
            isLib
              ? "bg-violet-900/50 text-violet-300 border border-violet-700"
              : "bg-emerald-900/50 text-emerald-300 border border-emerald-700"
          }`}
        >
          {ci.callType}
        </span>
        {sel ? (
          <span className="font-mono text-zinc-100">
            {sel}
            <span className="text-zinc-500 text-[10px] ml-0.5">()</span>
          </span>
        ) : (
          <span className="font-mono text-zinc-400" title={ci.entryPointSelector}>
            {shortHex(ci.entryPointSelector)}
          </span>
        )}
        <span className="text-zinc-500 text-xs">on</span>
        {labelKnown ? (
          <>
            <span className="font-mono text-emerald-200 text-xs">{labelKnown}</span>
            <span className="font-mono text-zinc-500 text-[10px]">{shortHex(ci.contractAddress)}</span>
          </>
        ) : (
          <span className="font-mono text-zinc-300 text-xs">{shortHex(ci.contractAddress)}</span>
        )}
        {evtCount ? (
          <span className="rounded-sm bg-blue-900/40 border border-blue-700 px-1 py-0.5 text-[9px] text-blue-300">
            {evtCount} evt
          </span>
        ) : null}
        {ci.calls.length ? (
          <span className="text-zinc-500 text-[10px]">{ci.calls.length}↳</span>
        ) : null}
        {showResources ? (
          <span
            className="ml-auto flex items-center gap-1 text-[10px] font-mono text-zinc-500"
            title={`${subtreeSize} of ${totalFrames} frames`}
          >
            <span className="w-16 h-1.5 bg-zinc-800 rounded overflow-hidden">
              <span
                className={`block h-1.5 ${barColor}`}
                style={{ width: `${Math.max(2, sharePct)}%` }}
              />
            </span>
            {sharePct}%
          </span>
        ) : null}
      </summary>
      <div className="pl-2 mt-1 space-y-1 text-xs text-zinc-400">
        <div>
          <span className="text-zinc-500">calldata:</span>{" "}
          <span className="font-mono">
            [{calldata.slice(0, 4).map((f) => shortHex(f)).join(", ")}
            {calldata.length > 4 && (
              <span className="text-zinc-500">, …+{calldata.length - 4}</span>
            )}
            ]
          </span>
        </div>
        <div>
          <span className="text-zinc-500">retdata:</span>{" "}
          <span className="font-mono">
            {(ci.result || []).length === 0 ? (
              <span className="text-zinc-600">empty</span>
            ) : (
              <>
                [{(ci.result || []).slice(0, 4).map((f) => shortHex(f)).join(", ")}
                {(ci.result || []).length > 4 && (
                  <span className="text-zinc-500">, …+{(ci.result || []).length - 4}</span>
                )}
                ]
              </>
            )}
          </span>
        </div>
      </div>
      {ci.calls && ci.calls.length ? (
        <div className="mt-1 space-y-0.5">
          {ci.calls.map((c, i) => (
            <CallNode key={i} {...props} ci={c} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </details>
  );
}

function FrameDetailPane({
  frame,
  stripSys,
  onExplain,
}: {
  frame: FunctionInvocation | null;
  stripSys: boolean;
  onExplain?: (f: FunctionInvocation) => void;
}) {
  if (!frame) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="text-xs uppercase text-zinc-500 mb-2">Selected frame</div>
        <div className="text-xs text-zinc-500">
          Click a frame in the tree to see decoded calldata, retdata, and emitted events.
        </div>
      </div>
    );
  }
  const sel = selectorName(frame);
  const lbl = contractLabel(frame.contractAddress);
  const calldata = stripSys ? stripSystemArgs(frame.calldata) : frame.calldata;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase text-zinc-500">Selected frame</div>
        {onExplain && (
          <button
            className="rounded-md border border-blue-700 bg-blue-900/40 hover:bg-blue-900/60 px-2 py-0.5 text-[11px] text-blue-200"
            onClick={() => onExplain(frame)}
          >
            ✦ Explain →
          </button>
        )}
      </div>
      <div className="text-sm space-y-2">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span
            className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${
              frame.callType === "Call"
                ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700"
                : "bg-violet-900/50 text-violet-300 border border-violet-700"
            }`}
          >
            {frame.callType}
          </span>
          <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-300">
            {frame.entryPointType}
          </span>
          {sel ? (
            <span className="font-mono text-emerald-300 text-sm">{sel}()</span>
          ) : (
            <span className="font-mono text-zinc-300 text-xs">{shortHex(frame.entryPointSelector)}</span>
          )}
        </div>
        <div className="space-y-1 text-xs">
          <div>
            <span className="text-zinc-500">contract:</span>{" "}
            {lbl ? <span className="font-mono text-emerald-200">{lbl}</span> : null}{" "}
            <span className="font-mono text-zinc-200">{frame.contractAddress}</span>
          </div>
          <div>
            <span className="text-zinc-500">classHash:</span>{" "}
            <span className="font-mono text-zinc-300">{frame.classHash || "—"}</span>
          </div>
          <div>
            <span className="text-zinc-500">caller:</span>{" "}
            <span className="font-mono text-zinc-300">{shortHex(frame.callerAddress)}</span>
          </div>
        </div>

        <DataBlock label={`calldata (${calldata.length} felt${calldata.length === 1 ? "" : "s"})`} items={calldata} />
        <DataBlock
          label={`retdata (${(frame.result || []).length} felt${(frame.result || []).length === 1 ? "" : "s"})`}
          items={frame.result || []}
        />

        {frame.events && frame.events.length ? (
          <div className="rounded bg-zinc-950 border border-zinc-800 p-2 mt-2">
            <div className="text-[10px] uppercase text-zinc-500 mb-1">
              {frame.events.length} event{frame.events.length === 1 ? "" : "s"} from this frame
            </div>
            <div className="text-xs space-y-1">
              {frame.events.map((ev, i) => {
                const ename = eventName(ev);
                return (
                  <div key={i} className="font-mono">
                    <span className="text-zinc-500">[{i}]</span>{" "}
                    {ename ? (
                      <span className="text-emerald-300">{ename}</span>
                    ) : (
                      <span className="text-zinc-300">{shortHex(ev.keys[0])}</span>
                    )}{" "}
                    <span className="text-zinc-500">data:</span>[
                    {(ev.data || []).slice(0, 4).map((d) => shortHex(d)).join(", ")}
                    {(ev.data || []).length > 4 ? ", …" : ""}]
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DataBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded bg-zinc-950 border border-zinc-800 p-2 mt-2">
      <div className="text-[10px] uppercase text-zinc-500 mb-1">{label}</div>
      <div className="font-mono text-xs space-y-0.5 max-h-44 overflow-auto">
        {items.length === 0 ? (
          <div className="text-zinc-600">empty</div>
        ) : (
          items.map((f, i) => (
            <div key={i}>
              <span className="text-zinc-600">[{i}]</span> {f}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SourcePane({ frame }: { frame: FunctionInvocation | null }) {
  const sel = selectorName(frame);
  const fname = sel || "unknown_entrypoint";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase text-zinc-500">Cairo source</div>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="rounded px-1.5 py-0.5 bg-zinc-800 text-zinc-300">Cairo</span>
          <span className="rounded px-1.5 py-0.5 text-zinc-500">Sierra</span>
          <span className="rounded px-1.5 py-0.5 text-zinc-500">CASM</span>
        </div>
      </div>
      <pre className="rounded bg-zinc-950 border border-zinc-800 p-2 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-72 text-zinc-300">
        {`// contract: ${frame ? contractLabel(frame.contractAddress) || shortHex(frame.contractAddress) : "—"}
// class:    ${shortHex(frame?.classHash)}
// source:   unverified — placeholder rendering

#[external(v0)]
fn ${fname}(/* see decoded calldata in pane above */) {
    // Source unavailable. cairo-annotations plumbing lands when classes
    // are verified upstream.
}`}
      </pre>
    </div>
  );
}
