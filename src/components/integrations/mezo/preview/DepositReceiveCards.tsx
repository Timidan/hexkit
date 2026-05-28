import { formatUnits, type Address } from "viem";
import { ArrowRight, Vault } from "@phosphor-icons/react";
import { MEZO_CONTRACTS } from "../../../../../data/mezoContracts";
import { AssetIcon, type AssetSymbol } from "../components/AssetIcon";
import type { DecodedLeg, SimLog } from "../sim/types";

/**
 * "You deposit / You receive" cards. Net deltas come from ERC-20 Transfer
 * logs; native BTC delta is passed by the caller because payable calls
 * don't emit ERC-20 Transfer logs for native moves.
 */

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

interface WatchedToken {
  address: Address;
  symbol: string;
  decimals: number;
  usdPerUnit?: number;
}

interface DepositReceiveCardsProps {
  legs: DecodedLeg[];
  userAddress: Address | undefined;
  btcDeltaWei?: bigint;
  btcUsdPrice?: number;
  extraReceives?: ExtraReceive[];
}

export interface ExtraReceive {
  label: string;
  detail?: string;
}

interface TokenLine {
  symbol: string;
  amount: bigint;
  decimals: number;
  usd?: number;
}

const watched = (musdPrice = 1, sMusdPrice = 1, mezoPrice?: number): WatchedToken[] => [
  { address: MEZO_CONTRACTS.MUSD, symbol: "MUSD", decimals: 18, usdPerUnit: musdPrice },
  { address: MEZO_CONTRACTS.sMUSD, symbol: "sMUSD", decimals: 18, usdPerUnit: sMusdPrice },
  { address: MEZO_CONTRACTS.MEZO, symbol: "MEZO", decimals: 18, usdPerUnit: mezoPrice },
];

export function DepositReceiveCards({
  legs,
  userAddress,
  btcDeltaWei,
  btcUsdPrice,
  extraReceives,
}: DepositReceiveCardsProps) {
  const tokens = watched();
  const { deposits, receives } = aggregate(
    legs,
    userAddress,
    tokens,
    btcDeltaWei,
    btcUsdPrice,
  );

  if (deposits.length === 0 && receives.length === 0 && !extraReceives?.length) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 items-stretch gap-2 md:grid-cols-[1fr_auto_1fr]">
      <SideCard label="You'll deposit" tone="out" lines={deposits} />
      <div className="flex items-center justify-center text-zinc-700">
        <ArrowRight className="hidden h-4 w-4 md:block" weight="bold" />
        <span className="md:hidden text-xs">↓</span>
      </div>
      <SideCard
        label="You'll receive"
        tone="in"
        lines={receives}
        extras={extraReceives}
      />
    </div>
  );
}

interface SideCardProps {
  label: string;
  tone: "in" | "out";
  lines: TokenLine[];
  extras?: ExtraReceive[];
}

function SideCard({ label, tone, lines, extras }: SideCardProps) {
  const valueColor = tone === "out" ? "text-red-300" : "text-emerald-300";
  return (
    <div className="flex h-full w-full min-w-0 flex-col gap-2 overflow-hidden rounded-lg border border-white/[0.06] bg-zinc-950/40 p-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </div>
      {lines.length === 0 && (!extras || extras.length === 0) && (
        <div className="text-sm text-zinc-500">—</div>
      )}
      {lines.map((line) => {
        const amount = Number(formatUnits(line.amount, line.decimals));
        const iconSymbol = toAssetSymbol(line.symbol);
        return (
          <div
            key={line.symbol}
            className="flex min-w-0 items-center justify-between gap-3"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              {iconSymbol ? (
                <AssetIcon symbol={iconSymbol} size="sm" />
              ) : null}
              <span
                className={`truncate font-mono text-sm font-medium tabular-nums ${valueColor}`}
              >
                {tone === "out" ? "−" : "+"}
                {formatAmount(amount)}
              </span>
              <span className="text-[11px] font-medium tracking-wide text-zinc-400">
                {line.symbol}
              </span>
            </div>
            {line.usd !== undefined && (
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                ≈ ${formatAmount(amount * line.usd)}
              </span>
            )}
          </div>
        );
      })}
      {extras?.map((extra, i) => (
        <div key={i} className="flex min-w-0 items-start gap-2 text-sm">
          <Vault className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${valueColor}`} />
          <div className="min-w-0 flex-1">
            <div
              className={`break-words text-[12px] font-medium leading-tight ${valueColor}`}
            >
              {extra.label}
            </div>
            {extra.detail && (
              <div className="mt-0.5 text-[11px] text-zinc-500">
                {extra.detail}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function toAssetSymbol(s: string): AssetSymbol | null {
  switch (s) {
    case "BTC":
    case "MUSD":
    case "sMUSD":
    case "MEZO":
    case "veMEZO":
      return s;
    default:
      return null;
  }
}

function aggregate(
  legs: DecodedLeg[],
  user: Address | undefined,
  tokens: WatchedToken[],
  btcDeltaWei: bigint | undefined,
  btcUsdPrice: number | undefined,
): { deposits: TokenLine[]; receives: TokenLine[] } {
  if (!user) return { deposits: [], receives: [] };
  const userLower = user.toLowerCase();

  const byToken = new Map<
    string,
    { amount: bigint; symbol: string; decimals: number; usd?: number }
  >();

  for (const leg of legs) {
    for (const log of leg.logs) {
      const t = parseTransfer(log);
      if (!t) continue;
      const meta = tokens.find(
        (tk) => tk.address.toLowerCase() === log.address.toLowerCase(),
      );
      if (!meta) continue;
      const existing =
        byToken.get(meta.symbol) ??
        {
          amount: 0n,
          symbol: meta.symbol,
          decimals: meta.decimals,
          usd: meta.usdPerUnit,
        };
      if (t.from.toLowerCase() === userLower) existing.amount -= t.amount;
      if (t.to.toLowerCase() === userLower) existing.amount += t.amount;
      byToken.set(meta.symbol, existing);
    }
  }

  const deposits: TokenLine[] = [];
  const receives: TokenLine[] = [];

  if (btcDeltaWei !== undefined && btcDeltaWei !== 0n) {
    const line: TokenLine = {
      symbol: "BTC",
      amount: btcDeltaWei < 0n ? -btcDeltaWei : btcDeltaWei,
      decimals: 18,
      usd: btcUsdPrice,
    };
    if (btcDeltaWei < 0n) deposits.push(line);
    else receives.push(line);
  }

  for (const entry of byToken.values()) {
    if (entry.amount === 0n) continue;
    const line: TokenLine = {
      symbol: entry.symbol,
      amount: entry.amount < 0n ? -entry.amount : entry.amount,
      decimals: entry.decimals,
      usd: entry.usd,
    };
    if (entry.amount < 0n) deposits.push(line);
    else receives.push(line);
  }

  const order = ["BTC", "MUSD", "sMUSD", "MEZO"];
  const sortByOrder = (a: TokenLine, b: TokenLine) =>
    order.indexOf(a.symbol) - order.indexOf(b.symbol);
  deposits.sort(sortByOrder);
  receives.sort(sortByOrder);

  return { deposits, receives };
}

function parseTransfer(
  log: SimLog,
): { from: string; to: string; amount: bigint } | null {
  if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) return null;
  if (log.topics.length < 3) return null;
  const from = `0x${log.topics[1].slice(26)}`;
  const to = `0x${log.topics[2].slice(26)}`;
  try {
    return { from, to, amount: BigInt(log.data) };
  } catch {
    return null;
  }
}

function formatAmount(n: number): string {
  if (Math.abs(n) >= 10000) return n.toFixed(0);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(4);
}
