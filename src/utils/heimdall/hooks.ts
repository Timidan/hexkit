import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import {
  fetchHeimdallDecompilation,
  fetchHeimdallStorageDump,
  fetchHeimdallVersion,
  type DecompilationRequest,
  type StorageDumpRequest,
} from "./heimdallApi";
import type {
  HeimdallDecompilation,
  HeimdallStorageDump,
  HeimdallVersion,
} from "./types";

const HEIMDALL_STALE_MS = 10 * 60 * 1000;

export function useHeimdallVersion(
  options?: Partial<UseQueryOptions<HeimdallVersion>>,
) {
  return useQuery<HeimdallVersion>({
    queryKey: ["heimdall", "version"],
    queryFn: () => fetchHeimdallVersion(),
    staleTime: HEIMDALL_STALE_MS,
    ...options,
  });
}

export function useHeimdallDecompilation(
  req: DecompilationRequest,
  options?: Partial<UseQueryOptions<HeimdallDecompilation>>,
) {
  const key = req.bytecode
    ? ["heimdall", "decompile", "bytecode", req.bytecode.toLowerCase()]
    : req.address && req.chainId
      ? ["heimdall", "decompile", "address", req.address.toLowerCase(), req.chainId]
      : ["heimdall", "decompile", "empty"];

  return useQuery<HeimdallDecompilation>({
    queryKey: key,
    queryFn: () => fetchHeimdallDecompilation(req),
    enabled: Boolean(req.bytecode || (req.address && req.chainId)),
    staleTime: HEIMDALL_STALE_MS,
    ...options,
  });
}

export function useHeimdallStorageDump(
  req: StorageDumpRequest,
  options?: Partial<UseQueryOptions<HeimdallStorageDump>>,
) {
  return useQuery<HeimdallStorageDump>({
    queryKey: [
      "heimdall",
      "dump",
      req.address.toLowerCase(),
      req.chainId,
      req.blockNumber ?? req.blockTag ?? "latest",
    ],
    queryFn: () => fetchHeimdallStorageDump(req),
    staleTime: HEIMDALL_STALE_MS,
    ...options,
  });
}
