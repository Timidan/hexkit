import { ethers } from "ethers";
import type { FunctionDetectionResult } from "./types";
import { detectTokenInterfaces } from "./erc165";
import { verifyDiamondStandard } from "./diamond";

// Define function info type for fallback detection
type FunctionInfo = {
  type: string;
  weight: number;
  sharedTypes?: string[];
};

/** Function signatures for fallback detection */
export const FUNCTIONS: Record<string, FunctionInfo> = {
  // Highly specific functions (unique to token types)
  "ownerOf(uint256)": { type: "ERC721", weight: 1.0 },
  "tokenURI(uint256)": { type: "ERC721", weight: 0.8 },
  "balanceOf(address,uint256)": { type: "ERC1155", weight: 1.0 },
  "balanceOfBatch(address[],uint256[])": {
    type: "ERC1155",
    weight: 1.0,
  },
  "safeTransferFrom(address,address,uint256,uint256,bytes)": {
    type: "ERC1155",
    weight: 1.0,
  },
  "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)": {
    type: "ERC1155",
    weight: 1.0,
  },
  "uri(uint256)": { type: "ERC1155", weight: 0.8 },
  "send(address,uint256,bytes)": { type: "ERC777", weight: 1.0 },
  "burn(uint256,bytes)": { type: "ERC777", weight: 1.0 },
  "isOperatorFor(address,address)": { type: "ERC777", weight: 0.8 },
  "authorizeOperator(address)": { type: "ERC777", weight: 0.8 },
  "revokeOperator(address)": { type: "ERC777", weight: 0.8 },
  "asset()": { type: "ERC4626", weight: 1.0 },
  "totalAssets()": { type: "ERC4626", weight: 1.0 },
  "convertToShares(uint256)": { type: "ERC4626", weight: 0.8 },
  "convertToAssets(uint256)": { type: "ERC4626", weight: 0.8 },
  "maxDeposit(address)": { type: "ERC4626", weight: 0.8 },
  "previewDeposit(uint256)": { type: "ERC4626", weight: 0.8 },
  "deposit(uint256,address)": { type: "ERC4626", weight: 0.8 },
  "maxMint(address)": { type: "ERC4626", weight: 0.8 },
  "previewMint(uint256)": { type: "ERC4626", weight: 0.8 },
  "mint(uint256,address)": { type: "ERC4626", weight: 0.8 },
  "maxWithdraw(address)": { type: "ERC4626", weight: 0.8 },
  "previewWithdraw(uint256)": { type: "ERC4626", weight: 0.8 },
  "withdraw(uint256,address,address)": { type: "ERC4626", weight: 0.8 },
  "maxRedeem(address)": { type: "ERC4626", weight: 0.8 },
  "previewRedeem(uint256)": { type: "ERC4626", weight: 0.8 },
  "redeem(uint256,address,address)": { type: "ERC4626", weight: 0.8 },
  "royaltyInfo(uint256,uint256)": { type: "ERC2981", weight: 1.0 },

  // Shared functions with multiple token types
  "totalSupply()": {
    type: "SHARED",
    weight: 1.0,
    sharedTypes: ["ERC20", "ERC721"],
  },
  "balanceOf(address)": {
    type: "SHARED",
    weight: 1.0,
    sharedTypes: ["ERC20", "ERC721", "ERC1155"],
  },
  "transfer(address,uint256)": {
    type: "SHARED",
    weight: 1.0,
    sharedTypes: ["ERC20"],
  },
  "transferFrom(address,address,uint256)": {
    type: "SHARED",
    weight: 1.0,
    sharedTypes: ["ERC20", "ERC721"],
  },
  "approve(address,uint256)": {
    type: "SHARED",
    weight: 1.0,
    sharedTypes: ["ERC20", "ERC721"],
  },
  "allowance(address,address)": {
    type: "SHARED",
    weight: 1.0,
    sharedTypes: ["ERC20"],
  },
  "name()": {
    type: "SHARED",
    weight: 0.5,
    sharedTypes: ["ERC20", "ERC721"],
  },
  "symbol()": {
    type: "SHARED",
    weight: 0.5,
    sharedTypes: ["ERC20", "ERC721"],
  },
  "decimals()": {
    type: "SHARED",
    weight: 0.8,
    sharedTypes: ["ERC20", "ERC4626"],
  },
  "safeTransferFrom(address,address,uint256)": {
    type: "SHARED",
    weight: 1.0,
    sharedTypes: ["ERC721", "ERC1155"],
  },
  "safeTransferFrom(address,address,uint256,bytes)": {
    type: "SHARED",
    weight: 1.0,
    sharedTypes: ["ERC721"],
  },
  "setApprovalForAll(address,bool)": {
    type: "SHARED",
    weight: 0.8,
    sharedTypes: ["ERC721", "ERC1155"],
  },
  "isApprovedForAll(address,address)": {
    type: "SHARED",
    weight: 0.8,
    sharedTypes: ["ERC721", "ERC1155"],
  },
  "tokenByIndex(uint256)": {
    type: "SHARED",
    weight: 0.5,
    sharedTypes: ["ERC721"],
  },
  "tokenOfOwnerByIndex(address,uint256)": {
    type: "SHARED",
    weight: 0.5,
    sharedTypes: ["ERC721"],
  },
  "defaultOperators()": {
    type: "SHARED",
    weight: 0.5,
    sharedTypes: ["ERC777"],
  },

  // Common utility functions (lower weight)
  "supportsInterface(bytes4)": { type: "UTILITY", weight: 0.2 },
};

/** Event signatures with importance weights */
export const EVENTS = {
  "Transfer(address,address,uint256)": { type: "ERC20", weight: 0.8 },
  "Transfer(address,address,uint256,bytes)": {
    type: "ERC777",
    weight: 0.8,
  },
  "Transfer(address,address,uint256,uint256,bytes)": {
    type: "ERC1155",
    weight: 0.8,
  },
  "TransferSingle(address,address,address,uint256,uint256)": {
    type: "ERC1155",
    weight: 0.8,
  },
  "TransferBatch(address,address,address,uint256[],uint256[])": {
    type: "ERC1155",
    weight: 0.8,
  },
  "Approval(address,address,uint256)": {
    type: "ERC20/ERC721",
    weight: 0.6,
  },
  "ApprovalForAll(address,address,bool)": {
    type: "ERC721/ERC1155",
    weight: 0.7,
  },
  "Mint(address,uint256)": { type: "ERC20/ERC721", weight: 0.5 },
  "Burn(address,uint256)": { type: "ERC20/ERC721", weight: 0.5 },
  "URI(string,uint256)": { type: "ERC1155", weight: 0.6 },
};

/**
 * Enhanced token detection with multi-factor analysis.
 * Uses ERC165 interface checks, function presence heuristics,
 * diamond pattern detection, and function/event scoring.
 */
export async function detectTokenType(
  functionsParam: string[],
  eventsParam: string[],
  contract: ethers.Contract,
  contractAddress: string,
  provider: ethers.providers.Provider
): Promise<FunctionDetectionResult> {
  // Step 1: Check for Diamond standard first
  const isDiamond = await verifyDiamondStandard(
    contractAddress,
    provider
  );

  // Step 2: Check ERC165 interfaces
  const supportedInterfaces = await detectTokenInterfaces(
    contractAddress,
    provider
  );

  // Step 3: Determine token type based on supported interfaces
  let detectedType = "unknown";
  let confidence = 0;
  let detectionMethod = "none";

  if (supportedInterfaces.includes("ERC1155")) {
    detectedType = "ERC1155";
    confidence = 0.95;
    detectionMethod = "erc165-interface";
  } else if (supportedInterfaces.includes("ERC721")) {
    detectedType = "ERC721";
    confidence = 0.95;
    detectionMethod = "erc165-interface";
  } else if (supportedInterfaces.includes("ERC20")) {
    detectedType = "ERC20";
    confidence = 0.95;
    detectionMethod = "erc165-interface";
  } else if (supportedInterfaces.includes("ERC777")) {
    detectedType = "ERC777";
    confidence = 0.95;
    detectionMethod = "erc165-interface";
  } else if (supportedInterfaces.includes("ERC4626")) {
    detectedType = "ERC4626";
    confidence = 0.95;
    detectionMethod = "erc165-interface";
  } else if (supportedInterfaces.includes("ERC2981")) {
    detectedType = "ERC2981";
    confidence = 0.8;
    detectionMethod = "erc165-interface";
  } else {
    // Fallback to function-based detection
    const hasOwnerOf = functionsParam.some(
      (func: string) =>
        func.includes("ownerOf(uint256)") ||
        func.includes("ownerOf(uint256,address)")
    );
    const hasTokenURI = functionsParam.some(
      (func: string) =>
        func.includes("tokenURI(uint256)") ||
        func.includes("tokenUrl(uint256)")
    );
    const hasBalanceOf = functionsParam.some(
      (func: string) =>
        func.includes("balanceOf(address)") ||
        func.includes("balanceOf(address,uint256)")
    );
    const hasTransferFrom = functionsParam.some((func: string) =>
      func.includes("transferFrom(address,address,uint256)")
    );

    const hasERC721CoreFunctions =
      hasOwnerOf && hasTokenURI && (hasBalanceOf || hasTransferFrom);

    const hasERC20CoreFunctions = functionsParam.some(
      (func: string) =>
        func.includes("balanceOf(address)") &&
        func.includes("transfer(address,uint256)") &&
        func.includes("allowance(address,address)")
    );

    const hasERC1155CoreFunctions = functionsParam.some(
      (func: string) =>
        func.includes("balanceOf(address,uint256)") &&
        func.includes(
          "safeTransferFrom(address,address,uint256,uint256,bytes)"
        )
    );

    const hasNFTFunctions =
      hasOwnerOf &&
      functionsParam.some(
        (func: string) =>
          func.includes("approve(address,uint256)") ||
          func.includes("setApprovalForAll(address,bool)") ||
          func.includes("getApproved(uint256)")
      );

    if (hasERC721CoreFunctions || (hasOwnerOf && hasNFTFunctions)) {
      detectedType = "ERC721";
      confidence = hasERC721CoreFunctions ? 0.8 : 0.7;
      detectionMethod = "function-detection";
    } else if (hasERC20CoreFunctions) {
      detectedType = "ERC20";
      confidence = 0.8;
      detectionMethod = "function-detection";
    } else if (hasERC1155CoreFunctions) {
      detectedType = "ERC1155";
      confidence = 0.8;
      detectionMethod = "function-detection";
    } else {
      const isDiamondProxy = functionsParam.some(
        (func: string) =>
          func.includes("facet") ||
          func.includes("diamond") ||
          func.includes("getDefaultFacetAddresses") ||
          func.includes("facets")
      );

      if (isDiamondProxy) {
        const hasERC1155Functions = functionsParam.some(
          (func: string) =>
            func.includes(
              "safeTransferFrom(address,address,uint256,uint256,bytes)"
            ) ||
            func.includes(
              "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)"
            ) ||
            func.includes("balanceOfBatch(address[],uint256[])") ||
            func.includes("uri(uint256)")
        );

        const hasERC721Functions = functionsParam.some(
          (func: string) =>
            func.includes("tokenOfOwnerByIndex(address,uint256)") ||
            func.includes("tokenByIndex(uint256)") ||
            func.includes("ownerOf(uint256)")
        );

        const hasERC20Functions = functionsParam.some(
          (func: string) =>
            func.includes("allowance(address,address)") ||
            func.includes("decimals()")
        );

        if (hasERC1155Functions) {
          detectedType = "ERC1155";
          confidence = 0.9;
          detectionMethod = "diamond-erc1155";
        } else if (hasERC721Functions) {
          detectedType = "ERC721";
          confidence = 0.9;
          detectionMethod = "diamond-erc721";
        } else if (hasERC20Functions) {
          detectedType = "ERC20";
          confidence = 0.9;
          detectionMethod = "diamond-erc20";
        } else {
          detectedType = "Diamond";
          confidence = 0.8;
          detectionMethod = "diamond-pattern";
        }
      } else {
        // Use function-based scoring as fallback
        const scores: Record<string, number> = {};

        functionsParam.forEach((func: string) => {
          const funcInfo = FUNCTIONS[func as keyof typeof FUNCTIONS];
          if (funcInfo) {
            if (funcInfo.type === "SHARED") {
              funcInfo.sharedTypes?.forEach((sharedType: string) => {
                scores[sharedType] =
                  (scores[sharedType] || 0) + funcInfo.weight;
              });
            } else {
              scores[funcInfo.type] =
                (scores[funcInfo.type] || 0) + funcInfo.weight;
            }
          }
        });

        const maxScore = Math.max(...Object.values(scores));
        if (maxScore > 0) {
          const topType = Object.entries(scores).find(
            ([_, score]) => score === maxScore
          )?.[0];
          if (topType) {
            detectedType = topType;
            confidence = Math.min(maxScore / 5, 0.8);
            detectionMethod = "function-scoring";
          }
        }
      }
    }

    return {
      type: detectedType,
      confidence,
      interfaces: supportedInterfaces,
      detectionMethod,
      isDiamond,
    };
  }

  // --- Below is the full scoring path (when ERC165 detected a type above) ---

  const scores: Record<string, number> = {};
  const detectedInterfaces: string[] = [];

  const hasSupportsInterface = functionsParam.includes(
    "supportsInterface(bytes4)"
  );
  if (hasSupportsInterface) {
    detectedInterfaces.push("ERC165");
  }

  const isDiamondProxy = functionsParam.some(
    (func: string) =>
      func.includes("facet") ||
      func.includes("diamond") ||
      func.includes("getDefaultFacetAddresses") ||
      func.includes("facets")
  );

  if (isDiamondProxy) {
    detectedInterfaces.push("Diamond");
    scores["Diamond"] = (scores["Diamond"] || 0) + 0.5;
  }

  // Score functions
  functionsParam.forEach((func: string) => {
    const funcInfo = FUNCTIONS[func as keyof typeof FUNCTIONS];
    if (funcInfo) {
      if (funcInfo.type === "SHARED") {
        funcInfo.sharedTypes?.forEach((sharedType: string) => {
          scores[sharedType] =
            (scores[sharedType] || 0) + funcInfo.weight;
        });
      } else {
        scores[funcInfo.type] =
          (scores[funcInfo.type] || 0) + funcInfo.weight;
      }
    }
  });

  // Score events
  eventsParam.forEach((event: string) => {
    const eventInfo = EVENTS[event as keyof typeof EVENTS];
    if (eventInfo) {
      const type =
        eventInfo.type === "ERC20/ERC721"
          ? "ERC20"
          : eventInfo.type === "ERC721/ERC1155"
            ? "ERC721"
            : eventInfo.type;
      scores[type] = (scores[type] || 0) + eventInfo.weight;
    }
  });

  // Calculate maximum possible scores for confidence calculation
  const maxScores: Record<string, number> = {
    ERC20: 6.5,
    ERC721: 6.8,
    ERC1155: 6.8,
    ERC777: 5.1,
    ERC4626: 10.4,
    ERC2981: 1.0,
  };

  const minConfidence = 0.4;

  if ((scores.ERC20 || 0) >= minConfidence * maxScores.ERC20) {
    const conf = Math.min(
      (scores.ERC20 || 0) / maxScores.ERC20,
      1.0
    );
    return {
      type: "ERC20",
      confidence: conf,
      interfaces: detectedInterfaces,
      detectionMethod: "function+event+interface",
    };
  } else if ((scores.ERC721 || 0) >= minConfidence * maxScores.ERC721) {
    const conf = Math.min(
      (scores.ERC721 || 0) / maxScores.ERC721,
      1.0
    );
    return {
      type: "ERC721",
      confidence: conf,
      interfaces: detectedInterfaces,
      detectionMethod: "function+event+interface",
    };
  } else if ((scores.ERC1155 || 0) >= minConfidence * maxScores.ERC1155) {
    const conf = Math.min(
      (scores.ERC1155 || 0) / maxScores.ERC1155,
      1.0
    );
    return {
      type: "ERC1155",
      confidence: conf,
      interfaces: detectedInterfaces,
      detectionMethod: "function+event+interface",
    };
  } else if ((scores.ERC777 || 0) >= minConfidence * maxScores.ERC777) {
    const conf = Math.min(
      (scores.ERC777 || 0) / maxScores.ERC777,
      1.0
    );
    return {
      type: "ERC777",
      confidence: conf,
      interfaces: detectedInterfaces,
      detectionMethod: "function+event+interface",
    };
  } else if ((scores.ERC4626 || 0) >= minConfidence * maxScores.ERC4626) {
    const conf = Math.min(
      (scores.ERC4626 || 0) / maxScores.ERC4626,
      1.0
    );
    return {
      type: "ERC4626",
      confidence: conf,
      interfaces: detectedInterfaces,
      detectionMethod: "function+event+interface",
    };
  } else {
    return {
      type: "unknown",
      confidence: 0,
      interfaces: detectedInterfaces,
      detectionMethod: "function+event+interface",
    };
  }
}
