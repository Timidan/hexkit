import { readFile } from "node:fs/promises";

const TARGET_FILE = "src/components/simple-grid/layout/CalldataSection.tsx";
const REQUIRED_SNIPPETS = [
  'import { CopyButton } from "../../ui/copy-button";',
  "<CopyButton",
  'ariaLabel="Copy generated calldata"',
  "value={generatedCallData}",
];

const source = await readFile(TARGET_FILE, "utf8");
const missing = REQUIRED_SNIPPETS.filter((snippet) => !source.includes(snippet));

if (missing.length > 0) {
  console.error(`Inline copy button check failed in ${TARGET_FILE}.`);
  for (const snippet of missing) {
    console.error(`Missing snippet: ${snippet}`);
  }
  process.exit(1);
}

console.log(`Inline copy button source check passed in ${TARGET_FILE}.`);
