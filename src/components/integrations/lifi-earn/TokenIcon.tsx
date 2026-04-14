import React, { useMemo, useState } from "react";
import { getTokenIconUrls } from "../../../utils/tokenMovements";

interface TokenIconProps {
  token: { address: string; symbol: string; logoURI?: string };
  chainId: number;
  className?: string;
}

export function TokenIcon({ token, chainId, className }: TokenIconProps) {
  const urls = useMemo(() => {
    const sources = token.logoURI ? [token.logoURI] : [];
    sources.push(...getTokenIconUrls(token.address, chainId));
    return sources;
  }, [token.address, token.logoURI, chainId]);

  const [srcIndex, setSrcIndex] = useState(0);
  const fallbackSvg = useMemo(
    () =>
      `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44'><rect width='44' height='44' rx='22' fill='%23374151'/><text x='50%25' y='54%25' text-anchor='middle' dominant-baseline='middle' font-size='15' font-family='system-ui' fill='%239ca3af'>${encodeURIComponent(token.symbol.charAt(0).toUpperCase())}</text></svg>`,
    [token.symbol],
  );

  const currentSrc = srcIndex < urls.length ? urls[srcIndex] : fallbackSvg;

  return (
    <img
      src={currentSrc}
      alt={token.symbol}
      className={className}
      onError={() => {
        if (srcIndex < urls.length) {
          setSrcIndex((i) => i + 1);
        }
      }}
    />
  );
}
