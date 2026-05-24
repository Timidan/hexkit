import { useBlockNumber } from "wagmi";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";
import { usePriceFeed } from "../hooks/usePriceFeed";

export function MezoTopBar() {
  const block = useBlockNumber({
    chainId: MEZO_TESTNET_CHAIN_ID,
    watch: true,
  });
  const priceFeed = usePriceFeed();
  const btcUsd = priceFeed.data
    ? Number(priceFeed.data as bigint) / 1e18
    : undefined;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] bg-white/[0.015] px-4 py-2 text-[11px]">
      <div className="flex items-center gap-2 font-mono text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.12)]" />
          <span className="text-zinc-300 tracking-wider">MEZO TESTNET</span>
        </span>
        <span className="text-zinc-700">·</span>
        <span>chain 31611</span>
        {block.data !== undefined && (
          <>
            <span className="text-zinc-700">·</span>
            <span>
              block{" "}
              <span className="text-zinc-200 tabular-nums">
                {block.data.toString()}
              </span>
            </span>
          </>
        )}
      </div>
      <div className="hidden items-center gap-3 font-mono text-zinc-500 md:flex">
        {btcUsd !== undefined && (
          <span>
            BTC{" "}
            <span className="text-zinc-100 tabular-nums">
              ${btcUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
