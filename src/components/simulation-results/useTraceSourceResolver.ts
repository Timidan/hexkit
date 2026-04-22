import { useEffect, useRef } from "react";
import {
  collectTraceAddresses,
  createTraceContractMap,
  type TraceContract,
} from "../../utils/traceAddressCollector";

interface Args {
  decodedTrace: any;
  contractContext: any;
  setTraceContracts: (map: Map<string, TraceContract>) => void;
}

/**
 * Resolves verified source code for addresses that appear in the decoded
 * trace and publishes the resulting contract map into the simulation context.
 * Throttled by an address-set fingerprint so the same batch isn't resolved
 * twice while the trace is still in flight.
 */
export function useTraceSourceResolver({
  decodedTrace,
  contractContext,
  setTraceContracts,
}: Args) {
  const contractContextRef = useRef(contractContext);
  contractContextRef.current = contractContext;

  const resolvedAddressesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const resolveTraceSources = async () => {
      const ctx = contractContextRef.current;
      if (!decodedTrace?.rows || !ctx) return;

      const txFrom = ctx.fromAddress?.toLowerCase();
      const addresses = collectTraceAddresses(decodedTrace.rows, txFrom);
      if (addresses.size === 0) return;

      const addressKey = Array.from(addresses).sort().join(",");
      if (resolvedAddressesRef.current.has(addressKey)) return;
      resolvedAddressesRef.current.add(addressKey);

      const contractMap = createTraceContractMap(addresses);
      const addressList = Array.from(addresses).slice(0, 10);

      try {
        const { contractResolver } = await import(
          "../../utils/resolver/ContractResolver"
        );
        const chainId = ctx.networkId;
        const chainName = ctx.networkName;

        await Promise.allSettled(
          addressList.map(async (addr) => {
            try {
              const result = await Promise.race([
                contractResolver.resolve(addr, {
                  id: chainId,
                  name: chainName,
                } as any),
                new Promise<null>((_, reject) =>
                  setTimeout(() => reject(new Error("timeout")), 5000),
                ),
              ]);
              if (result && result.verified) {
                const contract = contractMap.get(addr);
                if (contract) {
                  contract.name = result.name || contract.name;
                  contract.sourceCode = result.metadata?.sourceCode;
                  contract.verified = true;
                  contract.sourceProvider = result.source || undefined;
                }
              }
              return result;
            } catch {
              return null;
            }
          }),
        );

        setTraceContracts(contractMap);
      } catch (err) {
        console.warn(
          "[SimResultsPage] Failed to resolve trace sources:",
          err,
        );
      }
    };

    resolveTraceSources();
  }, [decodedTrace, setTraceContracts]);
}
