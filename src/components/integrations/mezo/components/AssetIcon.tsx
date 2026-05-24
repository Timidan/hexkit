import { useMemo, useState, useEffect, type ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getTokenIconUrls } from "@/utils/tokenMovements";
import { MEZO_GLOSSARY, type GlossaryKey } from "../glossary";

export type AssetSymbol = "BTC" | "MUSD" | "sMUSD" | "MEZO" | "veMEZO" | "veBTC";

const SYMBOL_TO_GLOSSARY: Record<AssetSymbol, GlossaryKey> = {
  BTC: "btc",
  MUSD: "musd",
  sMUSD: "smusd",
  MEZO: "mezo",
  veMEZO: "vemezo",
  veBTC: "vebtc",
};

// Canonical Mezo Mainnet addresses for icon lookup. veMEZO/veBTC are
// non-transferable NFT positions with no public CDN coverage, so they
// render styled local glyphs.
const SYMBOL_TO_ADDRESS: Record<AssetSymbol, string | null> = {
  BTC: "0x7b7C000000000000000000000000000000000000",
  MUSD: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  sMUSD: "0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16",
  MEZO: "0x7B7c000000000000000000000000000000000001",
  veMEZO: null,
  veBTC: null,
};

const sizeClass = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
  xl: "h-9 w-9",
} as const;

interface AssetIconProps {
  symbol: AssetSymbol;
  size?: keyof typeof sizeClass;
  showLabel?: boolean;
  noTooltip?: boolean;
  className?: string;
}

export function AssetIcon({
  symbol,
  size = "md",
  showLabel,
  noTooltip,
  className,
}: AssetIconProps) {
  const glyph = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-zinc-950 ring-1 ring-inset ring-white/[0.04]",
        sizeClass[size],
        className,
      )}
      aria-hidden
    >
      <SymbolIcon symbol={symbol} />
    </span>
  );

  const node = showLabel ? (
    <span className="inline-flex items-center gap-1.5">
      {glyph}
      <span className="font-mono text-[12px] text-zinc-100">{symbol}</span>
    </span>
  ) : (
    glyph
  );

  if (noTooltip) return node;

  const entry = MEZO_GLOSSARY[SYMBOL_TO_GLOSSARY[symbol]];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={symbol}
          className="inline-flex cursor-help items-center align-middle outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-full"
        >
          {node}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
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

function SymbolIcon({ symbol }: { symbol: AssetSymbol }): ReactNode {
  const address = SYMBOL_TO_ADDRESS[symbol];

  const urls = useMemo(
    () => (address ? getTokenIconUrls(address, 31612) : []),
    [address],
  );
  const [srcIdx, setSrcIdx] = useState(0);
  useEffect(() => { setSrcIdx(0); }, [address]);

  if (!address || srcIdx >= urls.length) {
    return renderGlyphFallback(symbol);
  }

  return (
    <img
      src={urls[srcIdx]}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setSrcIdx((i) => i + 1)}
    />
  );
}

function renderGlyphFallback(symbol: AssetSymbol): ReactNode {
  switch (symbol) {
    case "BTC":
      return <BtcGlyph />;
    case "MUSD":
      return <MusdGlyph />;
    case "sMUSD":
      return <SmusdGlyph />;
    case "MEZO":
      return <MezoGlyph />;
    case "veMEZO":
      return <VeMezoGlyph />;
    case "veBTC":
      return <VeBtcGlyph />;
  }
}

function BtcGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="h-full w-full" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="#F7931A" />
      <text
        x="10"
        y="14.5"
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontWeight="700"
        fontSize="12"
        fill="#ffffff"
      >
        ₿
      </text>
    </svg>
  );
}

function MusdGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="h-full w-full" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="#022c22" />
      <text
        x="10"
        y="14.5"
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontWeight="700"
        fontSize="12"
        fill="#34d399"
      >
        $
      </text>
    </svg>
  );
}

function SmusdGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="h-full w-full" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="#022c22" />
      <text
        x="10"
        y="14.5"
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontWeight="700"
        fontSize="12"
        fill="#6ee7b7"
      >
        $
      </text>
      <circle cx="15" cy="5.5" r="3" fill="#022c22" stroke="#6ee7b7" strokeWidth="0.6" />
      <text
        x="15"
        y="7"
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontWeight="700"
        fontSize="3.6"
        fill="#6ee7b7"
      >
        s
      </text>
    </svg>
  );
}

function MezoGlyph() {
  return (
    <svg viewBox="0 0 320 320" className="h-full w-full" aria-hidden>
      <circle cx="160" cy="160" r="160" fill="#1f0a1a" />
      <path
        fill="#FF004D"
        d="m75.235 191.087 31.207-31.089v-.138l31.059 31.089c8.976 8.942 19.953 12.919 30.781 12.919 22.658 0 44.454-17.597 44.454-44.008l31.058 31.089c8.976 8.942 19.953 12.919 30.782 12.919 22.657 0 44.453-17.597 44.453-44.008h-26.65l-31.059-30.941C252.344 119.977 241.229 116 230.4 116c-22.658 0-44.315 17.459-44.315 43.86l-31.058-30.941c-8.976-8.942-20.092-12.919-30.92-12.919-22.658 0-44.315 17.459-44.315 43.86L0 159.998c0 26.549 22.083 43.722 44.74 43.722 10.829 0 21.806-3.977 30.495-12.633"
      />
    </svg>
  );
}

function VeMezoGlyph() {
  return (
    <svg viewBox="0 0 320 320" className="h-full w-full" aria-hidden>
      <circle cx="160" cy="160" r="160" fill="#1a1233" />
      <circle
        cx="160"
        cy="160"
        r="140"
        fill="none"
        stroke="#c084fc"
        strokeWidth="6"
        strokeDasharray="20 14"
        opacity="0.55"
      />
      <path
        fill="#FF004D"
        opacity="0.85"
        d="m75.235 191.087 31.207-31.089v-.138l31.059 31.089c8.976 8.942 19.953 12.919 30.781 12.919 22.658 0 44.454-17.597 44.454-44.008l31.058 31.089c8.976 8.942 19.953 12.919 30.782 12.919 22.657 0 44.453-17.597 44.453-44.008h-26.65l-31.059-30.941C252.344 119.977 241.229 116 230.4 116c-22.658 0-44.315 17.459-44.315 43.86l-31.058-30.941c-8.976-8.942-20.092-12.919-30.92-12.919-22.658 0-44.315 17.459-44.315 43.86L0 159.998c0 26.549 22.083 43.722 44.74 43.722 10.829 0 21.806-3.977 30.495-12.633"
      />
    </svg>
  );
}

function VeBtcGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#1f1407" />
      <circle
        cx="16"
        cy="16"
        r="14"
        fill="none"
        stroke="#F7931A"
        strokeWidth="0.9"
        strokeDasharray="2.2 1.6"
        opacity="0.7"
      />
      <circle cx="16" cy="16" r="10.5" fill="#F7931A" opacity="0.9" />
      <text
        x="16"
        y="20.5"
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontWeight="700"
        fontSize="14"
        fill="#ffffff"
      >
        ₿
      </text>
    </svg>
  );
}
