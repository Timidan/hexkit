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

### Vara tools

Select **Vara** in the chain switcher. Its tools sit under three tabs, each with sub-tools: **Transaction Simulator** (`/vara/transactions`), **Program Tools** (`/vara/program-tools`) and **Integrations** (`/vara/integrations`). They are isolated from the EVM runtime:

- **Program Interaction**: load a mainnet program by id, SS58 address, or Gear IDEA/Subscan link, then query it or simulate its functions through typed forms built from its Sails IDL (fetched from Gear IDEA or loaded from a file). Sending a message needs a connected Vara wallet. Recent messages open in Message Inspector.
- **Message Simulation**: compose a raw or typed Sails message, calculate its reply at a selected chain snapshot, and compare another block without signing.
- **Scenario Tests**: run uploaded Gear WASM locally, keep state across messages, use multiple programs and senders, advance blocks, inject an explicitly marked mock failure, and assert replies, processing status, or balances. Import/export scenario JSON and export a standalone Rust regression test. The Sails example runs a compiled Sails program (source under `vara-simulator/fixtures/sails-tally`) and shows each reply decoded with its IDL.
- **Gas & Vouchers**: inspect gas estimates, fees, balances, voucher scope, expiry, and funding. Reports distinguish snapshot balances/replies from current-head gas estimates; eligibility is not a guarantee of execution.
- **IDL Comparison**: compare Sails service signatures (legacy or IDL v2) and check saved message payloads against both interfaces using an exact decode/encode round trip.
- **Event Explorer**: inspect a bounded indexed block range, decode Sails events, map output columns, export data, and generate a typed TypeScript handler.
- **Vara.eth Settlement**: correlate Mirror requests and replies by message ID and inspect Ethereum finality. Supports bounded log searches or a supplied settlement receipt. Unavailable evidence is reported separately from an absent reply.

**Message Inspector** (`/vara/transactions?tool=message`, previously “Message Case”) adds separate inclusion, processing, reply, and application statuses, evidence-based diagnoses, an observed program timeline, locally saved investigations, and a handoff into Scenario Tests. Program forms can open the simulator, gas check, or event explorer with their current inputs. **Address** (`/vara/program-tools?tool=address`) converts between SS58 addresses and hex ActorIds. Older links (`/vara/message`, `/vara/address`, `/vara/program`, `/vara/lab`) redirect to these locations.

Start the local scenario runtime in a second terminal:

```bash
npm run dev
# In another terminal (Rust required; initial compilation takes several minutes):
npm run vara:simulator
```

The runtime uses `gtest = 2.0.0` at `127.0.0.1:5791`; it needs no wallet or deployed program. **Load working example** exercises state changes and a trap; **Load two-program example** exercises a delayed cross-program reply with two senders. See [the runtime README](vara-simulator/README.md) for limits, exports, and checks.

Limits: local scenarios start from supplied fixtures, not reconstructed historical chain state. The RPC simulator calculates a message reply, not the inclusion of a signed extrinsic. Interfaces load as legacy Sails IDL or IDL v2 (via sails-js 1.0.0); generic user types in IDL v2 forms resolve one level deep. Event coverage depends on SQD availability. Public Ethereum providers may restrict archival logs and state; direct receipt inspection remains available. Vara.eth validator state requires a local node, and pre-confirmation signatures are not verified. No new tool sends transactions.

### Smart Decoder

Paste raw calldata and HexKit resolves the selector against the OpenChain signature database and decodes the parameters. An args-only mode decodes ABI-encoded blobs with no selector. Supports custom ABI input for decoding private or unregistered functions; a local signature cache lets previously resolved selectors decode offline. (To decode an on-chain transaction by hash, use Transaction Replay.)

### Signature Database

Look up function selectors (4-byte) and event topics by name or hex signature. Manage custom signatures and browse the local cache.

### Transaction Builder

Two operating modes:

- **Live Interaction** -- Connect a wallet via RainbowKit, then read and write contract functions on any EVM chain directly from the browser. Payable functions take a Value field, as decimal ETH or hex wei.
- **Simulation (EDB)** -- Build transactions and simulate them through the local EDB engine. Get full REVM replay with execution traces, state changes, event logs, and gas analysis without spending gas or requiring a wallet.

### Source Tools

- **Contract Explorer** -- Browse verified contract source code fetched from Sourcify, Etherscan, and Blockscout.
- **Contract Diff** -- Side-by-side runtime-bytecode comparison between two contracts on the same or different chains, with optional Solidity metadata stripping.
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
  llm-recommend.ts           Gemini LLM proxy with model fallback
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
