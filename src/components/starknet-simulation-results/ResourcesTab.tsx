import type { FunctionInvocation, SimulationResult } from "@/chains/starknet/simulatorTypes";
import { selectorName, shortHex, countSubtree } from "./decoders";

export function ResourcesTab({
  result,
  frames,
  onJumpToFrame,
}: {
  result: SimulationResult;
  frames: FunctionInvocation[];
  onJumpToFrame: (f: FunctionInvocation) => void;
}) {
  const res = result.executionResources;
  const gasRows = [
    { label: "L1 gas", val: res.l1Gas, color: "bg-blue-500" },
    { label: "L1 data gas", val: res.l1DataGas, color: "bg-cyan-500" },
    { label: "L2 gas", val: res.l2Gas, color: "bg-violet-500" },
  ];
  const gasMax = Math.max(...gasRows.map((r) => r.val), 1);

  const builtinRows = Object.entries(res.builtinInstanceCounter || {}).sort((a, b) => b[1] - a[1]);
  const builtinMax = Math.max(...builtinRows.map(([, v]) => v), 1);

  const heatItems = frames.map((f) => ({ ci: f, share: countSubtree(f) }));
  const heatMax = Math.max(...heatItems.map((h) => h.share), 1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="text-xs uppercase text-zinc-500">Gas waterfall</div>
        <div className="space-y-3">
          {gasRows.map((r) => (
            <div key={r.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">{r.label}</span>
                <span className="font-mono">{r.val.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-2 bg-zinc-800 rounded">
                <div
                  className={`h-2 rounded ${r.color}`}
                  style={{ width: `${Math.max(2, (r.val / gasMax) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="text-xs uppercase text-zinc-500">Builtins distribution</div>
        {builtinRows.length === 0 ? (
          <div className="text-xs text-zinc-500">No builtins recorded.</div>
        ) : (
          <div className="space-y-2">
            {builtinRows.map(([k, v]) => (
              <div key={k}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{k}</span>
                  <span className="font-mono">{v.toLocaleString()}</span>
                </div>
                <div className="mt-1 h-2 bg-zinc-800 rounded">
                  <div
                    className="h-2 bg-amber-500 rounded"
                    style={{ width: `${Math.max(2, (v / builtinMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 md:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase text-zinc-500">Per-frame compute share</div>
          <span className="text-[10px] text-zinc-500">
            heatmap = subtree size / total — synthetic until per-call resources land
          </span>
        </div>
        <div className="grid grid-cols-12 gap-1 text-[10px]">
          {heatItems.map((h, i) => {
            const pct = Math.round((h.share / heatMax) * 100);
            const sel = selectorName(h.ci) || shortHex(h.ci.entryPointSelector);
            const intensity =
              pct > 75
                ? "bg-red-700/70"
                : pct > 50
                ? "bg-orange-600/70"
                : pct > 25
                ? "bg-amber-600/60"
                : "bg-zinc-700/60";
            return (
              <button
                key={i}
                className={`heat-cell rounded ${intensity} px-1 py-1 text-zinc-100 truncate text-left flex flex-col`}
                title={`frame #${i} · ${sel} · subtree=${h.share}`}
                onClick={() => onJumpToFrame(h.ci)}
              >
                <span className="text-zinc-300 text-[8px]">#{i}</span>
                <span className="truncate">{sel.slice(0, 14)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
