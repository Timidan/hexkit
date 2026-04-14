import { useMemo } from "react";
import type { EarnVault, EarnPosition } from "../types";

function positionKey(chainId: number, protocol: string, underlyingAddress: string): string {
  return `${chainId}:${protocol.toLowerCase()}:${underlyingAddress.toLowerCase()}`;
}

export interface VaultMatch {
  vault: EarnVault;
  ambiguous: false;
}

export interface VaultAmbiguous {
  vault: null;
  ambiguous: true;
}

export interface VaultMissing {
  vault: null;
  ambiguous: false;
}

export type VaultLookupResult = VaultMatch | VaultAmbiguous | VaultMissing;

export function useVaultLookup(vaults: EarnVault[]): Map<string, VaultLookupResult> {
  return useMemo(() => {
    const map = new Map<string, VaultLookupResult>();

    for (const vault of vaults) {
      if (!vault.isRedeemable) continue;

      for (const token of vault.underlyingTokens ?? []) {
        const key = positionKey(vault.chainId, vault.protocol.name, token.address);
        const existing = map.get(key);

        if (!existing) {
          map.set(key, { vault, ambiguous: false });
        } else if (!existing.ambiguous && existing.vault) {
          map.set(key, { vault: null, ambiguous: true });
        }
      }
    }

    return map;
  }, [vaults]);
}

export function lookupVault(
  map: Map<string, VaultLookupResult>,
  position: EarnPosition,
): VaultLookupResult {
  const key = positionKey(position.chainId, position.protocolName, position.asset.address);
  return map.get(key) ?? { vault: null, ambiguous: false };
}
