#!/usr/bin/env node
/**
 * Family-import boundary checker.
 *
 * Rule: generic modules (code that is NOT family-scoped) must not import
 * family-specific libraries. EVM libraries (viem, wagmi, @wagmi/core, ethers,
 * @rainbow-me/rainbowkit, @wagmi/connectors) should only appear inside:
 *   - src/chains/evm/**               (the EVM facade)
 *   - src/chains/adapters/evmAdapter.ts
 *   - EVM feature code (src/components/**, src/utils/** etc.)
 *
 * Files that must stay EVM-clean are listed in GENERIC_GLOBS below. They
 * form the surface the app shell walks through before choosing a family.
 *
 * Run: node scripts/check-family-imports.mjs
 *
 * Exits 1 on any violation, 0 when clean.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

/**
 * Directories whose contents are "generic" — must not pull in family-specific
 * SDKs. Everything else is considered family-scoped (by convention today;
 * Phase 4+ will tighten it further).
 */
const GENERIC_DIRS = [
  "chains",       // EXCEPT chains/evm/**, chains/adapters/evmAdapter.ts
  "routes",
  "features",     // feature shells, EXCEPT features/*/adapters/** and features/*/simulator/**
];

/**
 * Additional generic files at the app-shell level. These drive the family
 * boundary and must stay EVM-clean so they can render Starknet / Solana
 * routes without eagerly loading EVM libraries.
 */
const GENERIC_FILES = [
  "App.tsx",
  "main.tsx",
  "components/Navigation.tsx",
  "components/PersistentTools.tsx",
  "components/MobileDrawer.tsx",
  "components/HomePage.tsx",
  "components/shared/FamilySelector.tsx",
  "hooks/useActiveChainFamily.ts",
  "hooks/useActiveChainDescriptor.ts",
];

/** Paths inside GENERIC_DIRS allowed to import family-specific libraries. */
const GENERIC_ALLOWLIST = [
  "chains/evm",
  "chains/starknet",
  "chains/adapters/evmAdapter.ts",
  // Family wallet providers — one file per family.
  "chains/providers",
];

/** Path segments that, when present, mark a file as family-scoped
 *  (i.e. allowed to import EVM SDKs even inside a generic dir). */
const GENERIC_ALLOWLIST_SEGMENTS = [
  "adapters/evm",
  "adapters/svm",
  "simulator",
];

const FORBIDDEN_MODULES = [
  // EVM
  "viem",
  "wagmi",
  "@wagmi/core",
  "@wagmi/connectors",
  "ethers",
  "@rainbow-me/rainbowkit",
  // Starknet
  "starknet",
  "starkzap",
  "@cartridge/controller",
  // Solana
  "@solana/wallet-adapter-base",
  "@solana/wallet-adapter-react",
  "@solana/wallet-adapter-react-ui",
  "@solana/wallet-adapter-wallets",
  "@solana/web3.js",
];

const FORBIDDEN_RE = new RegExp(
  `(?:import|require)\\s*(?:[\\s\\S]*?from\\s*)?['"](?:${FORBIDDEN_MODULES
    .map((m) => m.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"))
    .join("|")})(?:/[^'"]*)?['"]`,
);

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      yield* walk(path);
    } else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry.name)) {
      yield path;
    }
  }
}

function isAllowlisted(relPath) {
  if (
    GENERIC_ALLOWLIST.some(
      (allowed) => relPath === allowed || relPath.startsWith(`${allowed}/`),
    )
  ) {
    return true;
  }
  return GENERIC_ALLOWLIST_SEGMENTS.some((seg) =>
    relPath.split("/").join("/").includes(`${seg}/`),
  );
}

async function collectGenericFiles() {
  const files = new Set();

  for (const dir of GENERIC_DIRS) {
    const abs = join(SRC, dir);
    try {
      await stat(abs);
    } catch {
      continue;
    }
    for await (const file of walk(abs)) {
      const rel = relative(SRC, file);
      if (!isAllowlisted(rel)) files.add(file);
    }
  }

  for (const rel of GENERIC_FILES) {
    files.add(join(SRC, rel));
  }

  return [...files];
}

async function main() {
  const files = await collectGenericFiles();
  const violations = [];

  for (const file of files) {
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue; // file may not exist (GENERIC_FILES is aspirational)
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (FORBIDDEN_RE.test(lines[i])) {
        violations.push({
          file: relative(ROOT, file),
          line: i + 1,
          text: lines[i].trim(),
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      `\n✗ Family-import boundary violation${violations.length === 1 ? "" : "s"} (${violations.length}):\n`,
    );
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`    ${v.text}`);
    }
    console.error(
      `\nGeneric modules must not import EVM-specific libraries (${FORBIDDEN_MODULES.join(", ")}).`,
    );
    console.error("Route those imports through src/chains/evm/* instead.\n");
    process.exit(1);
  }

  console.log(
    `✓ Family-import boundary clean (${files.length} generic files checked).`,
  );
}

main().catch((err) => {
  console.error("check-family-imports failed:", err);
  process.exit(1);
});
