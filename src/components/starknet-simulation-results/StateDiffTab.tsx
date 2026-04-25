import type { SimulationResult } from "@/chains/starknet/simulatorTypes";
import { contractLabel, shortHex } from "./decoders";

export function StateDiffTab({ result }: { result: SimulationResult }) {
  const sd = result.stateDiff;
  if (!sd) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/50 p-6 text-sm text-zinc-400 leading-relaxed">
        <div className="text-xs uppercase text-zinc-500 mb-2">State diff</div>
        Bridge response has no <span className="font-mono text-zinc-200">stateDiff</span> field — this fixture predates
        the Sprint 4 plumbing. Re-run against a current bridge build to populate.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <SummaryCard label="contracts touched" value={sd.summary.contractsTouched} />
        <SummaryCard label="storage writes" value={sd.summary.storageWrites} />
        <SummaryCard label="nonce updates" value={sd.summary.nonceUpdates} />
        <SummaryCard label="class hash updates" value={sd.summary.classHashUpdates} />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase text-zinc-500">Storage writes</div>
          <span className="text-[10px] text-zinc-500">
            canonical — emitted by trace_map.rs map_state_diff()
          </span>
        </div>
        {sd.storageDiffs.length === 0 ? (
          <div className="text-xs text-zinc-500 py-3 text-center">no storage writes</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="text-left py-1.5 px-2">Contract</th>
                <th className="text-left py-1.5 px-2">Storage key</th>
                <th className="text-left py-1.5 px-2">→ New value</th>
              </tr>
            </thead>
            <tbody>
              {sd.storageDiffs.map((grp) => {
                const lbl = contractLabel(grp.address);
                return grp.storageEntries.map((e, i) => (
                  <tr key={`${grp.address}-${i}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    {i === 0 ? (
                      <td className="py-1.5 px-2 align-top" rowSpan={grp.storageEntries.length}>
                        {lbl ? <div className="text-emerald-300 text-xs">{lbl}</div> : null}
                        <div className="font-mono text-zinc-400 text-[10px]">{shortHex(grp.address)}</div>
                        <div className="text-[9px] text-zinc-500 mt-0.5">
                          {grp.storageEntries.length} write{grp.storageEntries.length === 1 ? "" : "s"}
                        </div>
                      </td>
                    ) : null}
                    <td className="py-1.5 px-2 font-mono text-[11px] text-zinc-300">{shortHex(e.key)}</td>
                    <td className="py-1.5 px-2 font-mono text-[11px] text-amber-300">{shortHex(e.value)}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="text-xs uppercase text-zinc-500">Nonce updates</div>
        {sd.nonceUpdates.length === 0 ? (
          <div className="text-xs text-zinc-500 py-3 text-center">no nonce updates</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="text-left py-1.5 px-2">Contract</th>
                <th className="text-left py-1.5 px-2">New nonce</th>
              </tr>
            </thead>
            <tbody>
              {sd.nonceUpdates.map((n, i) => (
                <tr key={i} className="border-b border-zinc-800/50">
                  <td className="py-1.5 px-2 font-mono text-[11px] text-zinc-300">
                    {shortHex(n.contractAddress)}
                  </td>
                  <td className="py-1.5 px-2 font-mono text-[11px] text-amber-300">{n.nonce}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {sd.classHashUpdates && sd.classHashUpdates.length > 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <div className="text-xs uppercase text-zinc-500">Class hash updates</div>
          <table className="w-full text-xs">
            <tbody>
              {sd.classHashUpdates.map((c, i) => (
                <tr key={i} className="border-b border-zinc-800/50">
                  <td className="py-1.5 px-2 font-mono text-[11px] text-zinc-300">
                    {shortHex(c.contractAddress)}
                  </td>
                  <td className="py-1.5 px-2 font-mono text-[11px] text-amber-300">{shortHex(c.classHash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2.5">
      <div className="text-[9px] uppercase text-zinc-500">{label}</div>
      <div className="font-mono text-zinc-100 text-lg">{value}</div>
    </div>
  );
}
