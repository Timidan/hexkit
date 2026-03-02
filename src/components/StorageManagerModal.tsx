import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Loader2, Trash2, HardDrive, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// Services & caches
import { simulationHistoryService } from "../services/SimulationHistoryService";
import { contractCache } from "../utils/resolver/ContractCache";
import {
  artifactCache,
  artifactFetchInflight,
  sourcifySourceCache,
  ARTIFACT_CACHE_STORAGE_PREFIX,
} from "../utils/transaction-simulation/artifactFetching";
import {
  clearSignatureCache,
  getCachedSignatures,
  getCustomSignatures,
} from "../utils/signatureDatabase";
import { clearAllProxyCache, clearAllContextCache } from "../utils/resolver";

interface StorageCategory {
  id: string;
  label: string;
  detail: string; // e.g. "19 entries"
  sizeBytes: number;
  clearing: boolean;
}

interface StorageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function estimateLocalStorageSize(key: string): number {
  try {
    const val = localStorage.getItem(key);
    // JS strings are UTF-16 → 2 bytes per char
    return val ? val.length * 2 : 0;
  } catch {
    return 0;
  }
}

function getLocalStorageKeysByPrefix(prefix: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  return keys;
}

async function scanSimulationHistory(): Promise<Omit<StorageCategory, "clearing">> {
  try {
    const sims = await simulationHistoryService.getSimulations(undefined, true);
    const count = sims.length;
    // Rough size estimate: we can't easily get IDB size, so estimate from count
    // Average sim is ~50-500KB depending on trace data
    // For a better estimate, we serialize a sample
    let sizeBytes = 0;
    if (count > 0) {
      // Sample the first sim fully to estimate avg size
      try {
        const fullSim = await simulationHistoryService.getSimulation(sims[0].id);
        if (fullSim) {
          const sampleSize = JSON.stringify(fullSim).length * 2;
          sizeBytes = sampleSize * count; // rough extrapolation
        }
      } catch {
        sizeBytes = count * 100_000; // fallback: 100KB per sim
      }
    }
    return {
      id: "sim-history",
      label: "Simulation History",
      detail: `${count} simulation${count !== 1 ? "s" : ""}`,
      sizeBytes,
    };
  } catch {
    return { id: "sim-history", label: "Simulation History", detail: "unavailable", sizeBytes: 0 };
  }
}

async function scanTraceVault(): Promise<Omit<StorageCategory, "clearing">> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
      return { id: "trace-vault", label: "Trace Data (OPFS)", detail: "not supported", sizeBytes: 0 };
    }
    const root = await navigator.storage.getDirectory();
    let traceDir: FileSystemDirectoryHandle;
    try {
      traceDir = await root.getDirectoryHandle("trace-vault", { create: false });
    } catch {
      return { id: "trace-vault", label: "Trace Data (OPFS)", detail: "0 traces", sizeBytes: 0 };
    }
    let count = 0;
    let totalSize = 0;
    for await (const [, handle] of (traceDir as any).entries()) {
      if (handle.kind === "directory") {
        count++;
        // Iterate files inside each trace dir
        for await (const [, fileHandle] of (handle as FileSystemDirectoryHandle as any).entries()) {
          if (fileHandle.kind === "file") {
            try {
              const file = await (fileHandle as FileSystemFileHandle).getFile();
              totalSize += file.size;
            } catch { /* skip */ }
          }
        }
      }
    }
    return {
      id: "trace-vault",
      label: "Trace Data (OPFS)",
      detail: `${count} trace${count !== 1 ? "s" : ""}`,
      sizeBytes: totalSize,
    };
  } catch {
    return { id: "trace-vault", label: "Trace Data (OPFS)", detail: "unavailable", sizeBytes: 0 };
  }
}

async function scanContractCache(): Promise<Omit<StorageCategory, "clearing">> {
  try {
    const stats = await contractCache.getStats();
    const count = stats.persistedSize;
    // Rough estimate: ~5KB per contract entry
    const sizeBytes = count * 5_000;
    return {
      id: "contract-cache",
      label: "Contract Cache",
      detail: `${count} contract${count !== 1 ? "s" : ""} (${stats.memorySize} in memory)`,
      sizeBytes,
    };
  } catch {
    return { id: "contract-cache", label: "Contract Cache", detail: "unavailable", sizeBytes: 0 };
  }
}

function scanSignatureCache(): Omit<StorageCategory, "clearing"> {
  const fnSigs = getCachedSignatures("function");
  const evtSigs = getCachedSignatures("event");
  const customSigs = getCustomSignatures();
  const fnCount = Object.keys(fnSigs).length;
  const evtCount = Object.keys(evtSigs).length;
  const customCount = customSigs.length;

  const size =
    estimateLocalStorageSize("web3toolkit_function_signatures") +
    estimateLocalStorageSize("web3toolkit_event_signatures") +
    estimateLocalStorageSize("web3toolkit_custom_signatures");

  const parts: string[] = [];
  if (fnCount > 0) parts.push(`${fnCount} fn`);
  if (evtCount > 0) parts.push(`${evtCount} event`);
  if (customCount > 0) parts.push(`${customCount} custom`);

  return {
    id: "sig-cache",
    label: "Signature Cache",
    detail: parts.length > 0 ? parts.join(", ") : "empty",
    sizeBytes: size,
  };
}

function scanSavedContracts(): Omit<StorageCategory, "clearing"> {
  try {
    const raw = localStorage.getItem("web3-toolkit-saved-contracts");
    if (!raw) return { id: "saved-contracts", label: "Saved Contracts", detail: "0 contracts", sizeBytes: 0 };
    const parsed = JSON.parse(raw);
    const count = Array.isArray(parsed) ? parsed.length : 0;
    return {
      id: "saved-contracts",
      label: "Saved Contracts",
      detail: `${count} contract${count !== 1 ? "s" : ""}`,
      sizeBytes: raw.length * 2,
    };
  } catch {
    return { id: "saved-contracts", label: "Saved Contracts", detail: "unavailable", sizeBytes: 0 };
  }
}

function scanArtifactCache(): Omit<StorageCategory, "clearing"> {
  const keys = getLocalStorageKeysByPrefix(ARTIFACT_CACHE_STORAGE_PREFIX);
  let totalSize = 0;
  for (const k of keys) totalSize += estimateLocalStorageSize(k);
  return {
    id: "artifact-cache",
    label: "Simulation Artifacts",
    detail: `${keys.length} artifact${keys.length !== 1 ? "s" : ""}`,
    sizeBytes: totalSize,
  };
}

async function clearCategory(id: string): Promise<void> {
  switch (id) {
    case "sim-history":
      await simulationHistoryService.clearAll();
      break;
    case "trace-vault":
      if (navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory();
        try {
          await root.removeEntry("trace-vault", { recursive: true });
        } catch { /* may not exist */ }
      }
      break;
    case "contract-cache":
      await contractCache.clearAll();
      clearAllProxyCache();
      clearAllContextCache();
      break;
    case "sig-cache":
      clearSignatureCache();
      break;
    case "saved-contracts":
      localStorage.removeItem("web3-toolkit-saved-contracts");
      break;
    case "artifact-cache": {
      // Clear memory caches
      artifactCache.clear();
      artifactFetchInflight.clear();
      sourcifySourceCache.clear();
      // Clear localStorage entries
      const keys = getLocalStorageKeysByPrefix(ARTIFACT_CACHE_STORAGE_PREFIX);
      for (const k of keys) localStorage.removeItem(k);
      break;
    }
  }
}

const StorageManagerModal: React.FC<StorageManagerModalProps> = ({ isOpen, onClose }) => {
  const [categories, setCategories] = useState<StorageCategory[]>([]);
  const [scanning, setScanning] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const [simHistory, traceVault, contractCacheResult] = await Promise.all([
        scanSimulationHistory(),
        scanTraceVault(),
        scanContractCache(),
      ]);
      const sigCache = scanSignatureCache();
      const savedContracts = scanSavedContracts();
      const artifacts = scanArtifactCache();

      setCategories([
        { ...simHistory, clearing: false },
        { ...traceVault, clearing: false },
        { ...contractCacheResult, clearing: false },
        { ...sigCache, clearing: false },
        { ...savedContracts, clearing: false },
        { ...artifacts, clearing: false },
      ]);
    } catch (err) {
      console.error("[StorageManager] Scan failed:", err);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) scan();
  }, [isOpen, scan]);

  const handleClear = useCallback(
    async (id: string) => {
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? { ...c, clearing: true } : c))
      );
      try {
        await clearCategory(id);
        // Re-scan to update numbers
        await scan();
      } catch (err) {
        console.error(`[StorageManager] Failed to clear ${id}:`, err);
        setCategories((prev) =>
          prev.map((c) => (c.id === id ? { ...c, clearing: false } : c))
        );
      }
    },
    [scan]
  );

  const handleClearAll = useCallback(async () => {
    setClearingAll(true);
    try {
      for (const cat of categories) {
        await clearCategory(cat.id);
      }
      await scan();
    } catch (err) {
      console.error("[StorageManager] Clear all failed:", err);
    } finally {
      setClearingAll(false);
    }
  }, [categories, scan]);

  const totalSize = categories.reduce((sum, c) => sum + c.sizeBytes, 0);
  const hasData = categories.some((c) => c.sizeBytes > 0 || !c.detail.match(/^(0|empty|unavailable|not supported)/));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Local Storage
          </DialogTitle>
          <DialogDescription>
            Manage cached data stored in your browser.
          </DialogDescription>
        </DialogHeader>

        {scanning && categories.length === 0 ? (
          <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Scanning storage...
          </div>
        ) : (
          <div className="space-y-1">
            {categories.map((cat) => {
              const isEmpty = cat.sizeBytes === 0 && cat.detail.match(/^(0|empty|unavailable|not supported)/);
              return (
                <div
                  key={cat.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md px-3 py-2",
                    "border border-transparent hover:border-border hover:bg-muted/30 transition-colors"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight">{cat.label}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{cat.detail}</span>
                      {cat.sizeBytes > 0 && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span>{formatBytes(cat.sizeBytes)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!!isEmpty || cat.clearing || clearingAll}
                    onClick={() => handleClear(cat.id)}
                    className={cn(
                      "h-7 px-2 text-xs shrink-0",
                      !isEmpty && "text-destructive hover:text-destructive hover:bg-destructive/10"
                    )}
                  >
                    {cat.clearing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="text-xs text-muted-foreground">
            Total: <span className="font-medium text-foreground">{formatBytes(totalSize)}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasData && (
              <Button
                variant="outline"
                size="sm"
                disabled={clearingAll || scanning}
                onClick={handleClearAll}
                className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {clearingAll ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Clear All
                  </>
                )}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StorageManagerModal;
