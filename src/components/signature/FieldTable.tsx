import React from 'react';
import type { RenderRow } from '../../utils/signature/types';

type Props = {
  rows: RenderRow[];
  chainId?: number;
};

function AddressCell({ value, chainId }: { value: string; chainId?: number }) {
  const href =
    chainId && /^0x[0-9a-fA-F]{40}$/.test(value)
      ? `/explorer?address=${value}&chainId=${chainId}`
      : undefined;
  if (!href) {
    return <span className="font-mono text-xs text-zinc-300">{value}</span>;
  }
  return (
    <a
      href={href}
      className="font-mono text-xs text-emerald-300 hover:underline"
      target="_blank"
      rel="noreferrer"
    >
      {value}
    </a>
  );
}

export const FieldTable: React.FC<Props> = ({ rows, chainId }) => {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-500">
        No decoded fields.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-950">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-900 text-zinc-400">
          <tr>
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.label}-${i}`}
              className="border-b border-zinc-900 last:border-0"
            >
              <td className="whitespace-nowrap px-3 py-2 font-mono text-zinc-400">
                {r.label}
              </td>
              <td className="px-3 py-2 text-zinc-200">
                {r.kind === 'address' && typeof r.raw === 'string' ? (
                  <AddressCell value={r.raw} chainId={chainId} />
                ) : (
                  <span className="break-all">{r.value}</span>
                )}
                {r.annotation ? (
                  <span className="ml-2 text-zinc-500">· {r.annotation}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default FieldTable;
