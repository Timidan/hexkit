import { Card } from "@/components/ui/card";
import type { FunctionInvocation, SimulationResult } from "@/chains/starknet/simulatorTypes";
import { countSubtree, selectorName, shortHex } from "./decoders";

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
    { label: "L1 gas", val: res.l1Gas, fill: "bg-blue-500" },
    { label: "L1 data gas", val: res.l1DataGas, fill: "bg-cyan-500" },
    { label: "L2 gas", val: res.l2Gas, fill: "bg-violet-500" },
  ];
  const gasMax = Math.max(...gasRows.map((r) => r.val), 1);

  const builtinRows = Object.entries(res.builtinInstanceCounter || {}).sort(
    (a, b) => b[1] - a[1],
  );
  const builtinMax = Math.max(...builtinRows.map(([, v]) => v), 1);

  const heatItems = frames.map((f) => ({ ci: f, share: countSubtree(f) }));
  const heatMax = Math.max(...heatItems.map((h) => h.share), 1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="p-4 gap-3">
        <div className="text-xs uppercase text-muted-foreground">Gas waterfall</div>
        <div className="space-y-3">
          {gasRows.map((r) => (
            <div key={r.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-mono">{r.val.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-2 bg-muted rounded">
                <div
                  className={`h-2 rounded ${r.fill}`}
                  style={{ width: `${Math.max(2, (r.val / gasMax) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 gap-3">
        <div className="text-xs uppercase text-muted-foreground">Builtins distribution</div>
        {builtinRows.length === 0 ? (
          <div className="text-xs text-muted-foreground">No builtins recorded.</div>
        ) : (
          <div className="space-y-2">
            {builtinRows.map(([k, v]) => (
              <div key={k}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-mono">{v.toLocaleString()}</span>
                </div>
                <div className="mt-1 h-2 bg-muted rounded">
                  <div
                    className="h-2 bg-amber-500 rounded"
                    style={{ width: `${Math.max(2, (v / builtinMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 gap-3 md:col-span-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase text-muted-foreground">
            Per-frame compute share
          </div>
          <span className="text-[10px] text-muted-foreground">
            relative subtree size · click a cell to jump to that frame
          </span>
        </div>
        <div className="grid grid-cols-12 gap-1 text-[10px]">
          {heatItems.map((h, i) => {
            const pct = Math.round((h.share / heatMax) * 100);
            const sel = selectorName(h.ci) || shortHex(h.ci.entryPointSelector);
            const intensity =
              pct > 75
                ? "bg-red-700/70 hover:bg-red-700"
                : pct > 50
                ? "bg-orange-600/70 hover:bg-orange-600"
                : pct > 25
                ? "bg-amber-600/60 hover:bg-amber-600"
                : "bg-muted hover:bg-muted/80";
            return (
              <button
                key={i}
                type="button"
                className={`rounded ${intensity} px-1 py-1 text-foreground truncate text-left flex flex-col transition-colors`}
                title={`frame #${i} · ${sel} · subtree=${h.share}`}
                onClick={() => onJumpToFrame(h.ci)}
              >
                <span className="opacity-70 text-[8px]">#{i}</span>
                <span className="truncate">{sel.slice(0, 14)}</span>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
