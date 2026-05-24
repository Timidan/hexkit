import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits, type Address } from "viem";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MEZO_TABS, type MezoTabId } from "../TabBar";
import { MEZO_CONTRACTS } from "../../../../../data/mezoContracts";
import { MEZO_ABIS } from "../abi";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";
import { MEZO_GLOSSARY, type GlossaryKey } from "../glossary";

interface SideRailNavProps {
  active: MezoTabId;
  onChange: (id: MezoTabId) => void;
}

function fmt(value: bigint | undefined, decimals = 18, precision = 4): string {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, decimals));
  if (n === 0) return "0.00";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: precision,
  });
}

export function SideRailNav({ active, onChange }: SideRailNavProps) {
  const { address, isConnected, chainId } = useAccount();
  const onMezo = isConnected && chainId === MEZO_TESTNET_CHAIN_ID;

  // 6-second background refetch keeps the wallet rail fresh even when txs
  // land outside Mezo Lens (e.g. user using testnet.mezo.org in another tab).
  // Txs sent through useMezoLegPipeline invalidate the cache on confirm, so
  // intra-Lens updates land within ~1 block (≈ 2s) regardless.
  const refetchInterval = onMezo ? 6_000 : false;

  const btc = useBalance({
    address: onMezo ? (address as Address) : undefined,
    chainId: MEZO_TESTNET_CHAIN_ID,
    query: { enabled: onMezo, refetchInterval },
  });
  const musd = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.MUSD,
    abi: MEZO_ABIS.MUSD,
    functionName: "balanceOf",
    args: address ? [address as Address] : undefined,
    query: { enabled: onMezo, refetchInterval },
  });
  const sMusd = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.sMUSD,
    abi: MEZO_ABIS.sMUSD,
    functionName: "balanceOf",
    args: address ? [address as Address] : undefined,
    query: { enabled: onMezo, refetchInterval },
  });
  const mezo = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.MEZO,
    abi: MEZO_ABIS.MEZO,
    functionName: "balanceOf",
    args: address ? [address as Address] : undefined,
    query: { enabled: onMezo, refetchInterval },
  });

  return (
    <aside className="flex flex-col gap-1 border-r border-white/[0.05] bg-zinc-950/30 py-3 px-2 text-[12px]">
      <div className="px-2.5 pb-1 text-[9px] uppercase tracking-[0.16em] text-zinc-600">
        Actions
      </div>
      {MEZO_TABS.map((tab) => {
        const isActive = tab.id === active;
        const TabIcon = tab.icon;
        const entry = MEZO_GLOSSARY[tab.glossaryKey];
        return (
          <Tooltip key={tab.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange(tab.id)}
                aria-label={tab.label}
                className={cn(
                  "h-8 w-full inline-flex items-center gap-2 px-2.5 rounded-md text-left transition-colors",
                  isActive
                    ? "border border-white/10 bg-white/[0.06] text-zinc-50"
                    : "border border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.03]",
                )}
              >
                <TabIcon
                  weight={isActive ? "duotone" : "regular"}
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive ? "text-zinc-100" : "text-zinc-500",
                  )}
                />
                <span className="truncate">{tab.label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              align="start"
              sideOffset={8}
              className="max-w-[240px] border-white/10 bg-zinc-950/95 text-zinc-100 backdrop-blur"
            >
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                {entry.title}
              </div>
              <div className="text-[12px] leading-snug text-zinc-200">
                {entry.body}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}

      <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      <div className="px-2.5 pb-1 text-[9px] uppercase tracking-[0.16em] text-zinc-600">
        Wallet
      </div>
      <TokenRow symbol="BTC" glossaryKey="btc" value={btc.data?.value} />
      <TokenRow
        symbol="MUSD"
        glossaryKey="musd"
        value={musd.data as bigint | undefined}
        precision={2}
      />
      <TokenRow
        symbol="sMUSD"
        glossaryKey="smusd"
        value={sMusd.data as bigint | undefined}
        precision={2}
      />
      <TokenRow
        symbol="MEZO"
        glossaryKey="mezo"
        value={mezo.data as bigint | undefined}
        precision={2}
      />

      <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      <div className="px-2.5 pb-1 text-[9px] uppercase tracking-[0.16em] text-zinc-600">
        Trove
      </div>
      <div className="px-2.5 py-1 text-[11px] text-zinc-500">No trove yet</div>

      <div className="px-2.5 pt-2 pb-1 text-[9px] uppercase tracking-[0.16em] text-zinc-600">
        veMEZO
      </div>
      <div className="px-2.5 py-1 text-[11px] text-zinc-500">No lock</div>
    </aside>
  );
}

function TokenRow({
  symbol,
  glossaryKey,
  value,
  precision = 4,
  muted,
}: {
  symbol: string;
  glossaryKey: GlossaryKey;
  value: bigint | undefined;
  precision?: number;
  muted?: boolean;
}) {
  const isEmpty = muted || value === undefined;
  const entry = MEZO_GLOSSARY[glossaryKey];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className={cn(
            "flex cursor-help items-center justify-between gap-2 rounded px-2.5 py-1 text-[11px] outline-none transition-colors focus-visible:bg-white/[0.03]",
            isEmpty && "opacity-60",
          )}
        >
          <span className="text-zinc-400">{symbol}</span>
          <span className="font-mono tabular-nums text-zinc-200">
            {isEmpty ? "—" : fmt(value, 18, precision)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        align="start"
        sideOffset={8}
        className="max-w-[240px] border-white/10 bg-zinc-950/95 text-zinc-100 backdrop-blur"
      >
        <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          {entry.title}
        </div>
        <div className="text-[12px] leading-snug text-zinc-200">
          {entry.body}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
