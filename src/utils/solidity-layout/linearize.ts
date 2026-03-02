/**
 * C3 Linearization for Solidity Inheritance
 *
 * Implements the C3 linearization algorithm that Solidity uses to determine
 * the order in which base contracts contribute state variables to storage.
 *
 * Solidity's rule for `contract C is B1, ..., Bn`:
 *   L(C) = [C] + merge(L(Bn), ..., L(B1), [Bn, ..., B1])
 *
 * Note: In Solidity "is B1, ..., Bn", B1 is the most base-like (leftmost)
 * and Bn is the most derived-like (rightmost). The merge lists start with
 * L(Bn) -- rightmost parent linearized first.
 *
 * The returned order is **most-base first** (storage variable order),
 * which is the reverse of the standard C3 output.
 */

import type { SymbolTable } from './types';

/**
 * Compute the C3 linearization for `contractName` and return the chain
 * in **most-base-first** order (the order state variables are laid out
 * in storage).
 *
 * For: contract C is A, B
 *   Standard C3: [C, B, A]  (most-derived first)
 *   Storage order: [A, B, C] (most-base first) -- returned by this function
 *
 * If a contract is not found in the symbol table, it is silently omitted
 * (common for imported interfaces or library bases).
 *
 * @throws Error if the C3 linearization fails (inconsistent hierarchy).
 */
export function linearize(contractName: string, symbols: SymbolTable): string[] {
  // Cache is function-scoped to avoid concurrency hazards when multiple
  // contracts are being processed in parallel.
  const cache = new Map<string, string[]>();

  const c3 = computeC3(contractName, symbols, cache);
  // C3 gives [Derived, ..., Base] -- reverse for storage order
  return c3.slice().reverse();
}

/**
 * Recursive C3 linearization with memoization.
 * Returns [C, ...parents] in most-derived-first order.
 */
function computeC3(
  name: string,
  symbols: SymbolTable,
  cache: Map<string, string[]>,
): string[] {
  // Check memo
  const cached = cache.get(name);
  if (cached) return cached;

  const contract = symbols.contracts.get(name);
  if (!contract) {
    // Unknown contract (interface, external import, etc.) -- treat as leaf
    const result = [name];
    cache.set(name, result);
    return result;
  }

  const bases = contract.bases; // [B1, ..., Bn] in declaration order (left-to-right)

  if (bases.length === 0) {
    // No inheritance -- simple case
    const result = [name];
    cache.set(name, result);
    return result;
  }

  // Build the list of sequences to merge:
  // [L(Bn), ..., L(B1), [Bn, ..., B1]]
  // i.e. rightmost parent linearized first, then leftmost, then reversed bases list.
  const sequences: string[][] = [];

  // Add L(Bn) ... L(B1) -- reversed order of bases
  for (let i = bases.length - 1; i >= 0; i--) {
    sequences.push(computeC3(bases[i], symbols, cache));
  }

  // Add the direct bases list in reversed order [Bn, ..., B1]
  sequences.push([...bases].reverse());

  const merged = merge(sequences);
  const result = [name, ...merged];
  cache.set(name, result);
  return result;
}

/**
 * C3 merge algorithm.
 *
 * Repeatedly select the first element of a list that does not appear in
 * the **tail** (everything except the first element) of any other list.
 * Remove it from all lists. Repeat until all lists are empty.
 *
 * @throws Error if no valid candidate is found (inconsistent hierarchy).
 */
function merge(sequences: string[][]): string[] {
  // Work on copies so we don't mutate the cached linearizations
  const lists = sequences.map((s) => [...s]);
  const result: string[] = [];

  while (lists.some((list) => list.length > 0)) {
    // Remove empty lists
    const nonEmpty = lists.filter((l) => l.length > 0);

    // Find a candidate: first element of some list that is not in the tail of any list
    let candidate: string | null = null;

    for (const list of nonEmpty) {
      const head = list[0];
      const inTail = nonEmpty.some(
        (other) => other.indexOf(head, 1) !== -1,
      );
      if (!inTail) {
        candidate = head;
        break;
      }
    }

    if (candidate === null) {
      throw new Error(
        `C3 linearization failed: inconsistent inheritance hierarchy. ` +
        `Remaining lists: ${JSON.stringify(nonEmpty)}`,
      );
    }

    result.push(candidate);

    // Remove candidate from all lists
    for (const list of lists) {
      const idx = list.indexOf(candidate);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
    }
  }

  return result;
}
