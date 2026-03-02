import { ethers } from "ethers";
import type { Chain } from "../../../types";

/**
 * Token detection state setters interface.
 * Passed from the main component to avoid tight coupling.
 */
export interface TokenDetectionSetters {
  setIsLoadingContractInfo: (v: boolean) => void;
  setContractName: (v: string) => void;
  setTokenInfo: (v: { symbol?: string; name?: string; decimals?: number; assetAddress?: string } | null) => void;
  setTokenDetection: (v: {
    type: string;
    confidence: number;
    detectionMethod: string;
    isDiamond: boolean;
    tokenInfo?: { name?: string; symbol?: string; decimals?: number };
    error?: string;
  } | null) => void;
  setIsERC20: (v: boolean) => void;
  setIsERC721: (v: boolean) => void;
  setIsERC1155: (v: boolean) => void;
  setIsERC777: (v: boolean) => void;
  setIsERC4626: (v: boolean) => void;
  setIsERC2981: (v: boolean) => void;
  setIsDiamond: (v: boolean) => void;
}

export interface TokenDetectionState {
  isERC20: boolean;
  isERC721: boolean;
  isERC1155: boolean;
  isERC777: boolean;
  isERC4626: boolean;
  isERC2981: boolean;
  isDiamond: boolean;
  tokenInfo: { symbol?: string; name?: string; decimals?: number; assetAddress?: string } | null;
}

export interface TokenDetectionDeps {
  abiSource: string | null;
  contractAddress: string;
  selectedNetwork: Chain | null;
  contractName: string;
  createEthersProvider: (network: any) => Promise<ethers.providers.Provider>;
  state: TokenDetectionState;
  setters: TokenDetectionSetters;
}

/** Common return type for universal detection */
export interface UniversalDetectionResult {
  type: string;
  confidence: number;
  detectionMethod: string;
  isDiamond: boolean;
  tokenInfo?: { name?: string; symbol?: string; decimals?: number };
  error?: string;
}

/** Return type for function-based detection */
export interface FunctionDetectionResult {
  type: string;
  confidence: number;
  interfaces: string[];
  detectionMethod: string;
  isDiamond?: boolean;
}
