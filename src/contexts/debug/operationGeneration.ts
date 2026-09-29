export interface OperationGeneration {
  begin(): number;
  current(): number;
  isCurrent(generation: number): boolean;
  invalidate(): void;
}

/** Monotonic ownership token for async Debug Session operations. */
export function createOperationGeneration(): OperationGeneration {
  let current = 0;
  return {
    begin() {
      current += 1;
      return current;
    },
    isCurrent(generation) {
      return current === generation;
    },
    current() {
      return current;
    },
    invalidate() {
      current += 1;
    },
  };
}
