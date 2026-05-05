// Starknet Cairo class explorer — mirrors the EVM ContractExplorer UI.
// Input: class hash + mainnet/sepolia selector (same NetworkSelector pill as
// StarknetContractInput). Results: info bar badges + code-viewer with Cairo
// Source / ABI / Sierra variant selector sidebar.

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { CheckCircle, ArrowSquareOut, MagnifyingGlass, X, Square } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { animate, stagger } from "animejs";
import { cn } from "@/lib/utils";
import { CairoSourceExplorer } from "@/components/explorer/CairoSourceExplorer";
import {
  SourceExplorerShell,
} from "@/components/explorer/SourceExplorerShell";
import {
  CAIRO_THEME_NAME,
  setupCairoMonaco,
} from "@/lib/monaco";
import type { editor as MonacoEditor } from "monaco-editor";
import {
  fetchClassInfo,
  flattenAbi,
  ClassInfoTabs,
  classExplorerVoyager,
  type ClassInfo,
} from "@/components/starknet-simulation-results/CallTreeTab";
import {
  classLabel,
  shortHex,
} from "@/components/starknet-simulation-results/decoders";
import {
  fetchCairoSource,
  type CairoSourceResponse,
  type CairoSourceNetwork,
} from "@/chains/starknet/cairoSourceClient";
import { useSierraDebug } from "@/chains/starknet/sierraDebugClient";
import { CopyButton } from "@/components/ui/copy-button";
import NetworkSelector, {
  STARKNET_NETWORKS,
  STARKNET_DEFAULT_NETWORK,
  type ExtendedChain,
} from "@/components/shared/NetworkSelector";
import { networkConfigManager } from "@/config/networkConfig";
import type { StarknetNetwork } from "@/config/networkConfig";
import { RpcProvider } from "starknet";

type ClassVariant = "cairo" | "abi" | "sierra";

function isValidClassHash(input: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(input.trim());
}

function extendedChainToNetwork(chain: ExtendedChain): CairoSourceNetwork {
  return chain.isTestnet ? "sepolia" : "mainnet";
}

function explorerPathClassHash(pathname: string): string {
  const marker = "/explorer/class/";
  const idx = pathname.indexOf(marker);
  if (idx < 0) return "";
  const raw = pathname.slice(idx + marker.length).split("/")[0] ?? "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function networkFromSearchParams(params: URLSearchParams): ExtendedChain | null {
  const rawNetwork = params.get("network")?.trim().toLowerCase() ?? "";
  if (rawNetwork.includes("sepolia") || rawNetwork === "testnet") {
    return STARKNET_NETWORKS.find((chain) => chain.isTestnet) ?? null;
  }
  if (rawNetwork.includes("mainnet") || rawNetwork === "starknet") {
    return STARKNET_NETWORKS.find((chain) => !chain.isTestnet) ?? null;
  }

  const rawChainId = params.get("chainId")?.trim().toLowerCase() ?? "";
  const chainId = rawNetwork.startsWith("0x") ? rawNetwork : rawChainId;
  if (!chainId) return null;
  return (
    STARKNET_NETWORKS.find(
      (chain) => chain.starknetChainId?.toLowerCase() === chainId,
    ) ?? null
  );
}

interface LoadedClass {
  classHash: string;
  network: CairoSourceNetwork;
  info: ClassInfo;
  cairo: CairoSourceResponse | null;
}

const SIERRA_EDITOR_OPTIONS: MonacoEditor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 12,
  lineNumbers: "on",
  scrollBeyondLastLine: false,
  wordWrap: "off",
  automaticLayout: true,
  fontFamily: "'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
  padding: { top: 8 },
  scrollbar: {
    vertical: "visible",
    horizontal: "visible",
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
};

const JSON_EDITOR_OPTIONS: MonacoEditor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 12,
  lineNumbers: "on",
  scrollBeyondLastLine: false,
  wordWrap: "off",
  automaticLayout: true,
  fontFamily: "'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
  padding: { top: 8 },
  folding: true,
  scrollbar: {
    vertical: "visible",
    horizontal: "visible",
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
};

function SierraPanel({
  classHash,
  network,
}: {
  classHash: string;
  network: StarknetNetwork;
}) {
  const sierra = useSierraDebug(classHash, network);
  if (sierra.loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Loading Sierra…
      </div>
    );
  }
  if (sierra.error) {
    return (
      <div className="p-4 text-red-400 text-xs font-mono break-all">
        Failed to fetch Sierra: {sierra.error}
      </div>
    );
  }
  if (!sierra.data?.isCairo1) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Sierra not available — this is a Cairo 0 class.
      </div>
    );
  }
  const text = sierra.data?.sierra?.text ?? null;
  if (!text) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Bridge returned no Sierra text for this class.
      </div>
    );
  }
  return (
    <SourceExplorerShell
      files={[{ path: "output.sierra", content: text }]}
      selectedFile="output.sierra"
      resolveLanguage={() => "plaintext"}
      theme={CAIRO_THEME_NAME}
      editorOptions={SIERRA_EDITOR_OPTIONS}
      onMonacoReady={(_ed, monaco) => setupCairoMonaco(monaco)}
      showFileTree={false}
      hideTabs={true}
      topRightSlot={<CopyButton value={text} />}
      height="100%"
    />
  );
}

const VARIANTS: { id: ClassVariant; label: string }[] = [
  { id: "cairo", label: "Cairo Source" },
  { id: "abi", label: "ABI" },
  { id: "sierra", label: "Sierra" },
];

const StarknetContractExplorer: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const searchString = searchParams.toString();
  const deepLink = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return {
      classHash:
        params.get("classHash")?.trim() ||
        explorerPathClassHash(location.pathname),
      network: networkFromSearchParams(params),
    };
  }, [location.pathname, searchString]);

  const [hashInput, setHashInput] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState<ExtendedChain>(STARKNET_DEFAULT_NETWORK);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedClass | null>(null);
  const [activeVariant, setActiveVariant] = useState<ClassVariant>("cairo");
  const [abiRawJson, setAbiRawJson] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const prevLoadedRef = useRef<LoadedClass | null>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (loaded && !prevLoadedRef.current && resultsRef.current) {
      animate(resultsRef.current.querySelectorAll(".info-badge"), {
        translateY: [20, 0],
        opacity: [0, 1],
        delay: stagger(50),
        duration: 400,
        ease: "outCubic",
      });
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
    if (!loaded) setHasAnimated(false);
    prevLoadedRef.current = loaded;
  }, [loaded]);

  const flattened = useMemo(
    () => flattenAbi(loaded?.info.abi ?? null),
    [loaded],
  );
  const label = useMemo(
    () => (loaded ? classLabel(loaded.classHash) : null),
    [loaded],
  );

  const loadClass = useCallback(async (input: string, chain: ExtendedChain) => {
    const hash = input.trim();
    if (!hash) {
      setError("Please enter a class hash or contract address");
      return;
    }
    if (!isValidClassHash(hash)) {
      setError("Invalid input — must start with 0x and contain hex digits");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const network = extendedChainToNetwork(chain);

    setIsLoading(true);
    setError(null);
    setLoaded(null);

    try {
      let classHash = hash;
      let info: ClassInfo;
      let cairo: CairoSourceResponse | null;

      try {
        [info, cairo] = await Promise.all([
          fetchClassInfo(hash, network as StarknetNetwork),
          fetchCairoSource(hash, network, controller.signal).catch(() => null),
        ]);
      } catch (firstErr) {
        // If bridge returned 404 (class hash not found), the input may be a
        // contract address — resolve it to its class hash and retry.
        const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        if (!msg.includes("404")) throw firstErr;

        const { url } = networkConfigManager.resolveStarknetRpc(network as StarknetNetwork);
        const provider = new RpcProvider({ nodeUrl: url });
        classHash = await provider.getClassHashAt(hash);

        [info, cairo] = await Promise.all([
          fetchClassInfo(classHash, network as StarknetNetwork),
          fetchCairoSource(classHash, network, controller.signal).catch(() => null),
        ]);
      }

      if (controller.signal.aborted) return;

      // Choose the initial panel in one render: default to ABI when Cairo
      // source isn't verified so the user immediately sees useful data.
      setActiveVariant(cairo?.verified ? "cairo" : "abi");
      setLoaded({ classHash, network, info, cairo });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch class");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  const fetchClass = useCallback(async () => {
    await loadClass(hashInput, selectedNetwork);
  }, [hashInput, loadClass, selectedNetwork]);

  useEffect(() => {
    if (!deepLink.classHash) return;
    const chain = deepLink.network ?? STARKNET_DEFAULT_NETWORK;
    setHashInput(deepLink.classHash);
    setSelectedNetwork(chain);
    void loadClass(deepLink.classHash, chain);
  }, [deepLink.classHash, deepLink.network, loadClass]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setError(null);
  }, []);

  const handleHashChange = useCallback((val: string) => {
    setHashInput(val);
    setError(null);
  }, []);

  const handleNetworkChange = useCallback(
    (chain: ExtendedChain) => {
      setSelectedNetwork(chain);
      if (loaded) {
        setLoaded(null);
        setError(null);
      }
    },
    [loaded],
  );

  const voyagerUrl = loaded
    ? classExplorerVoyager(
        loaded.classHash,
        loaded.network === "sepolia"
          ? "0x534e5f5345504f4c4941"
          : "0x534e5f4d41494e",
      )
    : null;

  const isCairo1 = loaded?.info.isCairo1 ?? false;
  const sierraFeltCount = loaded?.info.sierraProgram?.length ?? null;
  const cairoFileCount = loaded?.cairo?.files.length ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Input card */}
      <div className="flex justify-center">
        <div className="w-full max-w-lg border border-border rounded-lg p-5">
          <div className="flex flex-col gap-3">
            <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1">
              Class Hash or Contract Address
            </Label>

            <div className="relative group">
              <div className="relative flex items-center">
                <Input
                  autoComplete="off"
                  spellCheck={false}
                  value={hashInput}
                  onChange={(e) => handleHashChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") fetchClass();
                  }}
                  placeholder="0x0000…0000"
                  className={cn(
                    "h-12 pl-4 pr-[120px] font-mono text-sm tracking-tight transition-all duration-300",
                    "bg-transparent! border-slate-800/50 hover:border-slate-700/60 focus:ring-0 focus:border-white/50",
                    isValidClassHash(hashInput) && "border-white/30 bg-white/[0.02]",
                  )}
                />

                <div className="absolute right-1.5 flex items-center h-9 gap-1 px-1">
                  {hashInput && (
                    <Button
                      type="button"
                      variant="icon-borderless"
                      size="icon-inline"
                      onClick={() => handleHashChange("")}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      title="Clear"
                      aria-label="Clear"
                    >
                      <X size={14} />
                    </Button>
                  )}

                  <NetworkSelector
                    className="scale-90 opacity-90 hover:opacity-100 transition-opacity"
                    selectedNetwork={selectedNetwork}
                    onNetworkChange={handleNetworkChange}
                    networks={STARKNET_NETWORKS}
                    showTestnets={true}
                    size="sm"
                    variant="input"
                  />

                  {isLoading ? (
                    <Button
                      type="button"
                      variant="icon-borderless"
                      size="icon-inline"
                      onClick={handleCancel}
                      className="p-1.5 rounded-md transition-colors text-red-400 hover:text-red-300 hover:bg-red-500/10 animate-pulse"
                      title="Cancel loading"
                      aria-label="Cancel loading"
                    >
                      <Square size={14} fill="currentColor" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="icon-borderless"
                      size="icon-inline"
                      onClick={fetchClass}
                      disabled={!isValidClassHash(hashInput) || isLoading}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        "text-foreground/70 hover:text-foreground hover:bg-muted",
                        "disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-foreground/70",
                      )}
                      title="Fetch class"
                      aria-label="Fetch class"
                    >
                      <MagnifyingGlass size={16} />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {!loaded && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
          <div className="text-4xl opacity-40">--</div>
          <h3 className="text-sm font-medium text-foreground/70">
            No class loaded
          </h3>
          <p className="text-xs max-w-sm">
            Enter a Cairo class hash or contract address to view its source
            code, ABI, or Sierra representation.
          </p>
        </div>
      )}

      {/* Results */}
      {loaded && (
        <div ref={resultsRef}>
          {/* Info bar */}
          <div className="flex flex-wrap items-center justify-center gap-2 py-2 text-xs">
            <div
              className="info-badge flex items-center gap-1.5"
              style={{ opacity: hasAnimated ? 1 : 0 }}
            >
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              <span className="font-medium font-mono" title={loaded.classHash}>
                {label ?? shortHex(loaded.classHash)}
              </span>
            </div>

            <Badge
              variant="outline"
              className="info-badge text-[10px] h-5 uppercase"
              style={{ opacity: hasAnimated ? 1 : 0 }}
            >
              {isCairo1 ? "Cairo 1" : "Cairo 0"}
            </Badge>

            {loaded.info.contractClassVersion && (
              <Badge
                variant="outline"
                className="info-badge text-[10px] h-5"
                style={{ opacity: hasAnimated ? 1 : 0 }}
              >
                v{loaded.info.contractClassVersion}
              </Badge>
            )}

            {isCairo1 && sierraFeltCount != null && (
              <Badge
                variant="outline"
                className="info-badge text-[10px] h-5"
                style={{ opacity: hasAnimated ? 1 : 0 }}
              >
                {sierraFeltCount.toLocaleString()} felts
              </Badge>
            )}

            {cairoFileCount > 0 && (
              <Badge
                variant="outline"
                className="info-badge text-[10px] h-5"
                style={{ opacity: hasAnimated ? 1 : 0 }}
              >
                {cairoFileCount} file{cairoFileCount !== 1 ? "s" : ""}
              </Badge>
            )}

            <Badge
              variant="outline"
              className="info-badge text-[10px] h-5 capitalize"
              style={{ opacity: hasAnimated ? 1 : 0 }}
            >
              {loaded.network}
            </Badge>

            {voyagerUrl && (
              <a
                href={voyagerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="info-badge text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
                style={{ opacity: hasAnimated ? 1 : 0 }}
              >
                Voyager
                <ArrowSquareOut className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Code viewer */}
          <div
            className="code-viewer flex border border-border rounded-lg overflow-hidden bg-background responsive-scroll"
            style={{
              height: "calc(100vh - 320px)",
              minHeight: "400px",
              opacity: hasAnimated ? 1 : 0,
            }}
          >
            {/* Variant sidebar */}
            <div className="flex flex-col gap-0 border-r border-border w-28 shrink-0 overflow-y-auto">
              {VARIANTS.map((v) => (
                <Button
                  key={v.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => setActiveVariant(v.id)}
                  className={cn(
                    "flex h-auto flex-col items-start gap-1 px-3 py-3 text-left transition-all border-l-2",
                    activeVariant === v.id
                      ? "bg-background border-l-primary text-foreground"
                      : "border-l-transparent text-muted-foreground/50 hover:bg-muted/30 hover:text-foreground",
                  )}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider leading-none">
                    {v.label}
                  </span>
                </Button>
              ))}
            </div>

            {/* Main panel */}
            <div className="flex-1 min-w-0 overflow-hidden">
              {activeVariant === "cairo" && (
                <CairoSourceExplorer
                  source={loaded.cairo}
                  loading={false}
                  error={null}
                  onViewAbi={() => setActiveVariant("abi")}
                  onViewSierra={() => setActiveVariant("sierra")}
                  height="100%"
                />
              )}

              {activeVariant === "abi" && (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-end px-3 py-1.5 border-b border-border bg-muted/20 shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAbiRawJson(false)}
                      className={cn(
                        "h-6 px-2 text-[10px] uppercase tracking-wider font-bold",
                        !abiRawJson ? "text-foreground bg-muted" : "text-muted-foreground/60",
                      )}
                    >
                      UI
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAbiRawJson(true)}
                      className={cn(
                        "h-6 px-2 text-[10px] uppercase tracking-wider font-bold",
                        abiRawJson ? "text-foreground bg-muted" : "text-muted-foreground/60",
                      )}
                    >
                      Raw JSON
                    </Button>
                  </div>
                  {abiRawJson ? (
                    <div className="flex-1 min-h-0">
                      <SourceExplorerShell
                        files={[{ path: "abi.json", content: JSON.stringify(loaded.info.abi ?? [], null, 2) }]}
                        selectedFile="abi.json"
                        resolveLanguage={() => "json"}
                        theme={CAIRO_THEME_NAME}
                        editorOptions={JSON_EDITOR_OPTIONS}
                        onMonacoReady={(_ed, monaco) => setupCairoMonaco(monaco)}
                        showFileTree={false}
                        hideTabs={true}
                        topRightSlot={<CopyButton value={JSON.stringify(loaded.info.abi ?? [], null, 2)} />}
                        height="100%"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-auto p-4">
                      <ClassInfoTabs
                        info={loaded.info}
                        flattened={flattened}
                        activeSelector=""
                        cairoSource={loaded.cairo}
                        cairoSourceLoading={false}
                        cairoSourceError={null}
                      />
                    </div>
                  )}
                </div>
              )}

              {activeVariant === "sierra" && (
                <SierraPanel
                  classHash={loaded.classHash}
                  network={loaded.network as StarknetNetwork}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StarknetContractExplorer;
