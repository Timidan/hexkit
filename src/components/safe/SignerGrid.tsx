import React from 'react';
import type { Address } from 'viem';

type Row = {
  signer: Address;
  type: 'eoa' | 'eth_sign' | 'contract' | 'approved_hash';
};

type Props = {
  rows: Row[];
  ownersAtExec?: string[];
  threshold?: number | null;
};

function isUnverifiedType(t: Row['type']): boolean {
  return t === 'contract' || t === 'approved_hash';
}

export const SignerGrid: React.FC<Props> = ({ rows, ownersAtExec, threshold }) => {
  const owners = new Set((ownersAtExec ?? []).map((a) => a.toLowerCase()));
  const ownersKnown = owners.size > 0;
  const verifiedCount = rows.filter((r) => !isUnverifiedType(r.type)).length;
  const unverifiedCount = rows.length - verifiedCount;
  return (
    <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
        <span>
          Recovered signers ({rows.length}){' '}
          {unverifiedCount > 0 ? (
            <span className="ml-2 rounded bg-amber-900/40 px-1.5 py-0.5 text-amber-200">
              {unverifiedCount} unverified
            </span>
          ) : null}
        </span>
        {typeof threshold === 'number' ? (
          <span
            className={
              verifiedCount >= threshold
                ? 'text-emerald-300'
                : rows.length >= threshold
                  ? 'text-amber-300'
                  : 'text-red-300'
            }
          >
            threshold: {threshold} — verified {verifiedCount}/{threshold}
            {verifiedCount < threshold && rows.length >= threshold
              ? ' (relies on unverified sigs)'
              : ''}
          </span>
        ) : (
          <span>threshold: unknown</span>
        )}
      </div>
      <table className="w-full text-left text-xs">
        <thead className="border-b border-zinc-800 bg-zinc-900 text-zinc-400">
          <tr>
            <th className="px-3 py-2 font-medium">Signer</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Is owner?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isOwner = ownersKnown && owners.has(r.signer.toLowerCase());
            const unverifiedRow = isUnverifiedType(r.type);
            return (
              <tr
                key={`${r.signer}-${i}`}
                className={`border-b border-zinc-900 last:border-0 ${unverifiedRow ? 'bg-amber-950/20' : ''}`}
              >
                <td className="px-3 py-2 font-mono text-zinc-200">{r.signer}</td>
                <td className="px-3 py-2 text-zinc-300">
                  {r.type}
                  {unverifiedRow ? (
                    <span
                      title="Off-chain verification not available — treat as unverified"
                      className="ml-2 rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200"
                    >
                      unverified
                    </span>
                  ) : null}
                </td>
                <td
                  className={`px-3 py-2 ${
                    !ownersKnown
                      ? 'text-amber-300'
                      : isOwner
                        ? 'text-emerald-300'
                        : 'text-red-300'
                  }`}
                >
                  {!ownersKnown ? 'unknown (owners not fetched)' : isOwner ? 'yes' : 'NO'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default SignerGrid;
