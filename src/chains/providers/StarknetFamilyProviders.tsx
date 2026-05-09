/**
 * Starkzap-backed Starknet shell. Starkzap doesn't use a React provider
 * context — connection state lives in the `StarkzapClient` singleton, which
 * the StarknetBridge subscribes to. This wrapper stays for symmetry with
 * the EVM and Solana families (and so the FamilyProviderStack composition
 * in App.tsx treats all three uniformly), but it's a straight pass-through.
 */
import type { ReactNode } from "react";

export function StarknetFamilyProviders({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default StarknetFamilyProviders;
