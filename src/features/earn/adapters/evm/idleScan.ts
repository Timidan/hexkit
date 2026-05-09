// Multicall ERC20 balances + native balance for one EVM chain. Returns the
// legacy IdleAsset shape (string amounts, numeric chainId) because the
// concierge shell still consumes it that way; migrate to IdleAsset<T> when
// the shell moves under features/earn/shell.
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";
import { CHAIN_REGISTRY } from "../../../../utils/chains";
import { networkConfigManager } from "../../../../config/networkConfig";
import { isNativeToken, MULTICALL3_ADDRESS } from "../../../../utils/addressConstants";
import type { EarnToken } from "../../../../components/integrations/lifi-earn/types";
import type { IdleAsset } from "../../../../components/integrations/lifi-earn/concierge/types";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function toIdleAsset(
  chainId: number,
  chainName: string,
  token: EarnToken,
  raw: bigint,
): IdleAsset {
  return {
    chainId,
    chainName,
    token,
    amountRaw: raw.toString(),
    amountDecimal: formatUnits(raw, token.decimals),
    amountUsd: null,
  };
}

export interface ScanSingleChainArgs {
  chainId: number;
  address: `0x${string}`;
  tokens: EarnToken[];
  timeoutMs: number;
}

/**
 * Scan one EVM chain for non-zero balances of the given tokens. Uses a
 * single multicall for ERC20s plus a parallel native balance fetch.
 * Returns an empty array when the chain's RPC is unreachable.
 */
export async function scanEvmChainBalances(
  args: ScanSingleChainArgs,
): Promise<IdleAsset[]> {
  const { chainId, address, tokens, timeoutMs } = args;

  const chainMeta = CHAIN_REGISTRY.find((c) => c.id === chainId);
  if (!chainMeta) return [];

  const resolution = networkConfigManager.resolveRpcUrl(chainId, chainMeta.rpcUrl);
  const rpcUrl = resolution.url;
  if (!rpcUrl) return [];

  const client = createPublicClient({ transport: http(rpcUrl) });

  const erc20s = tokens.filter((t) => !isNativeToken(t.address));
  const nativeTokenMeta = tokens.find((t) => isNativeToken(t.address));

  const multicallCalls = erc20s.map((tok) => ({
    address: tok.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf" as const,
    args: [address] as const,
  }));

  const [erc20Results, nativeBalance] = await Promise.all([
    multicallCalls.length > 0
      ? withTimeout(
          client.multicall({
            contracts: multicallCalls,
            allowFailure: true,
            multicallAddress: MULTICALL3_ADDRESS,
          }),
          timeoutMs,
        )
      : Promise.resolve([] as { status: "success" | "failure"; result?: bigint }[]),
    withTimeout(client.getBalance({ address }), timeoutMs),
  ]);

  const assets: IdleAsset[] = [];

  erc20Results.forEach((r, i) => {
    if (r.status !== "success") return;
    const raw = r.result as bigint;
    if (raw === 0n) return;
    const tok = erc20s[i];
    assets.push(toIdleAsset(chainId, chainMeta.name, tok, raw));
  });

  if ((nativeBalance as bigint) > 0n) {
    const nativeTok: EarnToken = nativeTokenMeta ?? {
      address: "0x0000000000000000000000000000000000000000",
      symbol: chainMeta.nativeCurrency.symbol,
      decimals: chainMeta.nativeCurrency.decimals,
      name: chainMeta.nativeCurrency.name,
      chainId,
      logoURI: "",
    };
    assets.push(
      toIdleAsset(chainId, chainMeta.name, nativeTok, nativeBalance as bigint),
    );
  }

  return assets;
}
