import { Alert, AlertDescription } from "@/components/ui/alert";
import { Warning } from "@phosphor-icons/react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits, type Address } from "viem";
import {
  KNOWN_WRONG_MUSD,
  MEZO_CONTRACTS,
} from "../../../../data/mezoContracts";
import { MEZO_ABIS } from "./abi";
import { MEZO_TESTNET_CHAIN_ID } from "./constants";
import { MEZO_LENS_COPY } from "./copy";
import { SectionEyebrow } from "./components/SectionEyebrow";

function fmt(value: bigint | undefined, decimals = 18, precision = 4): string {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, decimals));
  if (n === 0) return "0.00";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: precision,
  });
}

const TOKEN_ACCENT: Record<string, string> = {
  BTC: "bg-amber-400/80",
  MUSD: "bg-emerald-400/80",
  sMUSD: "bg-emerald-300/80",
  MEZO: "bg-pink-400/80",
};

export function PositionsSidebar() {
  const { address, isConnected, chainId } = useAccount();
  const onMezo = isConnected && chainId === MEZO_TESTNET_CHAIN_ID;

  const btc = useBalance({
    address: onMezo ? (address as Address) : undefined,
    chainId: MEZO_TESTNET_CHAIN_ID,
    query: { enabled: onMezo },
  });

  const canonicalMusd = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.MUSD,
    abi: MEZO_ABIS.MUSD,
    functionName: "balanceOf",
    args: address ? [address as Address] : undefined,
    query: { enabled: onMezo },
  });

  const wrongMusd = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: KNOWN_WRONG_MUSD,
    abi: MEZO_ABIS.MUSD,
    functionName: "balanceOf",
    args: address ? [address as Address] : undefined,
    query: { enabled: onMezo, refetchInterval: 30_000 },
  });
  const wrongMusdBalance = (wrongMusd.data as bigint | undefined) ?? 0n;
  const hasWrongMusd = wrongMusdBalance > 0n;

  const walletStatus = onMezo ? "live" : "off";

  const btcVal = btc.data?.value;
  const musdVal = canonicalMusd.data as bigint | undefined;

  return (
    <aside className="flex w-full flex-col gap-3 lg:w-80 lg:shrink-0">
      <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <SectionEyebrow
          label={MEZO_LENS_COPY.positionsSidebar.walletHeader}
          status={walletStatus}
          suffix={
            <span className="font-mono text-[10px] tracking-wider text-zinc-600">
              {onMezo ? "MEZO TESTNET" : "—"}
            </span>
          }
          className="mb-3"
        />
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <TokenRow symbol="BTC" value={btcVal} />
          <TokenRow symbol="MUSD" value={musdVal} precision={2} />
          <TokenRow symbol="sMUSD" value={undefined} placeholder />
          <TokenRow symbol="MEZO" value={undefined} placeholder />
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <SectionEyebrow
          label={MEZO_LENS_COPY.positionsSidebar.troveHeader}
          status="empty"
          className="mb-2"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-zinc-400">
            {MEZO_LENS_COPY.positionsSidebar.troveEmpty}
          </p>
          <span className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 font-mono text-[9px] tracking-wider text-zinc-500">
            PHASE 1.8
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <SectionEyebrow
          label={MEZO_LENS_COPY.positionsSidebar.veMezoHeader}
          status="empty"
          className="mb-2"
        />
        <p className="text-sm text-zinc-400">
          {MEZO_LENS_COPY.positionsSidebar.veMezoEmpty}
        </p>
      </div>

      {hasWrongMusd && (
        <Alert
          variant="destructive"
          className="border-red-500/30 bg-red-950/30"
        >
          <Warning className="h-4 w-4" />
          <AlertDescription className="text-xs text-red-100/80">
            You hold {fmt(wrongMusdBalance, 18, 2)} of the non-canonical MUSD
            (0x637e22A1…). Mezo Lens only touches canonical MUSD
            (0x118917a4…). Swap or move that balance manually.
          </AlertDescription>
        </Alert>
      )}
    </aside>
  );
}

function TokenRow({
  symbol,
  value,
  precision = 4,
  placeholder,
}: {
  symbol: string;
  value: bigint | undefined;
  precision?: number;
  placeholder?: boolean;
}) {
  const isEmpty = placeholder || value === undefined;
  return (
    <div className="flex flex-col gap-1">
      <div className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${
            TOKEN_ACCENT[symbol] ?? "bg-zinc-500"
          } ${isEmpty ? "opacity-30" : ""}`}
        />
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          {symbol}
        </span>
      </div>
      <div
        className={`font-mono text-sm tabular-nums ${
          isEmpty ? "text-zinc-600" : "text-zinc-100"
        }`}
      >
        {isEmpty ? "—" : fmt(value, 18, precision)}
      </div>
    </div>
  );
}
