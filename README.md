<p align="center">
  <img src="public/logos/hexkit-favicon.svg" alt="HexKit Logo" width="80" height="80" />
</p>

<h1 align="center">HEXKIT</h1>

<p align="center">
  A local-first EVM developer toolkit for decoding, simulating, debugging smart contract transactions, and managing DeFi yield.
</p>

---

## Overview

HexKit is a browser-based web3 developer toolkit built for inspecting, simulating, and debugging EVM transactions, with an integrated DeFi yield management layer. All heavy compute -- REVM replay, instrumentation, and trace decoding -- runs locally, keeping your data private and your workflow fast.

The application pairs a React frontend with a local Rust-powered EDB (EVM Debugger) engine that provides full transaction replay, step-through debugging, and storage introspection without relying on third-party simulation services. The integrations layer connects to external DeFi protocols (starting with LI.FI) for cross-chain yield discovery, deposit execution, and portfolio management.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, TypeScript, Vite 5 |
| Styling | Tailwind CSS v4, shadcn/ui |
| Web3 | ethers v5, viem, wagmi, RainbowKit |
| Simulation | REVM (Rust), EDB engine, WebSocket bridge |
| Integrations | LI.FI SDK (Earn API, Composer), Gemini LLM |
| API Proxies | Vercel Serverless Functions |
| Testing | Vitest, Testing Library |

## Features

### Smart Decoder

Paste any calldata, transaction hash, or function signature and HexKit auto-detects the format and decodes it using the OpenChain signature database. Supports custom ABI input for decoding private or unregistered functions. A local signature cache enables offline use.

### Signature Database

Look up function selectors (4-byte) and event topics by name or hex signature. Manage custom signatures and browse the local cache.

### Transaction Builder

Two operating modes:

- **Live Interaction** -- Connect a wallet via RainbowKit, then read and write contract functions on any EVM chain directly from the browser.
- **Simulation (EDB)** -- Build transactions and simulate them through the local EDB engine. Get full REVM replay with execution traces, state changes, event logs, and gas analysis without spending gas or requiring a wallet.

### Source Tools

- **Contract Explorer** -- Browse verified contract source code fetched from Sourcify, Etherscan, and Blockscout.
- **Contract Diff** -- Side-by-side bytecode and source comparison between two contracts on the same or different chains.
- **Storage Layout Viewer** -- AST-based storage slot reconstruction with live value reading from on-chain state.

### Simulation Results

A full simulation analysis page with six tabs:

- **Summary** -- Gas usage, value transferred, and execution status.
- **Events** -- Decoded event logs with token movement visualization.
- **State Changes** -- Storage diff with named slots when source is available.
- **Execution Trace** -- Step-through call tree with source mapping.
- **Contracts** -- All contracts involved in the transaction with verification status.
- **Debug** -- Step-through Solidity debugger with breakpoints, snapshots, and an expression evaluator.

### Simulation History

Browse past simulations stored in IndexedDB. Re-open any previous result for review or further debugging.

### Transaction Analysis (Tx-Captain)

A forensics sub-tool that turns a completed simulation into a verifiable, evidence-backed verdict. Two entry points:

- Click **Summarize** in the simulation results header (next to Share/Export).
- Open `/builder?mode=analysis` directly — the panel attaches to whichever simulation is currently pinned in the SimulationContext.

What it does:

- **Evidence extraction** -- Walks the V3 trace and emits a structured evidence packet (calls, storage reads/writes, events, transfers, path contracts).
- **Heuristic sieve** -- Flags patterns that routinely ship bugs: `revert_on_path`, `sload_after_sstore` (state contradicting writes), `zero_address_transfer`, `large_delta` (transfers at/over 10 ETH), and `accumulator` (three or more writes to the same contract slot).
- **LLM verdict** -- Sends the sanitized packet to the configured LLM (Gemini / Anthropic / OpenAI / custom, per the LLM config panel) and parses the response against a Zod schema: verdict, confidence, core contradiction, causal chain, gates, risk upper bound, missing evidence.
- **Deep Dive (optional)** -- When enabled, fetches verified Solidity source for each path contract (Sourcify / Etherscan / Blockscout) and falls back to Heimdall decompilation on unverified addresses. Sources are stripped of SPDX/pragma/import lines and vendored libraries (`@openzeppelin/…`, `@chainlink/…`, `node_modules/…`) before being sent to the LLM.

Privacy and export guarantees:

- Analyses are stored in a dedicated IndexedDB store (`web3-toolkit-tx-analysis`) separate from simulation history and are never uploaded.
- Sensitive keys (`rpcUrl`, `apiKey`, `privateKey`, `secret`, …) are stripped recursively before persistence.
- Prompts are SHA-256 hashed alongside the verdict so you can audit exactly what was sent.
- Each verdict can be exported as Markdown or JSON from the panel toolbar.

#### Encrypted Triage (Fhenix Wave 3)

Alongside the classical LLM path, Tx-Captain ships an **encrypted triage** path built on Fhenix CoFHE. The browser encrypts a 12-bit feature vector derived from the EvidencePacket and submits it to a live fhEVM classifier on Ethereum Sepolia. The contract classifies the vector under FHE, storing encrypted `(classBits, severity)` handles that only the submitter can decrypt via `decryptForView` + self-issued permit. A second contract — `RiskThrottle` — consumes the encrypted severity via `FHE.select` and updates per-user throttle status without any party decrypting on-chain.

Live deployments (Ethereum Sepolia, chainId 11155111):

| Contract | Address | Etherscan |
|---|---|---|
| `HackTriage` | `0xBe02be322c7733759ee068067BD620791e9e73D4` | [verified](https://sepolia.etherscan.io/address/0xBe02be322c7733759ee068067BD620791e9e73D4#code) |
| `RiskThrottle` | `0x1FbB01D8e3FE4E99D6742eeBf1A4e276050ecD05` | [verified](https://sepolia.etherscan.io/address/0x1FbB01D8e3FE4E99D6742eeBf1A4e276050ecD05#code) |

Reproduction:

1. Set `VITE_HACK_TRIAGE_ADDRESS` in `.env` (defaults to the live address above).
2. Connect a Sepolia-funded wallet via RainbowKit, run a simulation, and open the Analysis panel.
3. Flip the **Cleartext / Encrypted** toggle in `TxAnalysisPanel` to Encrypted, then click **Run Encrypted Triage**.
4. The hook walks `encrypting → writing → waiting-fhe → decrypting → ready`, revealing class labels and severity locally without ever decrypting on-chain.

Architecture, threat model, leakage table, and open questions live in [docs/superpowers/plans/fhenix-wave3-architecture.md](docs/superpowers/plans/fhenix-wave3-architecture.md). Solidity sources are in [fhe/contracts/](fhe/contracts/); client helpers in [src/utils/hack-analysis/triage/](src/utils/hack-analysis/triage/) and [src/components/tx-analysis/useHackTriage.ts](src/components/tx-analysis/useHackTriage.ts).

### Integrations

The `/integrations` route hosts protocol-specific modules that extend HexKit beyond debugging into active DeFi operations.

#### LI.FI Earn

A full yield management layer powered by the LI.FI Earn API:

- **Vault Browser** -- Browse, search, and filter yield vaults across 20+ protocols and all supported EVM chains. Each vault shows live APY, TVL, underlying tokens, and protocol metadata.
- **My Positions** -- View open earn positions for any connected wallet or arbitrary address. Shows per-position PnL and portfolio summary.
- **Deposit / Withdraw Flows** -- Deposit into and withdraw from vaults directly through LI.FI's Composer API, which handles cross-chain swaps and bridging automatically.
- **Vault Simulator** -- Forecast projected returns for any vault over a configurable time horizon before committing capital.

#### Yield Concierge (AI-powered)

An AI assistant that translates natural language yield goals into actionable vault recommendations:

- **Intent Parser** -- Gemini LLM converts free-text prompts ("safest USDC vault above 5% on Arbitrum") into structured filters (token, chain, APY range, objective, protocol allow/deny lists).
- **My Assets Mode** -- Say "best vaults for my assets" and the concierge fans out per-asset recommendations for every idle token in the connected wallet.
- **Consolidate Mode** -- Say "best vault for my assets" (singular) and the concierge finds the top vault candidates to funnel all holdings into a single position via cross-chain swaps.
- **Idle Sweep** -- Detects wallet tokens sitting idle (not earning yield) and suggests the best vault for each, with one-click deposit.
- **Execution Pipeline** -- A sequential deposit queue that processes multiple deposits one after another, handling quoting, approval, execution, and cross-chain bridge status polling for each leg.
- **Model Fallback** -- The LLM proxy tries `gemini-3.1-pro-preview` first and auto-falls back to `gemini-2.5-flash` on rate limits, keeping recommendations available without interruption.

### Contract Resolution

HexKit resolves contract ABIs and source code through parallel multi-source lookup:

1. **Sourcify** (full match and partial match)
2. **Etherscan** (and compatible explorers)
3. **Blockscout**
4. **WhatsABI** decompilation fallback for unverified contracts

Additional capabilities:

- Diamond proxy (EIP-2535) facet resolution with automatic loupe calls
- Two-tier caching: L1 (in-memory LRU) and L2 (IndexedDB with 24-hour TTL)

### Debug Sessions

Full Solidity step-through debugger powered by the local EDB engine:

- Source-level breakpoints tied to Solidity source maps
- Expression evaluator with a three-tier resolution chain: locals, storage-layout decode, and ABI getter fallback
- Dual-layer snapshot system (opcode snapshots and hook snapshots)
- Keep-alive sessions via the EDB bridge for long-running investigations

## Architecture

HexKit follows a local-first architecture. The frontend communicates with a local EDB simulator bridge over WebSocket, which in turn drives the Rust-based REVM engine.

```
Browser (React)  <-->  Simulator Bridge (:5789)  <-->  EDB Engine (Rust/REVM)
```

Visual architecture diagrams are available in the `schematics/` folder:

| Diagram | Description |
|---------|-------------|
| `schematics/hexkit-app-architecture.excalidraw` | Frontend application layers, routes, and data flow |
| `schematics/edb-system-topology.excalidraw` | End-to-end system architecture (Frontend, Bridge, Rust Engine, REVM) |
| `schematics/edb-engine-internals.excalidraw` | EDB engine 8-step workflow and dual snapshot system |

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Rust toolchain (for building the EDB simulator)

### Quick Start

The start script handles everything:

```bash
./start-dev.sh
```

It performs the following steps:

1. Checks for the `edb-simulator` binary (auto-builds via `cargo build -p edb-simulator --release` if missing)
2. Starts the EDB simulator bridge on port 5789
3. Starts the Vite dev server on port 5173

### Manual Start

```bash
# Terminal 1: EDB bridge
npm run simulator:server

# Terminal 2: Frontend
npm run dev
```

### Environment

The app works out of the box with public RPC endpoints. For better reliability, configure an Alchemy API key, Infura project ID, or a custom RPC URL through the RPC Settings modal (gear icon in the top bar).

For the LI.FI Earn integration and AI concierge, set the following in `.env`:

| Variable | Purpose |
|----------|---------|
| `LIFI_API_KEY` | LI.FI API key for Earn and Composer endpoints |
| `GEMINI_API_KEY` | Google AI Studio API key for the yield concierge LLM |
| `GEMINI_MODEL` | Primary Gemini model (default: `gemini-3.1-pro-preview`) |
| `GEMINI_FALLBACK_MODEL` | Fallback on 429/503 (default: `gemini-2.5-flash`) |
| `PROXY_SECRET` | Shared secret for API proxy authentication (production) |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins (production) |
| `VITE_HACK_TRIAGE_ADDRESS` | Ethereum Sepolia `HackTriage` contract (default: `0xBe02...73D4`) |

### Heimdall endpoints (bridge)

The bridge exposes three POST endpoints that shell out to the [heimdall-rs](https://github.com/Jon-Becker/heimdall-rs) CLI:

- `POST /heimdall/version` → `{ available: boolean, version?: string }`
- `POST /heimdall/decompile` → `{ source, abi, bytecodeHash, ... }`
  - Body: `{ bytecode: "0x..." }` **or** `{ address, chainId }`
- `POST /heimdall/dump` → `{ slots: [...], address, chainId, blockNumber, ... }`
  - Body: `{ address, chainId, blockNumber? | blockTag? }`

**Security:** Clients must not send `rpcUrl` — the bridge resolves it per-chain from a server-side allowlist (default: mainnet / optimism / base / arbitrum) and rejects any request that carries `rpcUrl` with HTTP 400. Override the allowlist with `HEIMDALL_RPC_BY_CHAIN` (see `.env.example`). The bridge also computes `bytecodeHash` itself from `eth_getCode` — the client never supplies it — to prevent cache-key poisoning.

Results are cached in-memory on the bridge (LRU + TTL). To install the binary: run `bash edb/scripts/install.sh` — it pulls heimdall via bifrost automatically unless `INSTALL_HEIMDALL=0`. Front end consumers use [`src/utils/heimdall/hooks.ts`](src/utils/heimdall/hooks.ts).

#### Unverified contract support (heuristic tier)

When Sourcify has no source for a contract, the Storage Layout Viewer falls back to Heimdall decompilation if the bridge has it installed. Results are shown with an amber **Heuristic** badge and a banner explaining the caveats:

- Slot labels derived from decompiled function signatures (ERC20-like, Ownable, Pausable) and Heimdall's `modifiers` hint per slot.
- Struct packing is **not** resolved — every populated slot is shown as a single 32-byte value.
- Mapping keys must be discovered manually (use the existing mapping probe).

To enable: install Heimdall on the bridge (see install step above). To disable globally, set `HEIMDALL_BIN_PATH` to a path that does not exist — the availability check will fall back to "unavailable" and the heuristic tier is skipped.

## Project Structure

```
src/
  components/
    simple-grid/             Transaction builder grid layout
    smart-decoder/           Calldata decoder module
    simulation-results/      Results page sub-modules
    explorer/                Source tools (explorer, diff, storage layout)
    execution-trace/         Trace viewer components
    debug/                   Debug window and panels
    integrations/
      IntegrationsHub.tsx    Integration router
      lifi-earn/
        LifiEarnPage.tsx     Main earn page (positions, vaults tabs)
        VaultList.tsx        Vault browser with filters
        VaultDrawer.tsx      Vault detail sheet
        DepositFlow.tsx      Deposit transaction flow
        WithdrawFlow.tsx     Withdraw transaction flow
        earnApi.ts           LI.FI Earn API client
        concierge/
          ConciergePanel.tsx       Yield concierge tabs (idle sweep + intent)
          IdleSweepPanel.tsx       Idle asset detection and recommendations
          VaultRecommendations.tsx  Recommendation card grid
          ExecutionQueue.tsx       Sequential deposit pipeline UI
          executionMachine.ts      Reducer-based execution state machine
          intent/
            IntentPanel.tsx        AI intent UI (prompt, chips, results)
            schema.ts              ParsedIntent zod schema
            hooks/
              useIntentParser.ts        LLM prompt → structured intent
              useVaultsByIntent.ts      Filter + rank vaults by intent
              useIntentRecommendation.ts  LLM-powered vault picks
    shared/                  Reusable components
    icons/                   Icon library
    ui/                      shadcn/ui primitives
  contexts/                  React contexts (state management)
  hooks/                     Custom hooks
  services/                  Service layer (bridge, history, vault)
  utils/
    resolver/                Contract resolution engine
    traceDecoder/            Trace decoding pipeline
    transaction-simulation/  Simulation logic
    solidity-layout/         Storage layout reconstruction
    fetchers/                API fetchers (Sourcify, Etherscan, Blockscout)
    cache/                   Caching utilities
  workers/                   Web Workers (trace decoder)
  types/                     TypeScript types
  styles/                    CSS modules
  config/                    App configuration
  lib/                       Shared libraries

api/
  llm-invoke.ts              Provider-agnostic LLM proxy (allowlist-enforced BYOK transport)
  llm-recommend.ts           Gemini LLM proxy with model fallback (legacy; kept for rollback)
  lifi-composer.ts           LI.FI Composer quote/execute proxy
  edb/                       EDB simulation API routes

edb/
  crates/engine/             Core debug engine
  crates/edb-simulator/      CLI simulator binary
  crates/rpc-proxy/          Intelligent RPC proxy

scripts/                     Dev scripts (bridge, perf tests)
schematics/                  Architecture documentation
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + production build |
| `npm run simulator:server` | Start EDB simulator bridge |
| `npm run test` | Run Vitest |
| `npm run qa:live:matrix` | Live QA test matrix |
| `npm run perf:debug-matrix` | Debug performance stress test |

## Documentation

Architecture docs live in `schematics/`:

| Document | Purpose |
|----------|---------|
| `SYSTEM_SCHEMATIC.md` | High-level architecture and task-to-area index |
| `DATAFLOWS.md` | End-to-end data flow diagrams |
| `GRANULAR-COMPONENTS.md` | Component-level documentation |
| `LEGEND.md` | Doc routing guide |

## Giveth
https://giveth.io/project/hexkit



## License

Private. All rights reserved.
