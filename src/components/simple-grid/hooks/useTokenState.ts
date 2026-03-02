/**
 * useTokenState – manages token detection flags and token info.
 *
 * Extracted from SimpleGridMain.tsx (pure structural split – no behaviour changes).
 */
import { useState } from "react";

export function useTokenState() {
  const [tokenInfo, setTokenInfo] = useState<{
    symbol?: string;
    name?: string;
    decimals?: number;
    assetAddress?: string;
  } | null>(null);

  const [tokenDetection, setTokenDetection] = useState<{
    type: string;
    confidence: number;
    detectionMethod: string;
    isDiamond: boolean;
    tokenInfo?: { name?: string; symbol?: string; decimals?: number };
    error?: string;
  } | null>(null);

  const [isERC20, setIsERC20] = useState(false);
  const [isERC721, setIsERC721] = useState(false);
  const [isERC1155, setIsERC1155] = useState(false);
  const [isERC777, setIsERC777] = useState(false);
  const [isERC4626, setIsERC4626] = useState(false);
  const [isERC2981, setIsERC2981] = useState(false);
  const [isDiamond, setIsDiamond] = useState(false);
  const [isDetectingTokenType, setIsDetectingTokenType] = useState(false);
  const [isLoadingContractInfo, setIsLoadingContractInfo] = useState(false);

  return {
    tokenInfo, setTokenInfo,
    tokenDetection, setTokenDetection,
    isERC20, setIsERC20,
    isERC721, setIsERC721,
    isERC1155, setIsERC1155,
    isERC777, setIsERC777,
    isERC4626, setIsERC4626,
    isERC2981, setIsERC2981,
    isDiamond, setIsDiamond,
    isDetectingTokenType, setIsDetectingTokenType,
    isLoadingContractInfo, setIsLoadingContractInfo,
  };
}
