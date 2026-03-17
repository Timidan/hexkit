# HexKit Local Development Workspace — Design Spec

**Date**: 2026-03-17
**Status**: Draft
**Scope**: Add local development support to HexKit — connect to local dev chains, compile/deploy/interact with contracts, debug transactions, and manage chain state — all from a unified browser-based workspace.

---

## 1. Goals & Non-Goals

### Goals
- Support local EVM development with simulation, debugging, and chain control comparable to Remix IDE
- Multi-backend support: Anvil, Hardhat Network, and Ganache from day one
- Compilation pipeline: detect local toolchain (Forge/Hardhat/solc), fall back to browser solc-js (WASM)
- Hybrid debugging: instant quick trace from the local node + full EDB source-level deep debug
- Full chain control panel with state surgery, time travel, snapshots, and impersonation
- Visual state inspector for accounts and contract storage
- Pre-send transaction simulation with diff preview modal
- File access via File System Access API (Chrome/Edge) with bridge server fallback (all browsers)
- Reuse existing HexKit infrastructure (EDB debugger, contract resolver, Monaco editor, shadcn/ui)

### Non-Goals
- Replacing full IDEs (VSCode, Remix Desktop) for large project development
- Supporting non-EVM chains
- Collaborative/multi-user workspace features
- CI/CD integration or automated testing pipelines
- Built-in package management (npm/forge install)

---

## 2. Architecture Overview

The workspace is a new top-level route (`/workspace`) with a dedicated multi-panel layout. It introduces five new core services and integrates deeply with existing HexKit modules.

```
┌──────────────────────────────────────────────────────────┐
│                      /workspace route                     │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ FileAccess  │  │ Compilation  │  │  ChainManager  │  │
│  │ Service     │  │ Service      │  │                │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                   │           │
│         └────────┬───────┘                   │           │
│                  ▼                           │           │
│         ┌────────────────┐                   │           │
│         │ WorkspaceState │◄──────────────────┘           │
│         └───────┬────────┘                               │
│                 │                                         │
│    ┌────────────┼──────────────┐                         │
│    ▼            ▼              ▼                          │
│  ┌──────┐  ┌────────┐  ┌──────────────┐                 │
│  │Deploy│  │Interact│  │LocalTrace    │                  │
│  │Panel │  │Panel   │  │Service       │                  │
│  └──────┘  └────────┘  └──────┬───────┘                  │
│                                │                          │
│                     ┌──────────┴──────────┐              │
│                     ▼                     ▼              │
│              Quick Trace            Deep Debug           │
│              (node RPC)          (EDB/REVM engine)       │
│                                                           │
│  ── Reused from existing HexKit ──                       │
│  DebugBridgeService, DebugContext, debug UI components,  │
│  networkConfig, contract resolver, solidity-layout,      │
│  Monaco editor, SimulationHistoryService, shadcn/ui      │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Workspace Layout

A VS Code-inspired layout with an activity rail, resizable panels, and responsive breakpoints.

```
┌──────────────────────────────────────────────────────────────┐
│  Toolbar: [Project ▼] [Compile] [Deploy] [⌘K Quick Action]  │
├────┬─────────┬──────────────────────┬────────────────────────┤
│    │         │                      │                        │
│ A  │  Left   │   Center Panel       │  Right Sidebar         │
│ C  │  Pane   │                      │  (Runtime Context)     │
│ T  │         │   Editor / ABI /     │                        │
│ I  │  File   │   Trace / Debug      │  Chain Info             │
│ V  │  Tree   │   tabs               │  Accounts              │
│ I  │  Search │                      │  Deployed Contracts    │
│ T  │  Outline│   (Monaco editor     │  Watches               │
│ Y  │  Deploy │    with per-file     │                        │
│    │  History│    view state)       │  320-400px             │
│ R  │         │                      │  (collapsible)         │
│ A  │ 240-    │     flexible         │                        │
│ I  │ 300px   │                      │                        │
│ L  │         │                      │                        │
│    │         ├──────────────────────┤                        │
│ 48 │         │  Bottom Panel        │                        │
│ px │         │  [Console][Txns]     │                        │
│    │         │  [Problems][Tests]   │                        │
├────┴─────────┴──────────────────────┴────────────────────────┤
│  Status: [Anvil ●] [Block 142] [Automine] [0xf39..] [solc]  │
└──────────────────────────────────────────────────────────────┘
```

### Panel Details

- **Activity Rail** (48-56px): Icon buttons switching the left pane between File Explorer, Search, Outline, Artifacts, Deploy History, Chain Settings.
- **Left Pane** (240-300px, collapsible): Context-dependent view based on activity rail selection.
- **Center Panel** (flexible, min 640px): Tabbed workspace for Monaco editor, ABI interaction, trace views, and debug sessions. Splits vertically with the bottom panel.
- **Right Sidebar** (320-400px, collapsible): Always-on runtime context — chain info, accounts, deployed contracts, watches.
- **Bottom Panel** (full-width, collapsible): Console output, transaction history, compilation problems, test results. Auto-opens on compile errors or failed txns.
- **Status Bar**: Chain/fork source, block number, automine status, active account, compiler version/problem count.

### Responsive Breakpoints

| Width | Layout |
|---|---|
| ≥1400px | Full tri-pane (activity rail + left + center + right) |
| 1100-1399px | Collapse right sidebar by default |
| 900-1099px | One side panel at a time |
| <900px | Drawers/sheets, single main workspace |

Collapsed panels restore to their last size, not a default.

### Monaco Editor Considerations

- `automaticLayout: true` with ResizeObserver handles panel resizing
- Per-file editor view state preservation (scroll position, cursor, selections) when switching tabs
- Minimum editor width: 640px before other panels steal space
- Pixel-based min sizes for resize handles with generous hit targets

---

## 4. Local Node Management (ChainManager)

### Architecture

```
                    ChainManager
                   ┌─────────────┐
                   │  detect()   │── Auto-scan ports 8545, 8546, 8547
                   │  connect()  │── Manual URL input
                   │  spawn()    │── Start embedded node (if installed)
                   │  status()   │── Heartbeat + chain info
                   └──────┬──────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        AnvilAdapter  HardhatAdapter  GanacheAdapter
```

### LocalNodeAdapter Interface

```typescript
interface LocalNodeAdapter {
  // Identity
  type: 'anvil' | 'hardhat' | 'ganache' | 'unknown'
  detect(): Promise<boolean>

  // Chain Control
  snapshot(): Promise<string>
  revert(id: string): Promise<void>
  mine(blocks?: number): Promise<void>
  setAutomine(enabled: boolean): Promise<void>
  setIntervalMining(ms: number): Promise<void>

  // Time Travel
  increaseTime(seconds: number): Promise<void>
  setNextBlockTimestamp(ts: number): Promise<void>

  // State Surgery
  setBalance(addr: string, wei: bigint): Promise<void>
  setCode(addr: string, bytecode: string): Promise<void>
  setNonce(addr: string, nonce: number): Promise<void>
  setStorageAt(addr: string, slot: string, value: string): Promise<void>

  // Account Control
  impersonate(addr: string): Promise<void>
  stopImpersonating(addr: string): Promise<void>

  // Tracing
  traceTransaction(hash: string): Promise<StructLog[]>
  traceCall(tx: CallParams, block?: string): Promise<StructLog[]>

  // Reset
  reset(options?: {
    forking?: { jsonRpcUrl: string; blockNumber?: number }
  }): Promise<void>
}
```

### Node Detection Logic

1. `web3_clientVersion` → parse response string
   - Contains `anvil` → AnvilAdapter
   - Contains `HardhatNetwork` → HardhatAdapter
   - Contains `Ganache` → GanacheAdapter
2. Fallback: `anvil_nodeInfo` → if succeeds, Anvil
3. Fallback: `hardhat_metadata` → if succeeds, Hardhat
4. Otherwise → `unknown` (basic `evm_*` only)

### RPC Method Mapping

| Operation | Anvil | Hardhat | Ganache |
|---|---|---|---|
| Snapshot | `evm_snapshot` | `evm_snapshot` | `evm_snapshot` |
| Revert | `evm_revert` | `evm_revert` | `evm_revert` |
| Mine | `evm_mine` | `hardhat_mine` | `evm_mine` |
| Set Balance | `anvil_setBalance` | `hardhat_setBalance` | N/A (limited) |
| Set Code | `anvil_setCode` | `hardhat_setCode` | N/A |
| Set Storage | `anvil_setStorageAt` | `hardhat_setStorageAt` | N/A |
| Set Nonce | `anvil_setNonce` | `hardhat_setNonce` | N/A |
| Impersonate | `anvil_impersonateAccount` | `hardhat_impersonateAccount` | N/A |
| Stop Impersonate | `anvil_stopImpersonatingAccount` | `hardhat_stopImpersonatingAccount` | N/A |
| Automine | `evm_setAutomine` | `evm_setAutomine` | `evm_setAutomine` |
| Increase Time | `evm_increaseTime` | `evm_increaseTime` | `evm_increaseTime` |
| Reset | `anvil_reset` | `hardhat_reset` | N/A |
| Trace Tx | `debug_traceTransaction` | `debug_traceTransaction` | `debug_traceTransaction` |

### Node Spawning (Standalone Mode)

- Check if `anvil` / `npx hardhat node` is available on PATH
- Spawn as child process from bridge server
- Capture stdout for account list and RPC URL
- Auto-kill on workspace close via bridge heartbeat monitoring: bridge checks client WebSocket connection every 10s; if client disconnects, spawned node processes are killed after a 30s grace period. On bridge server shutdown, all spawned child processes are killed via process group signal.
- Configurable: fork URL, block number, chain ID, account count, initial balance

### Fork Support

All three backends support forking. UI provides:
- "Fork from" dropdown → select network + optional block number
- Uses existing `networkConfig.ts` RPC URLs as fork sources
- Fork block number shown prominently in chain info panel

---

## 5. Compilation Pipeline

### Flow

```
User opens/saves .sol file
        │
        ▼
ToolchainDetector → detect project type
        │
        ▼
CompilationService → compile via detected toolchain
        │
        ▼
Artifacts → WorkspaceState (ABI, bytecode, source maps, AST, storage layout)
```

### Toolchain Detection Priority

| Priority | Detector | Signal | Command |
|---|---|---|---|
| 1 | Foundry | `foundry.toml` | `forge build --json` |
| 2 | Hardhat | `hardhat.config.[ts\|js]` | `npx hardhat compile --json` |
| 3 | Bare solc | `solc` on PATH | `solc --standard-json` |
| 4 | Browser | fallback | `solc-js` WASM in Web Worker |

Detection runs once on project open, re-runs on config file changes.

### Key Decisions

- **Local toolchain runs via bridge server**: Browser can't exec local binaries. New bridge endpoints:
  ```
  POST /compile         { projectRoot, toolchain, files?, solcVersion? }
  GET  /compile/toolchain   → { detected, version }
  ```
- **solc-js runs in a Web Worker**: Keeps UI responsive; WASM compiler runs off main thread
- **Auto-compile on save**: Configurable, debounced (300ms). Errors stream to Problems tab
- **Import resolution**: Foundry/Hardhat handle imports natively. solc-js fallback resolves `@openzeppelin/` etc. from `node_modules/` via file access layer
- **Artifact caching**: Keyed by content hash, re-compiles only on source change
- **Compiler version**: solc-js allows version selection (auto-detect from `pragma solidity`). Local toolchains use project config

---

## 6. Deploy & Interact Flow

### Deploy Panel

Users select a compiled contract, fill constructor arguments, choose an account, and either simulate first or deploy directly.

```
Compiled Contract
  → Constructor arg inputs (type-aware)
  → Account selector (from eth_accounts)
  → Value input (for payable constructors)
  → [Simulate & Preview] or [Deploy Direct]
```

### Pre-Send Simulation & Diff Preview

Every write transaction (deploy or interaction) can be simulated before sending.

**State override support by backend**: Anvil and Hardhat support `eth_call` with state overrides. Ganache does not — for Ganache, pre-send simulation uses a plain `eth_call` without overrides (still catches reverts and estimates gas, but cannot show hypothetical state changes).

1. Run `eth_call` (with state overrides where supported) against the local node via bridge
2. Show **Diff Preview Modal**:
   - Execution status (success/revert + reason)
   - Gas estimate
   - State changes (storage diffs with named slots from AST)
   - Decoded events
   - New contract address (for deploys)
3. User confirms → actual `eth_sendTransaction`
4. User cancels → no state change

### ABI Interaction Panel

When a deployed contract is selected, the center panel shows an ABI-driven interface:

- **Read functions (blue)**: Call buttons, results inline
- **Write functions (orange)**: Input forms, Simulate & Preview + Send buttons
- **Payable functions (red)**: Same as write + value input

Color coding follows Remix's proven UX pattern.

### Type-Aware Inputs

ABI types map to appropriate input components:
- `address` → address input with checksum validation
- `uint256` / `int256` → big number input with unit helpers (wei/gwei/ether)
- `bytes` / `bytes32` → hex input
- `bool` → toggle switch
- `string` → text input
- `tuple` → nested form
- `array` → dynamic add/remove items

### Deploy History

- Tracked in right sidebar under "Deployed Contracts"
- Persisted per workspace session in `WorkspaceState`
- "Load at Address" for external contracts (user provides address + ABI, or HexKit fetches from resolver)

### Transaction Results

Every sent tx appears in the Transactions tab:
- Decoded calldata
- Status (success/revert + reason)
- Gas used
- Decoded events
- "Deep Debug" button on each tx

---

## 7. Hybrid Debugging

### Two-Tier Model

**Tier 1 — Quick Trace (immediate, ~100ms)**:
- Source: Local node's `debug_traceTransaction`
- Automatic after every tx
- Shows in Console/Transactions tab:
  - Call tree (nested calls with depth)
  - Gas per call
  - Revert reason + failing line
  - Decoded events (using workspace ABIs)
  - State changes (storage diffs)

**Tier 2 — Deep Debug (EDB session, ~2-5s setup)**:
- Source: EDB engine replays tx via REVM
- Triggered by user clicking "Deep Debug" button
- Opens as center panel tab
- Full source-level debugging:
  - Stepping (step in/over/out/back)
  - Breakpoints in `.sol` files
  - Local variable inspection
  - Expression evaluator
  - Storage slot introspection
  - Opcode + hook snapshots
  - Time-travel (step backward)
- Reuses ALL existing debug components unchanged

### Quick Trace Service

```typescript
interface QuickTrace {
  txHash: string
  status: 'success' | 'revert'
  revertReason?: string
  gasUsed: bigint
  calls: CallNode[]
  events: DecodedEvent[]
  storageDiffs: StorageDiff[]
  rawTrace: StructLog[]
}
```

Call tree built from structLogs by tracking CALL/DELEGATECALL/STATICCALL/CREATE opcodes, decoded using compilation artifacts from WorkspaceState.

### Quick Trace → Deep Debug Connection

1. Tx completes → `LocalTraceService.traceTransaction(hash)` called automatically
2. Quick trace rendered in Transactions tab
3. User clicks "Deep Debug" → triggers existing two-phase flow:
   - `POST /api/edb/debug/prepare` with tx hash + local RPC as fork source
   - EDB replays against local chain state
   - Artifacts supplied from `WorkspaceState` (no Sourcify/Etherscan needed)
4. Debug tab opens in center panel with all existing debug UI

### Key Advantage: Perfect Source Mapping

Since compilation artifacts (source maps, ASTs, storage layouts) are already in WorkspaceState, EDB gets perfect source mapping for unverified local contracts. No network calls needed.

### Breakpoint-First Debugging (New Workflow)

1. User sets breakpoints in `.sol` file in editor — breakpoints are stored in `WorkspaceState.breakpoints` (persisted in IndexedDB), keyed by `sourceFile:lineNumber`
2. User sends a tx (via interact panel)
3. The `InteractionPanel` checks `WorkspaceState.breakpoints` — if any active breakpoints exist in contracts involved in the tx, it automatically triggers Deep Debug instead of quick trace
4. EDB session is prepared with breakpoint locations passed as part of the debug prepare request
5. Debug session pauses at first breakpoint hit
6. Traditional "run with breakpoints" experience

**Detection mechanism**: The `InteractionPanel` knows which contract is being called (from the ABI interaction). It checks if any breakpoints are set in that contract's source file(s). For cross-contract calls, breakpoints in any workspace `.sol` file trigger deep debug mode.

---

## 8. Chain Control Panel & Visual State Inspector

### Chain Control (Right Sidebar)

Always-visible compact controls:

- **Chain Info**: Node type, chain ID, block number, automine status, fork source
- **Quick Actions**: Mine, Snapshot, Revert, Warp Time, Reset
- **Accounts**: List with balances, active account indicator, impersonation badges
- **Deployed Contracts**: List with click-to-interact
- **Watches**: User-defined read calls that auto-refresh after every tx

### Command Palette (Cmd+K / Ctrl+K)

Quick actions for power users:

| Command | RPC Method |
|---|---|
| Mine N blocks | `evm_mine` |
| Snapshot | `evm_snapshot` |
| Revert to... | `evm_revert` |
| Warp +N seconds | `evm_increaseTime` |
| Set timestamp | `evm_setNextBlockTimestamp` |
| Set balance | `anvil_setBalance` / `hardhat_setBalance` |
| Set code | `anvil_setCode` / `hardhat_setCode` |
| Set storage | `anvil_setStorageAt` / `hardhat_setStorageAt` |
| Impersonate | `anvil_impersonateAccount` / `hardhat_impersonateAccount` |
| Reset chain | `anvil_reset` / `hardhat_reset` |

### Visual State Inspector

Opens as a center tab when clicking an account or contract:

**Tabs**: Overview, Storage, Transactions, Code

- **Overview**: Balance, nonce, code status (EOA vs contract)
- **Storage**: Named storage slots from AST (using existing `solidity-layout` utilities), with live values. Mapping entries expanded. Inline "Edit" buttons for state surgery
- **Transactions**: History of txns involving this address
- **Code**: Source code (if from workspace) or bytecode view

Inline state surgery: "Edit Balance", "Edit Nonce", "Edit Storage Slot" open inline editors that call the adapter's corresponding methods.

### Snapshot UX

- Snapshots are named (auto-generated or user-named)
- Listed in a dropdown with creation timestamp and block number
- Reverting shows confirmation with what will be rolled back

---

## 9. File Access Layer

### Architecture

```
           FileAccessService
          ┌────────────────┐
          │  openProject() │
          │  readFile()    │
          │  writeFile()   │
          │  watchFile()   │
          │  listDir()     │
          └───────┬────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
  FSAccessBackend      BridgeBackend
  (Chrome/Edge)       (All browsers)
```

### File System Access API Backend (Primary)

- `window.showDirectoryPicker()` for directory handle
- Recursive tree walk for file explorer
- Read/write via `FileSystemFileHandle`
- No native file watching (poll or re-read on focus)
- Supported: Chrome 86+, Edge 86+, Opera 72+

### Bridge Backend (Fallback)

New bridge endpoints (port 5789):

```
POST   /files/open     { path }           → { tree }
GET    /files/read      ?path=...          → { content }
POST   /files/write    { path, content }   → { ok }
WS     /files/watch    { path }            → file change events
```

- `chokidar` for file watching
- Auto-recompile triggers on `.sol` file changes
- Works in all browsers

### Selection Logic

1. Check if `window.showDirectoryPicker` exists
2. If yes → try FS Access API. If permission denied → offer bridge fallback
3. If no → check bridge reachability → use bridge
4. If neither → show setup instructions

### Project Detection

On directory open, scan for:
- `foundry.toml` → Foundry project (`src/`, `lib/`, `test/`)
- `hardhat.config.[ts|js]` → Hardhat project (`contracts/`, `node_modules/`)
- `*.sol` files only → bare Solidity (solc-js mode)

### File Tree Filtering

Show by default: `.sol`, `.json` configs, `README`
Hide behind toggle: `node_modules/`, `cache/`, `out/`, `artifacts/`

---

## 10. Integration with Existing HexKit

### Shared Infrastructure (Reused As-Is)

| Existing Module | Workspace Use |
|---|---|
| `DebugBridgeService` | Deep Debug sessions for local txns |
| `DebugContext` / debug hooks | Debug UI state management |
| Debug panels (stepping, eval, snapshots) | Center tab when debugging |
| `networkConfig.ts` | Add `LOCAL` provider mode |
| Contract resolver (Sourcify, Etherscan, Blockscout) | "Load at Address" for forked contracts |
| `solidity-layout` utilities | Storage inspector for deployed contracts |
| Monaco editor integration | File editor in workspace |
| `SimulationHistoryService` | Local tx history storage |
| shadcn/ui components | All workspace UI |

### New Modules

| Module | Responsibility |
|---|---|
| `ChainManager` | Node detection, connection, lifecycle |
| `LocalNodeAdapter` (+ 3 impls) | Unified RPC abstraction |
| `CompilationService` | Toolchain detection, compile, artifacts |
| `FileAccessService` | FS API / bridge dual-backend |
| `WorkspaceState` | Project state, deployed contracts, cache |
| `LocalTraceService` | Quick trace via `debug_traceTransaction` |
| `DiffPreviewModal` | Pre-send simulation diff UI |
| `WorkspaceLayout` | Activity rail, panels, responsive |
| `DeployPanel` | Contract deployment UI |
| `InteractionPanel` | ABI-driven read/write UI |
| `ChainControlPanel` | Right sidebar chain controls |
| `StateInspector` | Account/contract state viewer |
| `CommandPalette` | Quick actions (Cmd+K) |

### Cross-Navigation

- Workspace tx → open full Simulation Results page via deep link
- Workspace deployed contract → open in existing Contract Explorer
- Existing HexKit tools → "Open in Workspace" if local chain active
- Shared RainbowKit wallet context (connect MetaMask to local chain)

### Data Flow

```
WorkspaceState
  ├─ compilationArtifacts ──→ DebugBridgeService (artifacts for EDB)
  ├─ deployedContracts    ──→ SimulationContext (contract info)
  ├─ localRpcUrl          ──→ networkConfig (LOCAL provider)
  └─ fileHandles          ──→ Monaco editor instances
```

---

## 11. Error Handling & Edge Cases

### Node Connection

- Heartbeat every 5s via `eth_blockNumber`. 3 consecutive failures → "Disconnected" badge, queue actions, auto-reconnect
- Spawned node crash → offer "Restart Node" button
- User-managed node down → clear status, preserve state, reconnect when available

### Compilation

- Errors stream to Problems tab in real-time with clickable file:line references
- Red badge on Compile toolbar button with error count
- Non-blocking: interaction with already-deployed contracts continues during compile errors

### Transaction Failures

- Reverts show decoded reason string + quick trace in Transactions tab
- If `debug_traceTransaction` unavailable (some Ganache configs) → receipt-only with note
- Out-of-gas: show gas estimate vs gas used, suggest retry

### Fork Staleness

- Fork block number shown prominently in chain info
- Warn if fork is >100 blocks behind head: "Fork is stale — reset to sync?"

### File Permissions

- FS Access API: handle `NotAllowedError`, offer re-request or bridge fallback
- Bridge: handle `EACCES`/`ENOENT` with clear messages

---

## 12. Testing Strategy

### Unit Tests

- `LocalNodeAdapter` implementations: mock RPC responses, verify correct method mapping per backend
- `CompilationService`: mock toolchain detection, verify fallback chain
- `FileAccessService`: mock both backends, verify fallback behavior
- `WorkspaceState`: state management, artifact caching, cache invalidation

### Integration Tests

- Spin up real Anvil → test full flow: connect, compile, deploy, interact, trace, debug
- Snapshot/revert cycle
- Impersonation + state surgery
- Fork mode with cached mainnet state

### E2E Tests (Playwright)

- Open workspace → open project → compile → deploy → call function → verify
- Trigger revert → verify quick trace → Deep Debug → verify debug session
- Snapshot → modify state → revert → verify state restored

---

## 13. Critical Integration Details

### C1. Network Config Integration (`LOCAL` Provider Mode)

The existing `RpcProviderMode` union type (`'DEFAULT' | 'ALCHEMY' | 'INFURA' | 'CUSTOM'`) must be extended with a `'LOCAL'` mode. This requires:

1. Add `'LOCAL'` to `RpcProviderMode` in `src/config/networkConfig.ts`
2. Add a `LOCAL` case to `resolveRpcUrl()` that returns the workspace's local RPC URL from `WorkspaceState`
3. The existing SSRF check (`isUrlSafeFromSsrf`) already permits `localhost` and `127.0.0.1`, so no changes needed there
4. `buildDebugAnalysisOptions(chainId)` calls `getEtherscanApiKey(chainId)` — for local chains (chainId 31337), this returns `undefined`, which is acceptable since artifacts come from `WorkspaceState` instead

**Why not reuse `CUSTOM` mode?** A dedicated `LOCAL` mode lets the UI show local-specific controls (chain control panel, state inspector) and skip irrelevant logic (Etherscan key prompts, archive node checks). It also clearly signals the workspace context throughout the codebase.

### C2. Bridge Server Runtime

The existing simulator bridge (`scripts/simulator-bridge.mjs`) is a **Node.js** server that orchestrates the Rust EDB binary. All new workspace endpoints (file access, compilation, node spawning) will be added to this same Node.js bridge server. This is the correct runtime because:

- `chokidar` (file watching) is a Node.js library
- `child_process.spawn` (node spawning, local toolchain exec) is Node.js native
- The bridge already handles HTTP/SSE/WebSocket communication

No Rust changes needed for workspace features. The bridge's role expands from "EDB orchestrator" to "local dev orchestrator."

### C3. Debug Session Parameter Threading for Local Chains

When "Deep Debug" is triggered for a local tx, the `DebugBridgeService.startSession()` call must receive:

```typescript
{
  rpcUrl: WorkspaceState.localRpcUrl,       // e.g., "http://localhost:8545"
  chainId: WorkspaceState.chainId,          // e.g., 31337
  txHash: quickTrace.txHash,
  blockTag: txReceipt.blockNumber,
  // artifacts supplied inline from WorkspaceState — NOT fetched from Sourcify/Etherscan
  inlineArtifacts: WorkspaceState.compilationArtifacts,
}
```

The `WorkspaceDebugAdapter` (new) wraps `DebugBridgeService` and:
1. Reads `localRpcUrl` and `chainId` from `WorkspaceState`
2. Skips `getEtherscanApiKey()` for local chains (no remote artifact resolution needed)
3. Injects compilation artifacts from `WorkspaceState` into the debug prepare request
4. Otherwise delegates to the existing `DebugBridgeService` unchanged

### I1. react-resizable-panels v4 Sizing

All workspace panel sizes must use string `%` syntax per v4 convention:
- Activity rail: fixed `48px` via CSS `flex: 0 0 48px` (not a resizable panel)
- Left pane: `defaultSize="18%"`, `minSize="15%"`, `maxSize="25%"`
- Center panel: `defaultSize="52%"`, `minSize="40%"`
- Right sidebar: `defaultSize="30%"`, `minSize="20%"`, `maxSize="35%"`
- Bottom panel (vertical split): `defaultSize="30%"`, `minSize="15%"`
- All panels use `orientation="horizontal"` or `orientation="vertical"` (not `direction`)

The 640px minimum editor width is enforced at the application level (responsive breakpoint logic), not via `minSize` in pixels.

### I2. WorkspaceState Persistence

`WorkspaceState` uses a two-tier persistence strategy:

```typescript
interface WorkspaceState {
  // Persisted in IndexedDB (survives refresh)
  projectRoot: string
  deployedContracts: DeployedContract[]
  compilationArtifacts: Map<string, CompilationArtifact>
  transactionHistory: LocalTransaction[]
  snapshots: NamedSnapshot[]
  watches: WatchExpression[]

  // In-memory only (rebuilt on reconnect)
  connectedNode: LocalNodeAdapter | null
  localRpcUrl: string | null
  chainId: number | null
  accounts: AccountInfo[]
  fileHandles: Map<string, FileSystemFileHandle>  // FS API handles can't be serialized
  activeTab: string
  openFiles: string[]
}
```

Uses IndexedDB via a dedicated `WorkspaceStorageService` (modeled after `SimulationHistoryService`). Max 10 workspace sessions retained, oldest evicted. Compilation artifacts are stored by content hash to avoid duplication.

### I3. Debug View Embedding in Workspace

The existing `DebugWindow` component is a full-page overlay with its own `ResizablePanelGroup`. For the workspace, a new `WorkspaceDebugView` component wraps the debug internals **without** the outer overlay and top-level panel group:

- Reuses: `DebugControls`, `DebugSourceView`, `DebugStatePanel`, `ExpressionEvaluator`, all debug hooks
- Does NOT reuse: `DebugWindow`'s outer overlay layout, its own `ResizablePanelGroup`
- The workspace's center panel tab provides the container; `WorkspaceDebugView` fills it as a flex child
- `DebugProvider` context is scoped to the workspace route (not the global app root)

### I4. DebugProvider Scoping

The workspace route gets its own `DebugProvider` instance:

```tsx
// In workspace route layout
<WorkspaceSimulationProvider>
  <WorkspaceDebugProvider>
    <WorkspaceLayout />
  </WorkspaceDebugProvider>
</WorkspaceSimulationProvider>
```

`WorkspaceDebugProvider` extends the existing `DebugProvider` with workspace-specific behavior:
- Reads artifacts from `WorkspaceState` instead of `SimulationContext`
- Uses `localRpcUrl` from `WorkspaceState` for all debug bridge calls
- The global `DebugProvider` in `App.tsx` remains for the existing remote-tx workflow

### I5. Ganache Graceful Degradation

Ganache support is "best effort" — not feature-complete. When connected to Ganache:

- **Available**: Snapshot/revert, automine toggle, time travel, `debug_traceTransaction`, basic deploy/interact
- **Unavailable**: State surgery (set balance/code/storage/nonce), impersonation, reset

UI behavior when Ganache detected:
- Unavailable buttons show a disabled state with tooltip: "Not supported on Ganache"
- A banner in Chain Control panel: "Connected to Ganache — some features are limited. Consider using Anvil or Hardhat for full functionality."
- The `LocalNodeAdapter` methods throw `UnsupportedOperationError` for unavailable operations; UI catches and shows the tooltip

### I6. CORS and RPC Routing

All local node RPC calls go **through the bridge server** (via `/chain/*` endpoints), not directly from the browser:

```
Browser → Bridge (port 5789) → Local Node (port 8545)
```

This eliminates CORS issues entirely. The bridge is same-origin (or proxied via Vite). The `LocalNodeAdapter` implementations run **inside the bridge server** (Node.js), not in the browser. The browser only talks to the bridge.

This also means `ChainManager` in the browser is a thin client that sends requests to bridge endpoints, and the bridge holds the actual adapter instances.

### I7. File Watching Clarification

Auto-compile-on-save behavior depends on the file access backend:

| Backend | In-HexKit editor saves | External editor saves |
|---|---|---|
| FS Access API | Auto-compile (immediate, via editor save event) | Requires manual "Refresh" button or re-focus detection |
| Bridge (chokidar) | Auto-compile (immediate) | Auto-compile (chokidar detects change within ~300ms) |

The UI shows which backend is active and, for FS Access API, provides a "Sync from disk" button and an option to enable periodic polling (configurable interval, default off).

### I8. Bridge File Access Security

The bridge file access endpoints enforce:

1. **Path sandboxing**: All file operations are restricted to the opened project root. Path traversal attempts (`../`) are rejected. Resolved paths must be descendants of `projectRoot`.
2. **Session token**: On `/files/open`, the bridge generates a random session token returned to the client. All subsequent file requests must include this token in the `X-Workspace-Token` header. Token is invalidated on project close.
3. **No write to non-.sol/config files**: Write operations are restricted to `.sol`, `.json`, `.toml`, `.js`, `.ts`, and `.md` files within the project root. Binary file writes are rejected.
4. **Localhost-only binding**: The bridge server binds to `127.0.0.1` only (already the case), preventing remote access.

---

## 14. WorkspaceState Interface

```typescript
interface DeployedContract {
  name: string
  address: string
  abi: AbiItem[]
  bytecode: string
  deployTxHash: string
  deployBlock: number
  sourceFile?: string
}

interface CompilationArtifact {
  contractName: string
  abi: AbiItem[]
  bytecode: string
  deployedBytecode: string
  sourceMap: string
  deployedSourceMap: string
  ast: any
  storageLayout?: StorageLayout
  sourceFile: string
  compilerVersion: string
  contentHash: string
}

interface LocalTransaction {
  hash: string
  from: string
  to: string | null
  value: bigint
  data: string
  blockNumber: number
  status: 'success' | 'revert'
  gasUsed: bigint
  decodedCalldata?: DecodedCalldata
  events?: DecodedEvent[]
  revertReason?: string
  quickTrace?: QuickTrace
  timestamp: number
}

interface NamedSnapshot {
  id: string
  name: string
  blockNumber: number
  timestamp: number
}

interface WatchExpression {
  id: string
  contractAddress: string
  functionName: string
  args: any[]
  label: string
  lastValue?: string
}

interface AccountInfo {
  address: string
  balance: bigint
  nonce: number
  isImpersonated: boolean
  label?: string  // e.g., "Deployer", "Uniswap Router"
}
```

---

## 15. Workspace Route Integration

The `/workspace` route gets a dedicated layout branch in `App.tsx`, similar to how `isSimulationPage` gets special treatment:

```tsx
// In App.tsx routing logic
const isWorkspacePage = location.pathname.startsWith('/workspace')

if (isWorkspacePage) {
  return (
    <WorkspaceSimulationProvider>
      <WorkspaceDebugProvider>
        <WorkspaceLayout />
      </WorkspaceDebugProvider>
    </WorkspaceSimulationProvider>
  )
}
```

This bypasses the standard `Navigation` sidebar and `PersistentTools` wrapper. The workspace has its own activity rail and panel system.

### RainbowKit Local Chain Integration

When a workspace connection is established:
1. A `localChain` definition is created dynamically using viem's `defineChain()` with the local node's chain ID, RPC URL, and name
2. This chain is added to the wagmi config's chain list at runtime via `useConfig()` and `switchChain()`
3. If MetaMask is connected, prompt the user to add the local network via `wallet_addEthereumChain`
4. On workspace disconnect, the local chain is removed from the config

### Pre-Send Simulation Storage

Pre-send simulation results (diff previews) are ephemeral — shown in the modal and discarded on cancel. On confirm + send, the actual tx result is stored in `WorkspaceState.transactionHistory`. Pre-send results are NOT stored in `SimulationHistoryService` to avoid mixing local dev simulations with production tx replays.

---

## 16. New Bridge Server Endpoints

Summary of all new endpoints on the simulator bridge (port 5789):

```
# Compilation
POST   /compile              { projectRoot, toolchain, files?, solcVersion? }
GET    /compile/toolchain    → { detected, version }

# File Access
POST   /files/open           { path }
GET    /files/read            ?path=...
POST   /files/write          { path, content }
WS     /files/watch          { path }

# Node Management
POST   /node/spawn           { type, config }
POST   /node/kill
GET    /node/status

# Chain Control (proxy to local node via adapter)
POST   /chain/snapshot
POST   /chain/revert         { id }
POST   /chain/mine            { blocks? }
POST   /chain/set-balance     { address, value }
POST   /chain/set-code        { address, bytecode }
POST   /chain/set-storage     { address, slot, value }
POST   /chain/set-nonce       { address, nonce }
POST   /chain/impersonate     { address }
POST   /chain/stop-impersonate { address }
POST   /chain/increase-time   { seconds }
POST   /chain/set-timestamp   { timestamp }
POST   /chain/reset           { forking? }

# Existing (unchanged)
POST   /simulate
POST   /debug/prepare
GET    /debug/prepare/:id/events
POST   /debug/start
POST   /debug/end
POST   /debug/rpc
```
