import { formatUnits } from "viem";
import { AssetIcon, type AssetSymbol } from "./AssetIcon";
import type {
  SimulationBalances,
  SimulationLiquidity,
  SimulationSwap,
  SimulationTrove,
  SimulationVeMezo,
} from "../sim/types";

export interface BalanceDeltaPreviewProps {
  balances: SimulationBalances;
  troveBefore?: { debt: bigint; coll: bigint } | null;
  troveAfter?: SimulationTrove | null;
  veMezoAfter?: SimulationVeMezo | null;
  swap?: SimulationSwap | null;
  liquidity?: SimulationLiquidity | null;
  legsCount: number;
  /** Extra rows: precomputed deltas the caller wants surfaced (e.g. LP). */
  extra?: { symbol: AssetSymbol; label: string; delta: bigint; precision?: number }[];
}

export function BalanceDeltaPreview({
  balances,
  troveBefore,
  troveAfter,
  veMezoAfter,
  swap,
  liquidity,
  legsCount,
  extra,
}: BalanceDeltaPreviewProps) {
  const rows: { symbol: AssetSymbol; label: string; delta: bigint; precision?: number }[] = [];
  const push = (
    symbol: AssetSymbol,
    label: string,
    before: bigint,
    after: bigint,
    precision = 4,
  ) => {
    const delta = after - before;
    if (delta !== 0n) rows.push({ symbol, label, delta, precision });
  };
  push("BTC", "Wallet BTC", balances.btc.before, balances.btc.after, 6);
  push("MUSD", "Wallet MUSD", balances.musd.before, balances.musd.after, 2);
  push("sMUSD", "sMUSD savings", balances.sMusd.before, balances.sMusd.after, 2);
  push("MEZO", "MEZO", balances.mezo.before, balances.mezo.after, 2);

  for (const e of extra ?? []) rows.push(e);

  const troveDebtDelta =
    troveBefore && troveAfter ? troveAfter.debt - troveBefore.debt : null;
  const troveCollDelta =
    troveBefore && troveAfter ? troveAfter.collateral - troveBefore.coll : null;
  const troveClosed = troveBefore && troveAfter === null;

  const swapOut = swap?.outputDelta;
  const lpDelta =
    liquidity?.lpBalanceBefore !== undefined && liquidity?.lpBalanceAfter !== undefined
      ? liquidity.lpBalanceAfter - liquidity.lpBalanceBefore
      : null;

  const hasAny =
    rows.length > 0 ||
    troveClosed ||
    (troveDebtDelta !== null && troveDebtDelta !== 0n) ||
    (troveCollDelta !== null && troveCollDelta !== 0n) ||
    swapOut !== undefined ||
    (lpDelta !== null && lpDelta !== 0n) ||
    veMezoAfter != null;

  return (
    <div className="rounded-md border border-emerald-500/15 bg-emerald-500/[0.03] px-3 py-2.5 text-[11px]">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-emerald-200/85">Simulation passed</span>
        <span className="text-emerald-300/60">
          {legsCount} leg{legsCount === 1 ? "" : "s"}
        </span>
      </div>
      {!hasAny && <div className="text-zinc-500">No balance changes.</div>}
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <DeltaRow
            key={`${r.symbol}-${i}`}
            symbol={r.symbol}
            label={r.label}
            delta={r.delta}
            precision={r.precision ?? 4}
          />
        ))}
        {troveClosed && (
          <li className="flex items-center justify-between gap-2 text-emerald-200/85">
            <span className="text-zinc-400">Trove</span>
            <span className="font-mono text-rose-300/90">closed</span>
          </li>
        )}
        {troveDebtDelta !== null && troveDebtDelta !== 0n && (
          <DeltaRow symbol="MUSD" label="Trove debt" delta={troveDebtDelta} precision={2} />
        )}
        {troveCollDelta !== null && troveCollDelta !== 0n && (
          <DeltaRow symbol="BTC" label="Trove collateral" delta={troveCollDelta} precision={6} />
        )}
        {swapOut !== undefined && swapOut !== 0n && (
          <DeltaRow symbol="MUSD" label="Swap output" delta={swapOut} precision={4} />
        )}
        {lpDelta !== null && lpDelta !== 0n && (
          <DeltaRow symbol="MUSD" label="LP shares" delta={lpDelta} precision={6} />
        )}
        {veMezoAfter && veMezoAfter.tokenId > 0n && (
          <li className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <AssetIcon symbol="veMEZO" size="sm" noTooltip />
              <span>veMEZO lock</span>
            </span>
            <span className="font-mono text-emerald-300">
              token #{veMezoAfter.tokenId.toString()}
              {veMezoAfter.lockEnd > 0n && (
                <span className="ml-1 text-zinc-500">
                  · unlocks {new Date(Number(veMezoAfter.lockEnd) * 1000).toLocaleDateString()}
                </span>
              )}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

function DeltaRow({
  symbol,
  label,
  delta,
  precision,
}: {
  symbol: AssetSymbol;
  label: string;
  delta: bigint;
  precision: number;
}) {
  const positive = delta > 0n;
  const abs = delta < 0n ? -delta : delta;
  const formatted = Number(formatUnits(abs, 18)).toLocaleString(undefined, {
    minimumFractionDigits: Math.min(precision, 2),
    maximumFractionDigits: precision,
  });
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-zinc-400">
        <AssetIcon symbol={symbol} size="sm" noTooltip />
        <span>{label}</span>
      </span>
      <span className={`font-mono ${positive ? "text-emerald-300" : "text-rose-300"}`}>
        {positive ? "+" : "−"}
        {formatted} {symbol}
      </span>
    </li>
  );
}
