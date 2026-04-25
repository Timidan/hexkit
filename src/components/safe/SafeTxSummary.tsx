import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import type { Hex } from 'viem';
import type { SafeTx, SafeVersion } from '../../utils/safe/types';

type Props = {
  tx: SafeTx;
  expectedHash: Hex | null;
  computedHash: Hex;
  version?: SafeVersion;
};

export const SafeTxSummary: React.FC<Props> = ({
  tx,
  expectedHash,
  computedHash,
  version,
}) => {
  const hasExpected = expectedHash !== null;
  const match =
    hasExpected && expectedHash!.toLowerCase() === computedHash.toLowerCase();
  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader>
        <CardTitle className="text-sm text-zinc-200">
          {tx.operation === 1 ? 'DELEGATECALL' : 'CALL'} → {tx.to}
          {version ? (
            <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-normal text-zinc-400">
              Safe v{version}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-zinc-300">
        <div>
          <span className="text-zinc-400">nonce:</span>{' '}
          <span className="font-mono">{tx.nonce.toString()}</span>
        </div>
        <div>
          <span className="text-zinc-400">value:</span>{' '}
          <span className="font-mono">{tx.value.toString()}</span> wei
        </div>
        <div>
          <span className="text-zinc-400">safeTxGas / baseGas / gasPrice:</span>{' '}
          <span className="font-mono">
            {tx.safeTxGas.toString()} / {tx.baseGas.toString()} /{' '}
            {tx.gasPrice.toString()}
          </span>
        </div>
        <div>
          <span className="text-zinc-400">gasToken:</span>{' '}
          <span className="font-mono">{tx.gasToken}</span>
        </div>
        <div>
          <span className="text-zinc-400">refundReceiver:</span>{' '}
          <span className="font-mono">{tx.refundReceiver}</span>
        </div>
        <div>
          <span className="text-zinc-400">data:</span>{' '}
          <span className="font-mono break-all">{tx.data}</span>
        </div>
        {hasExpected ? (
          <div>
            <span className="text-zinc-400">expected safeTxHash:</span>{' '}
            <span className="font-mono">{expectedHash}</span>
          </div>
        ) : null}
        <div>
          <span className="text-zinc-400">computed safeTxHash:</span>{' '}
          <span
            className={`font-mono ${hasExpected ? (match ? 'text-emerald-300' : 'text-red-300') : 'text-zinc-200'}`}
          >
            {computedHash}
          </span>{' '}
          {hasExpected
            ? match
              ? '(matches)'
              : '(MISMATCH against provided hash — do NOT trust signers)'
            : '(no hash to compare against — computed only)'}
        </div>
      </CardContent>
    </Card>
  );
};

export default SafeTxSummary;
