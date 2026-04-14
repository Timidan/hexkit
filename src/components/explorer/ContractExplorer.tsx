import React, { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle, ArrowSquareOut } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { animate, stagger } from "animejs";
import ContractAddressInput from "@/components/contract/ContractAddressInput";
import { SolidityViewer } from "./SolidityViewer";
import {
  resolveContractContext,
  type ContractContext,
} from "@/utils/resolver/contractContext";
import {
  extractSourceFiles,
  sortSourceFiles,
} from "@/utils/resolver/sourceExtractor";
import type { SourceFile } from "@/utils/resolver/sourceExtractor";
import type { Source, ProxyInfo, TokenInfo } from "@/utils/resolver/types";
import type { Chain } from "@/types";
import {
  getExplorerChains,
  getChainById,
  getExplorerBaseUrlFromApiUrl,
} from "@/utils/chains";
import { isAddress } from "ethers/lib/utils";
import {
  SourceBadge,
  ProxyTypeBadge,
  DiamondBadge,
  TokenTypeBadge,
} from "@/components/shared/ContractBadges";
import { cn } from "@/lib/utils";

interface ContractInfo {
  name: string | null;
  address: string;
  chainId: number;
  verified: boolean;
  source: Source | null;
  compilerVersion?: string;
  proxyInfo?: ProxyInfo;
  tokenInfo?: TokenInfo;
  tokenType?: "ERC20" | "ERC721" | "ERC1155" | "ERC777" | "ERC4626" | null;
}

interface SourceVariant {
  id: "proxy" | "implementation";
  label: string;
  files: SourceFile[];
  mainFile: string | null;
  source: Source | null;
  info: {
    name: string | null;
    source: Source | null;
    compilerVersion?: string;
    verified: boolean;
  };
}

const ContractExplorer: React.FC = () => {
  // Only chains with a configured explorer API — without one, the ABI/source
  // fetch would bail out with "No … API available" immediately.
  const explorerChains = React.useMemo(() => getExplorerChains(), []);

  const [addressInput, setAddressInput] = useState("");
  const [selectedChain, setSelectedChain] = useState<Chain>(
    getChainById(1) || explorerChains[0],
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [sourceVariants, setSourceVariants] = useState<SourceVariant[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<
    "proxy" | "implementation" | null
  >(null);
  const [baseContractInfo, setBaseContractInfo] = useState<Pick<
    ContractInfo,
    "address" | "chainId" | "proxyInfo" | "tokenInfo" | "tokenType"
  > | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);
  const prevSourceFilesLength = useRef(0);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (
      sourceFiles.length > 0 &&
      prevSourceFilesLength.current === 0 &&
      resultsRef.current
    ) {
      // Animate the info bar badges
      animate(resultsRef.current.querySelectorAll(".info-badge"), {
        translateY: [20, 0],
        opacity: [0, 1],
        delay: stagger(50),
        duration: 400,
        ease: "outCubic",
      });

      // Animate the code viewer container
      const codeViewer = resultsRef.current.querySelector(".code-viewer");
      if (codeViewer) {
        animate(codeViewer, {
          translateY: [30, 0],
          opacity: [0, 1],
          duration: 500,
          delay: 150,
          ease: "outCubic",
        });
      }

      setHasAnimated(true);
    }
    if (sourceFiles.length === 0) {
      setHasAnimated(false);
    }
    prevSourceFilesLength.current = sourceFiles.length;
  }, [sourceFiles.length]);

  const handleNetworkChange = useCallback(
    (chain: Chain) => {
      setSelectedChain(chain);
      // Clear results when network changes
      if (sourceFiles.length > 0) {
        setSourceFiles([]);
        setSelectedFile(null);
        setContractInfo(null);
        setSourceVariants([]);
        setSelectedSourceId(null);
        setBaseContractInfo(null);
        setError(null);
      }
    },
    [sourceFiles.length],
  );

  const handleAddressChange = useCallback((value: string) => {
    setAddressInput(value);
    setError(null);
  }, []);

  const fetchContract = useCallback(async () => {
    const address = addressInput.trim();

    if (!address) {
      setError("Please enter a contract address");
      return;
    }

    if (!isAddress(address)) {
      setError("Invalid Ethereum address");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    setSourceFiles([]);
    setSelectedFile(null);
    setContractInfo(null);
    setSourceVariants([]);
    setSelectedSourceId(null);
    setBaseContractInfo(null);

    try {
      const ctx = await resolveContractContext(address, selectedChain, {
        abi: true,
        proxy: true,
        token: true,
        signal: controller.signal,
      });

      if (!ctx.exists) {
        setError("No contract found at this address.");
        return;
      }

      const variants: SourceVariant[] = [];

      if (ctx.verified && ctx.metadata) {
        const { files, mainFile } = extractSourceFiles({
          address: ctx.address,
          chainId: ctx.chainId,
          chain: selectedChain,
          abi: ctx.abi,
          name: ctx.proxyName || ctx.name,
          source: ctx.source,
          confidence: ctx.confidence,
          verified: ctx.verified,
          functions: ctx.functions,
          metadata: ctx.metadata,
          attempts: ctx.attempts,
          resolvedAt: ctx.resolvedAt,
          durationMs: ctx.durationMs,
          fromCache: ctx.fromCache,
        });

        if (files.length > 0) {
          variants.push({
            id: "proxy",
            label: "Proxy",
            files,
            mainFile,
            source: ctx.source,
            info: {
              name: ctx.proxyName || ctx.name,
              source: ctx.source,
              compilerVersion: ctx.metadata?.compilerVersion,
              verified: ctx.verified,
            },
          });
        }
      }

      if (ctx.implementationVerified && ctx.implementationMetadata) {
        const { files, mainFile } = extractSourceFiles({
          address: ctx.implementationAddress || ctx.address,
          chainId: ctx.chainId,
          chain: selectedChain,
          abi: ctx.implementationAbi,
          name: ctx.implementationName,
          source: ctx.implementationSource,
          confidence: ctx.implementationConfidence || "bytecode-only",
          verified: ctx.implementationVerified,
          functions: ctx.functions,
          metadata: ctx.implementationMetadata,
          attempts: ctx.implementationAttempts,
          resolvedAt: ctx.resolvedAt,
          durationMs: ctx.durationMs,
          fromCache: ctx.fromCache,
        });

        if (files.length > 0) {
          variants.push({
            id: "implementation",
            label: "Implementation",
            files,
            mainFile,
            source: ctx.implementationSource,
            info: {
              name: ctx.implementationName,
              source: ctx.implementationSource,
              compilerVersion: ctx.implementationMetadata?.compilerVersion,
              verified: ctx.implementationVerified,
            },
          });
        }
      }

      if (variants.length === 0) {
        setError("No source code available for this contract.");
        return;
      }

      const defaultVariant =
        variants.find((v) => v.id === "proxy") || variants[0];

      const sortedFiles = sortSourceFiles(
        defaultVariant.files,
        defaultVariant.mainFile,
      );
      setSourceFiles(sortedFiles);
      setSelectedFile(defaultVariant.mainFile || sortedFiles[0]?.path || null);
      setSourceVariants(variants);
      setSelectedSourceId(defaultVariant.id);
      setBaseContractInfo({
        address: ctx.address,
        chainId: ctx.chainId,
        proxyInfo: ctx.proxyInfo || undefined,
        tokenInfo: ctx.tokenInfo || undefined,
        tokenType: ctx.tokenType,
      });
      setContractInfo({
        name: defaultVariant.info.name,
        address: ctx.address,
        chainId: ctx.chainId,
        verified: defaultVariant.info.verified,
        source: defaultVariant.info.source,
        compilerVersion: defaultVariant.info.compilerVersion,
        proxyInfo: ctx.proxyInfo || undefined,
        tokenInfo: ctx.tokenInfo || undefined,
        tokenType: ctx.tokenType,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : "Failed to fetch contract");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [addressInput, selectedChain]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setError(null);
  }, []);

  const getExplorerUrl = useCallback(() => {
    if (!contractInfo) return null;
    const chain = getChainById(contractInfo.chainId);
    const explorerUrl =
      chain?.blockExplorer ||
      chain?.explorerUrl ||
      getExplorerBaseUrlFromApiUrl(chain?.explorers?.[0]?.url);
    if (!explorerUrl) return null;
    return `${explorerUrl}/address/${contractInfo.address}`;
  }, [contractInfo]);

  const location = useLocation();
  const lastAutoFetchedAddress = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const address = params.get("address");
    const chainId = params.get("chainId");

    if (
      address &&
      isAddress(address) &&
      address !== lastAutoFetchedAddress.current
    ) {
      lastAutoFetchedAddress.current = address;
      setAddressInput(address);
      if (chainId) {
        const chain = getChainById(parseInt(chainId, 10));
        if (chain) setSelectedChain(chain);
      }
    }
  }, [location.search]);

  useEffect(() => {
    if (
      lastAutoFetchedAddress.current &&
      addressInput === lastAutoFetchedAddress.current
    ) {
      fetchContract();
    }
  }, [addressInput, fetchContract]);

  useEffect(() => {
    if (!selectedSourceId || sourceVariants.length === 0) return;
    const variant = sourceVariants.find((v) => v.id === selectedSourceId);
    if (!variant) return;

    const sortedFiles = sortSourceFiles(variant.files, variant.mainFile);
    setSourceFiles(sortedFiles);
    setSelectedFile(variant.mainFile || sortedFiles[0]?.path || null);

    if (baseContractInfo) {
      setContractInfo({
        name: variant.info.name,
        address: baseContractInfo.address,
        chainId: baseContractInfo.chainId,
        verified: variant.info.verified,
        source: variant.info.source,
        compilerVersion: variant.info.compilerVersion,
        proxyInfo: baseContractInfo.proxyInfo,
        tokenInfo: baseContractInfo.tokenInfo,
        tokenType: baseContractInfo.tokenType,
      });
    }
  }, [selectedSourceId, sourceVariants, baseContractInfo]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex justify-center">
        <div className="w-full max-w-lg border border-border rounded-lg p-5">
          <ContractAddressInput
            contractAddress={addressInput}
            onAddressChange={handleAddressChange}
            selectedNetwork={selectedChain}
            onNetworkChange={handleNetworkChange}
            supportedChains={explorerChains}
            isLoading={isLoading}
            error={error}
            onFetchABI={fetchContract}
            onCancel={handleCancel}
          />
        </div>
      </div>

      {sourceFiles.length === 0 && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
          <div className="text-4xl opacity-40">--</div>
          <h3 className="text-sm font-medium text-foreground/70">
            No contract loaded
          </h3>
          <p className="text-xs max-w-sm">
            Enter a verified contract address above to view its source code,
            compiler info or proxy structure.
          </p>
        </div>
      )}

      {sourceFiles.length > 0 && (
        <div ref={resultsRef}>
          {/* Contract Info Bar */}
          {contractInfo && (
            <div className="flex flex-wrap items-center justify-center gap-2 py-2 text-xs">
              <div
                className="info-badge flex items-center gap-1.5"
                style={{ opacity: hasAnimated ? 1 : 0 }}
              >
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                <span className="font-medium">
                  {contractInfo.name || "Unknown"}
                </span>
              </div>

              {contractInfo.proxyInfo?.proxyType === "diamond" && (
                <div
                  className="info-badge"
                  style={{ opacity: hasAnimated ? 1 : 0 }}
                >
                  <DiamondBadge
                    proxyInfo={contractInfo.proxyInfo}
                    size="sm"
                    variant="badge"
                  />
                </div>
              )}

              {contractInfo.proxyInfo?.isProxy &&
                contractInfo.proxyInfo.proxyType !== "diamond" && (
                  <div
                    className="info-badge"
                    style={{ opacity: hasAnimated ? 1 : 0 }}
                  >
                    <ProxyTypeBadge
                      proxyInfo={contractInfo.proxyInfo}
                      size="sm"
                    />
                  </div>
                )}

              {contractInfo.tokenType && (
                <div
                  className="info-badge"
                  style={{ opacity: hasAnimated ? 1 : 0 }}
                >
                  <TokenTypeBadge
                    tokenType={contractInfo.tokenType}
                    symbol={contractInfo.tokenInfo?.symbol}
                    size="sm"
                  />
                </div>
              )}

              {contractInfo.source && (
                <div
                  className="info-badge"
                  style={{ opacity: hasAnimated ? 1 : 0 }}
                >
                  <SourceBadge source={contractInfo.source} size="sm" />
                </div>
              )}

              {contractInfo.compilerVersion && (
                <Badge
                  variant="outline"
                  className="info-badge text-[10px] h-5"
                  style={{ opacity: hasAnimated ? 1 : 0 }}
                >
                  {contractInfo.compilerVersion}
                </Badge>
              )}

              <Badge
                variant="outline"
                className="info-badge text-[10px] h-5"
                style={{ opacity: hasAnimated ? 1 : 0 }}
              >
                {sourceFiles.length} file{sourceFiles.length !== 1 ? "s" : ""}
              </Badge>

              {getExplorerUrl() && (
                <a
                  href={getExplorerUrl()!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="info-badge text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
                  style={{ opacity: hasAnimated ? 1 : 0 }}
                >
                  Explorer
                  <ArrowSquareOut className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          <div
            className="code-viewer flex border border-border rounded-lg overflow-hidden bg-background responsive-scroll"
            style={{
              height: "calc(100vh - 320px)",
              minHeight: "400px",
              opacity: hasAnimated ? 1 : 0,
            }}
          >
            {sourceVariants.length > 1 && (
              <div className="flex flex-col gap-0 border-r border-border w-28 shrink-0 overflow-y-auto">
                {sourceVariants.map((variant) => (
                  <Button
                    key={variant.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    fullWidth
                    onClick={() => setSelectedSourceId(variant.id)}
                    className={cn(
                      "flex h-auto flex-col items-start gap-1 px-3 py-3 text-left transition-all border-l-2",
                      selectedSourceId === variant.id
                        ? "bg-background border-l-primary text-foreground"
                        : "border-l-transparent text-muted-foreground/50 hover:bg-muted/30 hover:text-foreground",
                    )}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider leading-none">
                      {variant.label}
                    </span>
                  </Button>
                ))}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <SolidityViewer
                files={sourceFiles}
                selectedFile={selectedFile}
                onFileSelect={setSelectedFile}
                showFileTree={sourceFiles.length > 1}
                height="100%"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractExplorer;
