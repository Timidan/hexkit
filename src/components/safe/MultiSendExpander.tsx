import React, { useState } from 'react';
import type { MultiSendSubCall } from '../../utils/safe/types';

function truncate(hex: string): string {
  return hex.length > 66 ? `${hex.slice(0, 66)}…` : hex;
}

export const MultiSendExpander: React.FC<{ subCalls: MultiSendSubCall[] }> = ({
  subCalls,
}) => {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (subCalls.length === 0) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
        No sub-calls decoded.
      </div>
    );
  }

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore clipboard failures */
    }
  };

  return (
    <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
        MultiSend sub-calls ({subCalls.length}) — click a row to expand calldata
      </div>
      <table className="w-full text-left text-xs">
        <thead className="border-b border-zinc-800 bg-zinc-900 text-zinc-400">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Op</th>
            <th className="px-3 py-2 font-medium">To</th>
            <th className="px-3 py-2 font-medium">Value</th>
            <th className="px-3 py-2 font-medium">Data</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {subCalls.map((c, i) => {
            const isOpen = expanded.has(i);
            return (
              <React.Fragment key={i}>
                <tr
                  className="cursor-pointer border-b border-zinc-900 last:border-0 hover:bg-zinc-900/50"
                  onClick={() => toggle(i)}
                >
                  <td className="px-3 py-2 text-zinc-400">{i}</td>
                  <td
                    className={`px-3 py-2 font-mono ${c.operation === 1 ? 'text-red-300' : 'text-zinc-300'}`}
                  >
                    {c.operation === 1 ? 'DELEGATECALL' : 'CALL'}
                  </td>
                  <td className="px-3 py-2 font-mono text-zinc-200">{c.to}</td>
                  <td className="px-3 py-2 font-mono text-zinc-300">
                    {c.value.toString()}
                  </td>
                  <td className="px-3 py-2 font-mono break-all text-zinc-300">
                    {isOpen ? c.data : truncate(c.data)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    <button
                      type="button"
                      className="mr-2 rounded border border-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide hover:bg-zinc-900"
                      onClick={(e) => {
                        e.stopPropagation();
                        copy(c.data);
                      }}
                    >
                      copy
                    </button>
                    <span className="text-[10px]">{isOpen ? '▾' : '▸'}</span>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default MultiSendExpander;
