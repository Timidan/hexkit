import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, type Address } from 'viem';
import ContractAddressInput from '@/components/contract/ContractAddressInput';
import { detectDelegation } from '@/utils/eip7702/detectDelegation';
import { lookupDelegate } from '@/utils/eip7702/riskRegistry';
import { contractResolver } from '@/utils/resolver/ContractResolver';
import { DelegationBadge } from './DelegationBadge';
import type { Chain } from '@/types';
import { SUPPORTED_CHAINS } from '@/utils/chains';

export const ScannerTab: React.FC = () => {
  const [address, setAddress] = useState<string>('');
  const [chain, setChain] = useState<Chain | null>(SUPPORTED_CHAINS[0] ?? null);

  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(address);

  const { data, isFetching, error } = useQuery({
    queryKey: ['7702-scan', address, chain?.id],
    enabled: Boolean(address && chain && isValidAddress),
    queryFn: async () => {
      if (!chain) throw new Error('No chain selected');
      const client = createPublicClient({
        transport: http(chain.rpcUrl),
      });
      const detection = await detectDelegation(address as Address, client);
      if (!detection.hasDelegation) {
        return { detection, registry: null, resolved: null };
      }
      const registry = lookupDelegate(detection.delegate);
      const resolved = await contractResolver
        .resolve(detection.delegate, chain)
        .catch(() => null);
      return { detection, registry, resolved };
    },
  });

  return (
    <div className="space-y-4">
      <ContractAddressInput
        contractAddress={address}
        onAddressChange={setAddress}
        selectedNetwork={chain}
        onNetworkChange={setChain}
        supportedChains={SUPPORTED_CHAINS}
        fetchLabel="Scan delegation"
      />

      {isFetching && (
        <p className="text-sm text-zinc-400">Reading bytecode…</p>
      )}
      {error ? (
        <p className="text-sm text-red-400">{(error as Error).message}</p>
      ) : null}

      {data && !data.detection.hasDelegation && (
        <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-sm">No EIP-7702 delegation on this address.</p>
        </div>
      )}

      {data && data.detection.hasDelegation && (
        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase text-zinc-500">Delegate</span>
            <code className="text-sm">{data.detection.delegate}</code>
            {data.registry ? (
              <DelegationBadge
                category={data.registry.category}
                verified={data.registry.verified}
              />
            ) : (
              <DelegationBadge category="unknown" verified={false} />
            )}
          </div>
          {data.resolved?.name ? (
            <p className="text-sm text-zinc-300">
              Resolved name: <strong>{data.resolved.name}</strong>
            </p>
          ) : null}
          {data.registry?.notes ? (
            <p className="text-xs text-zinc-400">{data.registry.notes}</p>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default ScannerTab;
