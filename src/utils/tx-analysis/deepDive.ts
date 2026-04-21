import { sanitizeSolidity } from "./sourceSanitizer";
import type { EvidencePacket } from "./types";

export type SourceQuality = "verified" | "reconstructed" | "heuristic" | "none";

export interface VerifiedSourceBundle {
  contractName: string;
  files: Array<{ path: string; source: string }>;
  provider: "sourcify" | "etherscan" | "blockscout";
}

export interface HeimdallSourceBundle {
  source: string;
  provider: "heimdall";
}

export interface DeepDiveDependencies {
  packet: EvidencePacket;
  fetchVerifiedSource: (address: string) => Promise<VerifiedSourceBundle | null>;
  fetchHeimdallDecompile?: (address: string) => Promise<HeimdallSourceBundle | null>;
}

export interface DeepDiveContext {
  sources: Record<string, string>;
  qualityByContract: Record<string, SourceQuality>;
}

export async function runDeepDive(deps: DeepDiveDependencies): Promise<DeepDiveContext> {
  const pathContracts = new Set<string>();
  for (const w of deps.packet.writes) pathContracts.add(w.contract);
  for (const t of deps.packet.triggers) pathContracts.add(t.contract);

  const sources: Record<string, string> = {};
  const quality: Record<string, SourceQuality> = {};

  for (const addr of pathContracts) {
    const verified = await deps.fetchVerifiedSource(addr).catch(() => null);
    if (verified && verified.files.length > 0) {
      const merged = verified.files
        .map((f) => sanitizeSolidity(f.source, { filePath: f.path }))
        .filter((r) => !r.dropped)
        .map((r) => r.sanitized)
        .join("\n\n// ---- file boundary ----\n\n");
      if (merged.trim().length > 0) {
        sources[addr] = merged;
        quality[addr] = "verified";
        continue;
      }
    }
    if (deps.fetchHeimdallDecompile) {
      const heimdall = await deps.fetchHeimdallDecompile(addr).catch(() => null);
      if (heimdall) {
        sources[addr] = heimdall.source;
        quality[addr] = "heuristic";
        continue;
      }
    }
    quality[addr] = "none";
  }

  return { sources, qualityByContract: quality };
}
