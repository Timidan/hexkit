import type { SimulationResult } from "@/chains/starknet/simulatorTypes";
import { walkInvocations, eventName, contractLabel, shortHex } from "./decoders";

export function EventsTab({ result }: { result: SimulationResult }) {
  const rows: Array<{ from: string; keys: string[]; data: string[] }> = [];
  for (const f of walkInvocations(result)) {
    for (const e of f.events || []) {
      rows.push({ from: e.fromAddress, keys: e.keys, data: e.data });
    }
  }
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-xs uppercase text-zinc-500 mb-2">Emitted events ({rows.length})</div>
      {rows.length === 0 ? (
        <div className="text-xs text-zinc-500 py-3 text-center">No events emitted.</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-zinc-500">
            <tr className="border-b border-zinc-800">
              <th className="text-left py-1.5 px-2">#</th>
              <th className="text-left py-1.5 px-2">Decoded name</th>
              <th className="text-left py-1.5 px-2">From</th>
              <th className="text-left py-1.5 px-2">Keys</th>
              <th className="text-left py-1.5 px-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const name = eventName({ fromAddress: r.from, keys: r.keys, data: r.data });
              const fromLbl = contractLabel(r.from);
              return (
                <tr key={i} className="border-b border-zinc-800/50">
                  <td className="py-1.5 px-2 font-mono text-zinc-500">{i}</td>
                  <td className="py-1.5 px-2">
                    {name ? (
                      <span className="rounded-sm bg-blue-900/40 border border-blue-700 px-1.5 py-0.5 text-[10px] text-blue-300">
                        {name}
                      </span>
                    ) : (
                      <span className="font-mono text-zinc-400 text-[10px]">{shortHex(r.keys[0])}</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    {fromLbl ? <span className="text-emerald-300">{fromLbl} </span> : null}
                    <span className="font-mono text-zinc-400 text-[10px]">{shortHex(r.from)}</span>
                  </td>
                  <td className="py-1.5 px-2 font-mono text-[10px] text-zinc-300">
                    {r.keys.slice(1).map((k) => shortHex(k)).join(" · ") || (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 font-mono text-[10px] text-zinc-300">
                    [{r.data.length} felt{r.data.length === 1 ? "" : "s"}]
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
