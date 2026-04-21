import { ethers } from "ethers";
import { SUPPORTED_CHAINS } from "../../utils/chains";

// Re-export types so existing consumers don't break
export type {
  TokenDetectionSetters,
  TokenDetectionState,
  TokenDetectionDeps,
} from "./tokenDetection/types";

import type { TokenDetectionDeps } from "./tokenDetection/types";
import { detectTokenTypeUniversal } from "./tokenDetection/universal";
import { detectTokenType } from "./tokenDetection/functionDetection";

/**
 * Detect and fetch token information for a contract.
 */
export async function detectAndFetchTokenInfo(
  deps: TokenDetectionDeps,
  abi: ethers.utils.Fragment[],
  preserveContractName: boolean = false,
  functionsParam: string[] = [],
  eventsParam: string[] = []
): Promise<void> {
  const {
    abiSource,
    contractAddress,
    selectedNetwork,
    contractName,
    createEthersProvider,
    state: {
      isERC20,
      isERC721,
      isERC1155,
      isERC777,
      isERC4626,
      isERC2981,
      isDiamond,
      tokenInfo,
    },
    setters: {
      setIsLoadingContractInfo,
      setContractName,
      setTokenInfo,
      setTokenDetection,
      setIsERC20,
      setIsERC721,
      setIsERC1155,
      setIsERC777,
      setIsERC4626,
      setIsERC2981,
      setIsDiamond,
    },
  } = deps;

// When restoring from context, preserve the existing contract name but still run detection
if (abiSource === "restored" && contractName && contractName.trim() !== "") {
  preserveContractName = true;
}

if (!contractAddress || !selectedNetwork) {
  setContractName("Unknown Contract");
  setTokenInfo(null);
  return;
}

setIsLoadingContractInfo(true);

try {
  try {
    // Use working RPC endpoints for different networks
    const rpcUrl = selectedNetwork?.rpcUrl || SUPPORTED_CHAINS[0].rpcUrl;

    const provider = await createEthersProvider(selectedNetwork);
    const contract = new ethers.Contract(contractAddress, abi, provider);

    // Perform universal token detection
    const tokenDetection = await detectTokenTypeUniversal(
      contractAddress,
      provider
    );

    // Enhanced detection specifically for Diamond contracts
    let enhancedDetection = { ...tokenDetection };

    // If Diamond detected but no token type, try additional detection methods
    if (tokenDetection.isDiamond && tokenDetection.type === "unknown") {

      // Try direct function calls for ERC721 detection
      try {
        const testContract = new ethers.Contract(
          contractAddress,
          [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function ownerOf(uint256) view returns (address)",
            "function tokenURI(uint256) view returns (string)",
          ],
          provider
        );

        const [name, symbol] = await Promise.all([
          testContract.name().catch(() => null),
          testContract.symbol().catch(() => null),
        ]);

        if (name && symbol) {
          // Try ERC721 specific functions
          try {
            await testContract.ownerOf(1);
            enhancedDetection.type = "ERC721";
            enhancedDetection.confidence = 0.9;
            enhancedDetection.detectionMethod =
              "enhanced-erc721-detection";
            enhancedDetection.tokenInfo = { name, symbol, decimals: 0 };
          } catch {
            // ownerOf() failed - not ERC721
          }
        }
      } catch {
        // Enhanced detection failed
      }
    }

    const erc20 = enhancedDetection.type === "ERC20";
    const erc721 = enhancedDetection.type === "ERC721";
    const erc1155 = enhancedDetection.type === "ERC1155";
    const erc777 = enhancedDetection.type === "ERC777";
    const erc4626 = enhancedDetection.type === "ERC4626";
    const erc2981 = enhancedDetection.type === "ERC2981";
    const diamond = !!(
      enhancedDetection.type === "Diamond" || enhancedDetection.isDiamond
    );

    // Prefer ERC165-based universal detection elsewhere; only set here if we still don't know
    if (!tokenDetection || tokenDetection.type === "unknown") {
      setTokenDetection(enhancedDetection);
      setIsERC20(erc20);
      setIsERC721(erc721);
      setIsERC1155(erc1155);
      setIsERC777(erc777);
      setIsERC4626(erc4626);
      setIsERC2981(erc2981);
    }
    // Always reflect diamond styling if detected
    setIsDiamond(diamond);

    // Universal token detection results processing
    if (tokenDetection.type !== "unknown" && tokenDetection.tokenInfo) {
      const { name, symbol, decimals } = tokenDetection.tokenInfo || {
        name: undefined,
        symbol: undefined,
        decimals: undefined,
      };

      // Format contract name based on token type
      let formattedName = contractName;
      if (!preserveContractName && symbol) {
        formattedName = `${tokenDetection.type}.${symbol}`;
        setContractName(formattedName);
      }

      // Set token info
      setTokenInfo({
        name: name || `${tokenDetection.type} Token`,
        symbol: symbol || tokenDetection.type,
        decimals:
          decimals ||
          (tokenDetection.type === "ERC20" ||
          tokenDetection.type === "ERC777"
            ? 18
            : 0),
      });

      return; // Skip all old token handling logic
    }

    // Fallback to old logic only if universal detection failed
    if (tokenDetection.type === "ERC20") {
      const [name, symbol, decimals] = await Promise.all([
        contract.name().catch(() => "Unknown Token"),
        contract.symbol().catch(() => "UNKNOWN"),
        contract.decimals().catch(() => 18),
      ]);

      const shouldPreserve =
        preserveContractName ||
        (contractName &&
          contractName !== "Smart Contract" &&
          contractName !== "ERC20 Token" &&
          contractName !== "Unknown Token" &&
          contractName !== "Unknown Contract" &&
          !contractName.startsWith("ERC") &&
          !contractName.startsWith("Unknown"));

      if (shouldPreserve) {
        // Preserve existing contract name
      } else {
        setContractName(`ERC20.${symbol}.${decimals}`);
      }
      setTokenInfo({ name, symbol, decimals });
    } else if (tokenDetection.type === "ERC721") {

      const hasNameFunction = abi.some(
        (item: any) => item.type === "function" && item.name === "name"
      );
      const hasSymbolFunction = abi.some(
        (item: any) => item.type === "function" && item.name === "symbol"
      );

      let name = "Unknown NFT";
      let symbol = "NFT";

      if (hasNameFunction && hasSymbolFunction) {
        try {
          const [fetchedName, fetchedSymbol] = await Promise.all([
            contract.name().catch(() => null),
            contract.symbol().catch(() => null),
          ]);

          name = fetchedName || name;
          symbol = fetchedSymbol || symbol;
        } catch {
          // Failed to fetch NFT info - use defaults
        }
      }

      const shouldPreserve =
        preserveContractName ||
        (contractName &&
          contractName !== "Smart Contract" &&
          contractName !== "ERC721 NFT" &&
          contractName !== "Unknown NFT" &&
          contractName !== "Unknown Contract" &&
          !contractName.startsWith("ERC") &&
          !contractName.startsWith("Unknown"));

      if (shouldPreserve) {
        // Preserve existing contract name
      } else {
        setContractName(`ERC721.${symbol}`);
      }
      setTokenInfo({ name, symbol, decimals: 0 });
    } else if (tokenDetection.type === "ERC1155") {

      let erc1155Contract = contract;

      const hasTokenFunctions =
        contract.functions?.name && contract.functions?.symbol;
      if (!hasTokenFunctions) {
        const erc1155ABI = [
          "function name() view returns (string)",
          "function symbol() view returns (string)",
          "function uri(uint256) view returns (string)",
        ];

        erc1155Contract = new ethers.Contract(
          contractAddress,
          erc1155ABI,
          provider
        );

      }

      let name = "Multi-Token";
      let symbol = "MTK";

      try {
        const tokenName = await contract.name();
        const tokenSymbol = await contract.symbol();
        if (tokenName) name = tokenName;
        if (tokenSymbol) symbol = tokenSymbol;
      } catch {
        // ERC1155 name call failed
      }

      try {
        if (
          erc1155Contract.functions?.symbol &&
          typeof erc1155Contract.functions.symbol === "function"
        ) {
          const tokenSymbol = await erc1155Contract.symbol();
          if (tokenSymbol) symbol = tokenSymbol;
        }
      } catch {
        // ERC1155 symbol call failed
      }

      const shouldPreserve =
        preserveContractName ||
        (contractName &&
          contractName !== "ERC1155 Token" &&
          contractName !== "Multi-Token" &&
          contractName !== "Unknown Contract" &&
          !contractName.startsWith("ERC") &&
          !contractName.startsWith("Unknown"));

      if (shouldPreserve) {
        // Preserve existing contract name
      } else {
        setContractName(`ERC1155.${symbol}`);
      }

      setTokenInfo({ name, symbol, decimals: 0 });
    } else if (tokenDetection.type === "ERC777") {
      const [name, symbol, decimals] = await Promise.all([
        contract.name().catch(() => "ERC777 Token"),
        contract.symbol().catch(() => "777"),
        contract.decimals().catch(() => 18),
      ]);

      const shouldPreserve =
        preserveContractName ||
        (contractName &&
          contractName !== "ERC777 Token" &&
          contractName !== "Unknown Contract" &&
          !contractName.startsWith("ERC") &&
          !contractName.startsWith("Unknown"));

      if (shouldPreserve) {
        // Preserve existing contract name
      } else {
        setContractName(`ERC777.${symbol}.${decimals}`);
      }
      setTokenInfo({ name, symbol, decimals });
    } else if (tokenDetection.type === "ERC4626") {
      const [name, symbol, decimals, assetAddress] = await Promise.all([
        contract.name().catch(() => "Tokenized Vault"),
        contract.symbol().catch(() => "VAULT"),
        contract.decimals().catch(() => 18),
        contract.asset().catch(() => "0x0000000000000000000000000000000000000000"),
      ]);

      const shouldPreserve =
        preserveContractName ||
        (contractName &&
          contractName !== "ERC4626 Vault" &&
          contractName !== "Tokenized Vault" &&
          contractName !== "Unknown Contract" &&
          !contractName.startsWith("ERC") &&
          !contractName.startsWith("Unknown"));

      if (shouldPreserve) {
        // Preserve existing contract name
      } else {
        setContractName(`ERC4626.${symbol}.${decimals}`);
      }
      setTokenInfo({ name, symbol, decimals, assetAddress });
    } else if (
      tokenDetection.isDiamond ||
      tokenDetection.type === "Diamond"
    ) {
      let finalName = contractName;
      let tokenSymbol: string | undefined;
      let tokenDecimals: number | undefined;

      try {
        if (functionsParam.includes("symbol")) {
          tokenSymbol = await contract.symbol();
        }

        if (functionsParam.includes("decimals")) {
          tokenDecimals = await contract.decimals();
        }

        if (tokenSymbol && finalName) {
          if (isERC721) {
            finalName = `ERC721.${tokenSymbol}`;
          } else if (isERC20) {
            finalName = `ERC20.${tokenSymbol}.${tokenDecimals}`;
          } else if (isERC1155) {
            finalName = `ERC1155.${tokenSymbol}`;
          } else {
            finalName = `Diamond.${tokenSymbol}`;
          }
        }
      } catch {
        if (!finalName || finalName === "Unknown Contract") {
          finalName = "Diamond Contract";
        }
      }

      setContractName(finalName);

      if (tokenSymbol !== undefined) {
        setTokenInfo({
          name: finalName,
          symbol: tokenSymbol,
          decimals: tokenDecimals || 0,
        });
      } else {
        setTokenInfo(null);
      }
    } else if (isERC2981) {
      let contractNameFound = false;

      const hasNameFunction = functionsParam.includes("name");
      if (hasNameFunction) {
        try {
          const name = await contract.name();
          if (name && name !== "Unknown Contract") {
            setContractName(name);
            contractNameFound = true;
          }
        } catch {
          // ERC2981 contract name fetch failed
        }
      }

      if (!contractNameFound && !contractName) {
        setContractName("Royalty Contract");
      }
      setTokenInfo(null);
    } else {
      let contractNameFound = false;

      const hasNameFunction = functionsParam.includes("name");

      if (hasNameFunction) {
        try {
          const name = await contract.name();
          const shouldOverride =
            !preserveContractName &&
            (!contractName ||
              contractName === "Smart Contract" ||
              contractName.startsWith("Unknown") ||
              contractName.startsWith("ERC"));

          if (shouldOverride) {
            setContractName(name || "Smart Contract");
          }
          setTokenInfo(null);
          contractNameFound = true;
        } catch {
          // Name function call failed
        }
      }

      setTokenInfo(null);
    }
  } catch (fetchError) {

    if (
      !preserveContractName &&
      abiSource !== "restored" &&
      (!contractName ||
        contractName.startsWith("Unknown") ||
        contractName.startsWith("ERC"))
    ) {
      if (isERC20) {
        setContractName("ERC20 Token");
        setTokenInfo({
          name: "ERC20 Token",
          symbol: "TOKEN",
          decimals: 18,
        });
      } else if (isERC721) {
        setContractName("ERC721 NFT");
        setTokenInfo({ name: "ERC721 NFT", symbol: "NFT", decimals: 0 });
      } else if (isERC1155) {
        setContractName("ERC1155 Multi-Token");
        setTokenInfo({
          name: "ERC1155 Multi-Token",
          symbol: "MTK",
          decimals: 0,
        });
      } else if (isERC777) {
        setContractName("ERC777 Token");
        setTokenInfo({
          name: "ERC777 Token",
          symbol: "777",
          decimals: 18,
        });
      } else if (isERC4626) {
        setContractName("ERC4626 Vault");
        setTokenInfo({
          name: "ERC4626 Vault",
          symbol: "VAULT",
          decimals: 18,
        });
      } else if (isDiamond) {
        setContractName("Diamond Proxy");
        setTokenInfo(null);
      } else if (isERC2981) {
        setContractName("Royalty Contract");
        setTokenInfo({
          name: "Royalty Contract",
          symbol: "ROYALTY",
          decimals: 0,
        });
      } else {
        if (!contractName) {
          setContractName("Unknown Contract");
        }
        setTokenInfo(null);
      }
    } else {
      setTokenInfo(null);
    }
  }
} catch {
  setTokenInfo(null);
} finally {
  setIsLoadingContractInfo(false);
}
}
