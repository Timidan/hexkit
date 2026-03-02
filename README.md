<p align="center">
  <img src="public/logos/hexkit-favicon.svg" alt="HexKit Logo" width="80" height="80" />
</p>

<h1 align="center">HEXKIT</h1>

<p align="center">
  A local-first EVM developer toolkit for decoding, simulating, and debugging smart contract transactions.
</p>

---

## Overview

HexKit is a browser-based web3 developer toolkit built for inspecting, simulating, and debugging EVM transactions. All heavy compute -- REVM replay, instrumentation, and trace decoding -- runs locally, keeping your data private and your workflow fast.

The application pairs a React frontend with a local Rust-powered EDB (EVM Debugger) engine that provides full transaction replay, step-through debugging, and storage introspection without relying on third-party simulation services.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, TypeScript, Vite 5 |
| Styling | Tailwind CSS v4, shadcn/ui |
| Web3 | ethers v5, viem, wagmi, RainbowKit |
| Simulation | REVM (Rust), EDB engine, WebSocket bridge |
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

## License

Private. All rights reserved.
