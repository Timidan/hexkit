// Inline token icon used by the Token Movements table and the Events
// tab. Falls back gracefully through three layers:
//
//   1. Bundled / registry / CoinGecko logoUri via useTokenIcon().
//   2. If the <img> hits a 404 / hot-link block, swap to the letter-disc.
//   3. If we have no registry entry at all, render the letter-disc with
//      the first hex digit (so it still looks deliberate).
//
// `loading="lazy"`, `decoding="async"`, and `referrerPolicy="no-referrer"`
// keep us friendly to CDNs that block hot-linkers, and let the browser
// defer offscreen images.

import { useState } from "react";
import { useTokenIcon } from "@/lib/starknet-token-icons";

const DISC_PALETTE = [
  "#3b82f6", // blue
  "#a855f7", // purple
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
];

function discColorFor(addr: string): string {
  // Hash the address into a deterministic palette slot. We strip the
  // 0x prefix and parse a stable byte from the tail so leading-zero
  // variants don't shift hue.
  const tail = addr.replace(/^0x/, "").slice(-6) || "0";
  let h = 0;
  for (const ch of tail) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return DISC_PALETTE[Math.abs(h) % DISC_PALETTE.length];
}

function firstLetter(symbolOrAddr: string): string {
  const trimmed = (symbolOrAddr || "").trim();
  if (!trimmed) return "?";
  // For symbols, take the first alpha char. For raw hex, take the
  // first non-zero hex digit so "0x000049d3…" doesn't render as "0".
  if (trimmed.startsWith("0x")) {
    const tail = trimmed.replace(/^0x0*/, "");
    return (tail[0] ?? "0").toUpperCase();
  }
  return trimmed[0]?.toUpperCase() ?? "?";
}

export interface TokenIconProps {
  addr: string | null | undefined;
  /** Pixel size (square). Defaults to 16. */
  size?: number;
  /** Override symbol for the letter-disc fallback. Useful when the
   *  caller already resolved the symbol from a different source. */
  symbol?: string | null;
  className?: string;
}

export function TokenIcon({
  addr,
  size = 16,
  symbol,
  className,
}: TokenIconProps) {
  const info = useTokenIcon(addr ?? null);
  const [imgFailed, setImgFailed] = useState(false);

  // Reset error state if the URL changes (e.g. registry fill replaces a
  // null logoUri with a real one after the async fetch lands).
  const logoUri = info?.logoUri ?? null;
  const sizePx = `${size}px`;

  if (logoUri && !imgFailed) {
    return (
      <img
        src={logoUri}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={className}
        style={{
          width: sizePx,
          height: sizePx,
          borderRadius: "50%",
          flexShrink: 0,
          objectFit: "cover",
          background: "rgba(255,255,255,0.04)",
        }}
      />
    );
  }

  const label = firstLetter(symbol ?? info?.symbol ?? addr ?? "");
  const bg = discColorFor(addr ?? "");
  return (
    <span
      role="img"
      aria-label={info?.symbol ?? "token"}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: sizePx,
        height: sizePx,
        borderRadius: "50%",
        background: bg,
        color: "#fff",
        fontSize: `${Math.max(8, Math.floor(size * 0.6))}px`,
        fontWeight: 600,
        flexShrink: 0,
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      {label}
    </span>
  );
}
