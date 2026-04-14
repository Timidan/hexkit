import { ethers } from "ethers";
import type { TransactionRequest, SimulationResult } from "../../types/transaction";
import type { Chain } from "../../types";
import type { TokenMovement } from "../tokenMovements";
import { extractTokenMovements, getCachedTokenMetadata, fetchTokenMetadata } from "../tokenMovements";
import { simulateTransaction } from "./simulationEntryPoints";
import { networkConfigManager } from "../../config/networkConfig";

export interface AssetMovementResult {
  success: boolean;
  movements: TokenMovement[];
  gasUsed: string | null;
  error?: string;
}

/**
 * Run an EDB simulation and extract only token movements.
 *
 * This is a lean frontend adapter — it runs the standard simulation path
 * but only consumes the rawEvents to extract Transfer events.
 * The full trace/storage/snapshot data is discarded.
 */
export async function simulateAssetMovements(
  tx: TransactionRequest,
  chain: Chain,
  fromAddress: string
): Promise<AssetMovementResult> {
  try {
    const result: SimulationResult = await simulateTransaction(
      tx,
      chain,
      fromAddress,
      undefined,
      // liteEventsOnly skips the Sourcify/Blockscout artifact pre-fetch and
      // tells EDB to disable per-opcode snapshot collection. We only read
      // rawEvents for Transfer extraction below, so none of the heavy trace
      // machinery is needed on this path (~5x speedup).
      { enableDebug: false, liteEventsOnly: true }
    );

    if (!result.success) {
      return {
        success: false,
        movements: [],
        gasUsed: result.gasUsed ?? null,
        error: result.error ?? result.revertReason ?? "Simulation failed",
      };
    }

    // Extract raw events from the rendered trace (EDB populates these unconditionally)
    let rawEvents: Array<{ address?: string; topics?: string[]; data?: string }> = [];

    // Path 1: renderedTrace.rawEvents (V3 EDB path)
    const rendered = (result as any).renderedTrace;
    if (rendered?.rawEvents && Array.isArray(rendered.rawEvents)) {
      rawEvents = rendered.rawEvents;
    }

    // Path 2: fall back to extracting from the raw trace call tree
    if (rawEvents.length === 0 && result.rawTrace) {
      rawEvents = extractEventsFromRawTrace(result.rawTrace);
    }

    const movements = extractTokenMovements(rawEvents);

    // Warn when simulation "succeeds" but extracted zero movements —
    // this usually means the EDB bridge was unavailable or the trace
    // was empty, so the result is unreliable.
    if (movements.length === 0) {
      return {
        success: true,
        movements,
        gasUsed: result.gasUsed ?? null,
        error:
          "Simulation completed but no token movements were detected. " +
          "The result may be unreliable — verify before executing.",
      };
    }

    // Resolve token metadata (symbol, name, decimals) for any unknown
    // token addresses. This populates the global cache so all consumers
    // (Earn flows, main sim results, etc.) get real symbols instead of
    // truncated addresses like "0xaD4F...F20d".
    await resolveMovementTokenMetadata(movements, chain);

    // Write resolved metadata directly onto movement objects so consumers
    // don't have to re-query the cache (which may race with rendering).
    for (const mv of movements) {
      if (mv.tokenSymbol && !mv.tokenSymbol.startsWith("0x")) continue;
      const meta = getCachedTokenMetadata(mv.tokenAddress);
      if (meta && !meta.symbol.startsWith("0x")) {
        mv.tokenSymbol = meta.symbol;
        mv.decimals = meta.decimals;
      }
    }

    return {
      success: true,
      movements,
      gasUsed: result.gasUsed ?? null,
    };
  } catch (err: any) {
    return {
      success: false,
      movements: [],
      gasUsed: null,
      error: err?.message ?? "Simulation failed unexpectedly",
    };
  }
}

/**
 * For each unique token address in the movements, check the global metadata
 * cache and, if missing, fetch symbol / name / decimals via an RPC call to the
 * token contract. Results are written to the global cache so subsequent
 * `getCachedTokenMetadata()` calls return real symbols.
 *
 * Best-effort: individual fetch failures are silently ignored — the consumer
 * will fall back to a truncated address for that token.
 */
async function resolveMovementTokenMetadata(
  movements: TokenMovement[],
  chain: Chain,
): Promise<void> {
  const unknowns = new Set<string>();
  for (const mv of movements) {
    const addr = mv.tokenAddress.toLowerCase();
    if (!getCachedTokenMetadata(addr)) {
      unknowns.add(mv.tokenAddress);
    }
  }

  if (unknowns.size === 0) return;

  try {
    const resolution = networkConfigManager.resolveRpcUrl(chain.id, chain.rpcUrl);
    const rpcUrl = resolution.url;
    if (!rpcUrl) return;

    const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, chain.id);

    // Fetch all unknowns in parallel with an 8s overall timeout
    await Promise.race([
      Promise.allSettled(
        [...unknowns].map((addr) => fetchTokenMetadata(addr, provider)),
      ),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
  } catch {
    // Best effort — don't block simulation on metadata failures
  }
}

/**
 * Walk the raw trace object to find event logs.
 * The trace structure varies — this handles the common EDB shapes.
 */
function extractEventsFromRawTrace(
  trace: Record<string, unknown>
): Array<{ address?: string; topics?: string[]; data?: string }> {
  const events: Array<{ address?: string; topics?: string[]; data?: string }> = [];

  function walk(node: any) {
    if (!node || typeof node !== "object") return;

    // Check if this node has event-like fields
    if (node.address && node.topics && node.data) {
      events.push({
        address: node.address,
        topics: node.topics,
        data: node.data,
      });
    }

    // Check for events arrays
    if (Array.isArray(node.events)) {
      for (const ev of node.events) {
        if (ev?.address && ev?.topics) {
          events.push({
            address: ev.address,
            topics: ev.topics,
            data: ev.data ?? "0x",
          });
        }
      }
    }

    // Recurse into inner/calls/children
    if (Array.isArray(node.inner)) node.inner.forEach(walk);
    if (Array.isArray(node.calls)) node.calls.forEach(walk);
    if (Array.isArray(node.children)) node.children.forEach(walk);
    if (node.inner && typeof node.inner === "object" && !Array.isArray(node.inner)) {
      if (Array.isArray(node.inner.inner)) node.inner.inner.forEach(walk);
    }
  }

  walk(trace);
  return events;
}
