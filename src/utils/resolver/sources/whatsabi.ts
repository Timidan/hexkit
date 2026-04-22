/**
 * WhatsABI Source — last-resort fallback for unverified contracts.
 *
 * Infers an ABI from on-chain bytecode via @shazow/whatsabi. Unlike the
 * explorer sources, this hits the user's RPC instead of a public HTTP
 * indexer, so the resolver only runs it when the verified explorers are
 * failing (enforced by delayed-race scheduling in ContractResolver).
 *
 * Security invariants enforced here:
 * - Confidence is hard-capped at 'inferred' (or 'bytecode-only' for pure
 *   selector extraction). This source NEVER reports 'verified', even if
 *   the underlying library claims it — downstream code gating on
 *   `verified` must not be fooled.
 * - Proxy info from whatsabi is intentionally dropped; contractContext.ts
 *   remains the authoritative proxy detector.
 * - Aborts are honored via Promise.race. whatsabi has no native
 *   cancellation, so in-flight RPC may leak, but its result is discarded.
 */

import type { Chain } from '../../../types';
import type { AbiItem, Confidence, SourceResult } from '../types';
import { fetchFromWhatsABI } from '../../whatsabiFetcher';

export async function fetchWhatsabi(
  address: string,
  chain: Chain,
  signal: AbortSignal
): Promise<SourceResult> {
  if (signal.aborted) {
    return { success: false, error: 'Aborted', source: 'whatsabi' };
  }

  const abortPromise = new Promise<never>((_, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(new DOMException('Aborted', 'AbortError')),
      { once: true }
    );
  });

  try {
    const result = await Promise.race([fetchFromWhatsABI(address, chain), abortPromise]);

    if (!result.success || !result.abi) {
      return {
        success: false,
        error: result.error ?? 'WhatsABI returned no ABI',
        source: 'whatsabi',
      };
    }

    let parsed: AbiItem[];
    try {
      parsed = JSON.parse(result.abi) as AbiItem[];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `WhatsABI returned malformed ABI JSON: ${message}`,
        source: 'whatsabi',
      };
    }

    const confidence: Confidence =
      result.confidence === 'extracted' ? 'bytecode-only' : 'inferred';

    return {
      success: true,
      abi: parsed,
      name: result.contractName,
      source: 'whatsabi',
      confidence,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message, source: 'whatsabi' };
  }
}
