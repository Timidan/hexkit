/**
 * Etherscan Source
 *
 * Uses `getsourcecode` so one proxy request returns the ABI, contract name,
 * compiler metadata, and proxy metadata in a single response.
 */

import type { Chain } from "../../../types";
import { postEtherscanLookup } from "../../etherscanProxy";
import type {
  AbiItem,
  ContractMetadata,
  ProxyInfo,
  SourceResult,
} from "../types";

const detectMissingApiKey = (message?: string): boolean =>
  typeof message === "string" && /missing\/invalid api key/i.test(message);

const isAbiVerified = (abi: string): boolean =>
  !!abi &&
  abi !== "Contract source code not verified" &&
  abi !== "Source code not verified" &&
  abi !== "[]";

const isValidAddress = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
};

export async function fetchEtherscan(
  address: string,
  chain: Chain,
  apiKey: string | undefined,
  signal?: AbortSignal
): Promise<SourceResult> {
  const etherscanExplorer = chain.explorers?.find((e) => e.type === "etherscan");
  if (!etherscanExplorer) {
    return { success: false, error: "No Etherscan API available for this network" };
  }

  if (signal?.aborted) {
    return { success: false, error: "Aborted" };
  }

  const normalizedAddress = address.toLowerCase();

  try {
    const response = await postEtherscanLookup({
      action: "getsourcecode",
      address: normalizedAddress,
      chainId: chain.id,
      personalApiKey: apiKey,
      signal,
    });
    const data = await response.json();

    if (!response.ok) {
      if (data?.error === "explorer_key_not_configured") {
        return {
          success: false,
          error: "Explorer API key not configured",
          needsApiKey: true,
        };
      }

      return {
        success: false,
        error: `Could not retrieve ABI from Etherscan: ${data?.error || `HTTP ${response.status}`}`,
      };
    }

    if (detectMissingApiKey(data?.result) || detectMissingApiKey(data?.message)) {
      return {
        success: false,
        error: "Etherscan API requires a valid API key. Add one in settings and retry.",
        needsApiKey: true,
      };
    }

    if (data?.status !== "1" || !Array.isArray(data?.result) || data.result.length === 0) {
      const error = data?.result || data?.message || "Unknown error";
      return {
        success: false,
        error: `Could not retrieve ABI from Etherscan: ${error}`,
      };
    }

    const contract = data.result[0];
    const abiString = contract?.ABI;

    if (!abiString || !isAbiVerified(abiString)) {
      return {
        success: false,
        error: "Could not retrieve ABI from Etherscan: ABI not available on Etherscan",
      };
    }

    let abi: AbiItem[];
    try {
      abi = JSON.parse(abiString);
      if (!Array.isArray(abi)) {
        return {
          success: false,
          error: "Could not retrieve ABI from Etherscan: Invalid ABI format",
        };
      }
    } catch {
      return {
        success: false,
        error: "Could not retrieve ABI from Etherscan: Failed to parse ABI",
      };
    }

    const name =
      contract.ContractName ||
      contract.contractName ||
      contract.Contract_Name ||
      null;

    let proxyInfo: ProxyInfo | undefined;
    const proxyFlag = String(
      contract.Proxy ?? contract.proxy ?? contract.isProxy ?? ""
    ).toLowerCase();
    if (proxyFlag === "1" || proxyFlag === "true") {
      const impl =
        contract.Implementation ||
        contract.implementation ||
        contract.ImplementationAddress ||
        contract.implementationAddress;
      proxyInfo = {
        isProxy: true,
        proxyType: "eip1967",
        implementationAddress: isValidAddress(impl) ? impl : undefined,
        implementations: isValidAddress(impl) ? [impl] : undefined,
      };
    }

    let sourceCode: string | undefined;
    if (contract.SourceCode) {
      const rawSource = contract.SourceCode;
      if (rawSource.startsWith("{{") || rawSource.startsWith("{")) {
        try {
          const jsonStr = rawSource.startsWith("{{")
            ? rawSource.slice(1, -1)
            : rawSource;
          const parsed = JSON.parse(jsonStr);

          if (parsed.sources && typeof parsed.sources === "object") {
            const sourceFiles = Object.entries(parsed.sources);
            if (sourceFiles.length > 0) {
              const mainFile = sourceFiles.find(([path]) =>
                path.toLowerCase().includes((name || "").toLowerCase())
              );
              if (mainFile && (mainFile[1] as { content?: string })?.content) {
                sourceCode = (mainFile[1] as { content: string }).content;
              } else {
                const firstSource = sourceFiles[0][1] as { content?: string };
                sourceCode = firstSource?.content;
              }
            }
          } else if ((parsed as { content?: string }).content) {
            sourceCode = (parsed as { content: string }).content;
          } else {
            sourceCode = rawSource;
          }
        } catch {
          sourceCode = rawSource;
        }
      } else {
        sourceCode = rawSource;
      }
    }

    const metadata: ContractMetadata = {
      compiler: "Solidity",
      compilerVersion: contract.CompilerVersion || undefined,
      optimization: contract.OptimizationUsed === "1",
      optimizationRuns: contract.Runs ? parseInt(contract.Runs, 10) : undefined,
      evmVersion: contract.EVMVersion || undefined,
      license: contract.LicenseType || undefined,
      constructorArguments: contract.ConstructorArguments || undefined,
      sourceCode,
    };

    return {
      success: true,
      abi,
      name: name && name !== "Smart Contract" ? name : null,
      confidence: "verified",
      source: "etherscan",
      metadata,
      proxyInfo,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "Aborted" };
    }

    return {
      success: false,
      error: `Could not retrieve ABI from Etherscan: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
