export interface SanitizeOptions {
  filePath: string;
  maxChars?: number;
}

export interface SanitizeResult {
  sanitized: string;
  removedLines: number;
  dropped: boolean;
  truncated: boolean;
}

const VENDORED_PATTERNS = [
  /^@openzeppelin\//,
  /^@chainlink\//,
  /\/openzeppelin\//,
  /\/node_modules\//,
];

export function sanitizeSolidity(source: string, opts: SanitizeOptions): SanitizeResult {
  for (const p of VENDORED_PATTERNS) {
    if (p.test(opts.filePath)) {
      return { sanitized: "", removedLines: 0, dropped: true, truncated: false };
    }
  }

  const lines = source.split(/\r?\n/u);
  const kept: string[] = [];
  let removed = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("// SPDX") ||
      trimmed.startsWith("pragma solidity") ||
      trimmed.startsWith("pragma abicoder") ||
      trimmed.startsWith("import ")
    ) {
      removed += 1;
      continue;
    }
    kept.push(line);
  }

  let out = kept.join("\n");
  const max = opts.maxChars ?? 8000;
  let truncated = false;
  if (out.length > max) {
    out = `${out.slice(0, max)}\n// ... [truncated by tx-analysis sanitizer] ...`;
    truncated = true;
  }

  return { sanitized: out, removedLines: removed, dropped: false, truncated };
}
