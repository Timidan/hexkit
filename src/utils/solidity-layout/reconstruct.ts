/**
 * Storage Layout Reconstruction Orchestrator
 *
 * Ties together the pipeline:
 *   1. Parse all source files -> SymbolTable
 *   2. Find the target contract
 *   3. C3 linearize the inheritance chain
 *   4. Collect state variables in linearized order (base-first)
 *   5. Run the slot allocator
 *   6. Return the ReconstructionResult
 */

import type { SourceInput, ReconstructionResult, ParsedStateVar, SymbolTable } from './types';
import { parseSourceFiles } from './parseSource';
import { linearize } from './linearize';
import { allocateSlots } from './allocator';

/**
 * Reconstruct the storage layout for a contract from its Solidity sources.
 *
 * @param input - Source files and target contract name
 * @returns Reconstructed layout with confidence level and warnings
 */
export function reconstructStorageLayout(input: SourceInput): ReconstructionResult {
  const warnings: string[] = [];

  const { symbols, parseWarnings } = parseSourceFiles(input.files);
  warnings.push(...parseWarnings);

  if (symbols.contracts.size === 0) {
    return {
      layout: { storage: [], types: {} },
      confidence: 'reconstructed',
      warnings: [...warnings, 'No contracts found in provided source files.'],
    };
  }

  const contractName = resolveContractName(input.contractName, symbols, warnings);

  if (!contractName) {
    return {
      layout: { storage: [], types: {} },
      confidence: 'reconstructed',
      warnings: [
        ...warnings,
        `Target contract "${input.contractName}" not found in source files. ` +
        `Available contracts: ${[...symbols.contracts.keys()].join(', ')}`,
      ],
    };
  }

  let chain: string[];
  try {
    chain = linearize(contractName, symbols);
  } catch (err) {
    return {
      layout: { storage: [], types: {} },
      confidence: 'reconstructed',
      warnings: [
        ...warnings,
        `C3 linearization failed for "${contractName}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      ],
    };
  }

  const vars = collectStateVars(chain, symbols, warnings);

  if (vars.length === 0) {
    return {
      layout: { storage: [], types: {} },
      confidence: 'reconstructed',
      warnings: [
        ...warnings,
        `No state variables found for "${contractName}" (or its bases).`,
      ],
    };
  }

  const result = allocateSlots(vars, symbols);

  return {
    layout: {
      storage: result.storage,
      types: result.types,
    },
    confidence: 'reconstructed',
    warnings: [...warnings, ...result.warnings],
  };
}

/**
 * Resolve the target contract name using multiple strategies:
 * 1. Exact match
 * 2. Case-insensitive match
 * 3. Fallback: contract with the most state variables (heuristic for
 *    "main" contract when name is ambiguous)
 */
function resolveContractName(
  requestedName: string,
  symbols: SymbolTable,
  warnings: string[],
): string | null {
  // 1. Exact match
  if (symbols.contracts.has(requestedName)) {
    return requestedName;
  }

  // 2. Case-insensitive match
  const lower = requestedName.toLowerCase();
  for (const name of symbols.contracts.keys()) {
    if (name.toLowerCase() === lower) {
      warnings.push(
        `Exact match not found for "${requestedName}", using case-insensitive match "${name}".`,
      );
      return name;
    }
  }

  // 3. Fallback: most-stateful contract
  let best: string | null = null;
  let bestCount = -1;

  for (const [name, contract] of symbols.contracts) {
    // Only consider concrete contracts (not abstract)
    if (contract.kind === 'abstract') continue;
    const count = contract.stateVars.length;
    if (count > bestCount) {
      bestCount = count;
      best = name;
    }
  }

  if (best) {
    warnings.push(
      `Target contract "${requestedName}" not found. ` +
      `Falling back to "${best}" (most state variables: ${bestCount}).`,
    );
  }

  return best;
}

/**
 * Collect state variables from the linearized chain in base-first order.
 * Deduplicates variables from diamond inheritance (same name from the same
 * declaring contract appearing multiple times).
 */
function collectStateVars(
  chain: string[],
  symbols: SymbolTable,
  warnings: string[],
): ParsedStateVar[] {
  const vars: ParsedStateVar[] = [];
  const seen = new Set<string>(); // "contractName.varName" dedup key

  for (const contractName of chain) {
    const contract = symbols.contracts.get(contractName);
    if (!contract) {
      // Contract in inheritance chain but not found in sources -- could be
      // an interface or external import that was skipped during parsing.
      warnings.push(
        `Contract "${contractName}" in inheritance chain not found in parsed sources.`,
      );
      continue;
    }

    for (const v of contract.stateVars) {
      const key = `${v.contractName}.${v.name}`;
      if (seen.has(key)) continue; // Skip duplicates from diamond inheritance
      seen.add(key);
      vars.push(v);
    }
  }

  return vars;
}

export interface CandidateResult extends ReconstructionResult {
  /** The contract name that produced this layout */
  chosenContract: string;
  /** Score used to select this candidate (higher = better) */
  score: number;
}

/**
 * Try all concrete contracts in the source files and return the best layout.
 *
 * Useful when the target contract name is unknown or empty (e.g., diamond
 * proxy where the actual storage-bearing contract is a facet like AppStorage).
 *
 * Scoring heuristics:
 * - Number of storage entries (more = richer layout)
 * - Low-slot coverage (entries in slots 0-255 likely match observed RPC data)
 * - Names containing "Storage" or "AppStorage" get a bonus
 * - Struct member richness via types table
 *
 * @param files   Source file map
 * @param observedSlots  Optional set of slot indices observed as non-zero (for scoring overlap)
 */
export function reconstructBestStorageLayout(
  files: Record<string, string>,
  observedSlots?: Set<number>,
): CandidateResult | null {
  const { symbols, parseWarnings } = parseSourceFiles(files);
  const warnings = [...parseWarnings];

  if (symbols.contracts.size === 0) return null;

  let bestResult: CandidateResult | null = null;

  for (const [name, contract] of symbols.contracts) {
    // Skip abstract contracts, interfaces, libraries (no state vars)
    if (contract.kind === 'abstract' || contract.kind === 'interface' || contract.kind === 'library') continue;
    if (contract.stateVars.length === 0) continue;

    try {
      const chain = linearize(name, symbols);
      const vars = collectStateVars(chain, symbols, []);
      if (vars.length === 0) continue;

      const result = allocateSlots(vars, symbols);
      if (result.storage.length === 0) continue;

      // Score this candidate
      let score = result.storage.length; // base: number of entries

      // Bonus for low-slot coverage (slots 0-255)
      const lowSlotCount = result.storage.filter(e => {
        const s = parseInt(e.slot, 10);
        return !isNaN(s) && s < 256;
      }).length;
      score += lowSlotCount * 2;

      // Bonus for overlap with observed non-zero RPC slots
      if (observedSlots && observedSlots.size > 0) {
        let overlap = 0;
        for (const entry of result.storage) {
          const s = parseInt(entry.slot, 10);
          if (!isNaN(s) && observedSlots.has(s)) overlap++;
        }
        score += overlap * 5; // strong signal
      }

      // Bonus for storage-suggestive names
      const lowerName = name.toLowerCase();
      if (lowerName.includes('storage') || lowerName.includes('appstorage')) {
        score += 10;
      }

      // Bonus for type richness (struct member count)
      const typeEntries = Object.values(result.types);
      const structMembers = typeEntries.reduce((acc, t) => acc + (t.members?.length ?? 0), 0);
      score += Math.min(structMembers, 50); // cap to avoid runaway scores

      if (!bestResult || score > bestResult.score) {
        bestResult = {
          layout: { storage: result.storage, types: result.types },
          confidence: 'reconstructed',
          warnings: [...warnings, ...result.warnings],
          chosenContract: name,
          score,
        };
      }
    } catch {
      // Linearization or allocation failed for this candidate — skip
    }
  }

  return bestResult;
}
