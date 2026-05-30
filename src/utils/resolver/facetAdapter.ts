/**
 * Facet Adapter
 *
 * Pure mapping from the resolver's FacetInfo shape to the legacy DiamondFacet
 * UI shape consumed across the simple-grid diamond components.
 *
 * Pure and synchronous — no I/O. Directly unit-testable.
 */

import type { FacetInfo, ExternalFunction } from './types';
import { isReadFunction, isWriteFunction } from './types';
import type { DiamondFacet } from '../diamondFacetFetcher';

export function facetInfoToDiamondFacet(facet: FacetInfo): DiamondFacet {
  const confidence: "verified" | "inferred" | "extracted" =
    facet.confidence === 'bytecode-only' ? 'extracted' : facet.confidence;
  const isVerified = facet.confidence === 'verified';

  const read: ExternalFunction[] = [];
  const write: ExternalFunction[] = [];
  for (const fn of facet.functions) {
    if (isReadFunction(fn)) {
      read.push(fn);
    } else if (isWriteFunction(fn)) {
      write.push(fn);
    }
  }

  const inferenceSource: "verified" | "whatsabi" | "selectors" | undefined =
    isVerified
      ? 'verified'
      : facet.confidence === 'inferred' && !facet.source
        ? 'selectors'
        : undefined;

  return {
    address: facet.address,
    name: facet.name || 'Facet',
    abi: (facet.abi ?? []) as unknown[],
    source: facet.source || 'Unknown',
    isVerified,
    functions: { read, write },
    selectors: facet.selectors,
    confidence,
    inferenceSource,
  };
}
