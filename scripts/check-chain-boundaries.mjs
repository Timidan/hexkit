import { readFileSync, readdirSync } from "node:fs";

const ids = readdirSync("src/chains", { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name);
const IDS = ids.join("|");
const SHELL = [
  "src/main.tsx",
  "src/App.tsx",
  "src/components/PersistentTools.tsx",
  "src/components/Navigation.tsx",
  "src/components/MobileDrawer.tsx",
  "src/components/TopBar.tsx",
  "src/chains/plugin.ts",
];
const registry = "src/chains/plugins.tsx";
const sdkImport = /(?:\bfrom\s*|^\s*import\s*|\bimport\s*\()['"](?:viem|wagmi|@wagmi\/|ethers|@rainbow-me\/rainbowkit|@gear-js\/|@polkadot\/|sails-js)(?=[\/'"])/m;
const chainImport = new RegExp(`['"](?:\\.\\/|[^'"]*\\/chains\\/)(?:${IDS})(?:\\/[^'"]*)?['"]`);
const chainLiteral = new RegExp(`['"\`]\\/?(?:${IDS})(?=[\\/'"\`])`);
let violations = 0;
const checkedFiles = new Set();

function report(location, rule, message) {
  console.error(`${location}: rule ${rule}: ${message}`);
  violations++;
}

function check(file, rules) {
  checkedFiles.add(file);
  readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
    for (const [rule, pattern, message] of rules) {
      if (pattern.test(line)) report(`${file}:${index + 1}`, rule, message);
    }
  });
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

for (const file of [...SHELL, registry]) {
  check(file, [
    [1, sdkImport, "chain SDK import in shell or registry"],
    ...(file === registry ? [] : [
      [2, chainImport, "chain folder import in shell"],
      [3, chainLiteral, "chain id or path in shell"],
    ]),
  ]);
}

const registrySource = readFileSync(registry, "utf8");
for (const id of ids) {
  if (!new RegExp(`from\\s*['"]\\.\\/${id}(?:\\/[^'"]*)?['"]`).test(registrySource)) {
    report(`src/chains/${id}`, 4, "chain folder is not registered");
  }
  const rules = ids.filter((other) => other !== id).map((other) => [
    5,
    new RegExp(`['"](?:\\.\\.\\/|[^'"]*\\/chains\\/)${other}(?:\\/|['"])`),
    `chain folder imports ${other}`,
  ]);
  for (const file of filesUnder(`src/chains/${id}`)) check(file, rules);
}

if (violations) process.exit(1);
console.log(`✓ Chain boundaries: ${ids.length} chains, ${checkedFiles.size} files, 5 rules`);
