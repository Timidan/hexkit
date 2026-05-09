# HexKit

HexKit is a browser-based web3 developer toolkit for decoding calldata, building transactions, simulating EVM and Starknet calls, inspecting contract source, debugging traces, and managing DeFi yield.

The production app is a Vite/React frontend deployed on Vercel. Server-side API routes proxy external services and optional simulator bridges so browser clients do not need direct access to private keys, API keys, or bridge credentials.

## Core Features

- EVM transaction utilities: calldata decoding, ABI encoding, wallet-backed reads/writes, and local EDB simulation.
- Starknet transaction utilities: invoke builder, trace replay, simulation history, state diffs, token flows, events, L2 to L1 messages, and class/source inspection.
- Contract source tools: Sourcify, Etherscan-compatible explorer, Blockscout, and Starknet class/source lookup.
- Debugging views: call trees, stack traces, source panels, trace rows, breakpoints, and snapshot-backed evaluation.
- Signature database: selector/topic lookup, cached signatures, and custom signature management.
- LI.FI Earn integration: vault discovery, portfolio positions, deposit/withdraw flows, and yield recommendations.
- Vercel API proxies: EDB bridge, Starknet simulator bridge, LI.FI Composer/Earn, Gemini recommendations, and Etherscan-family explorer requests.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v4, shadcn/ui primitives |
| EVM | ethers v5, viem, wagmi, RainbowKit |
| Starknet | starknet.js, Cartridge controller, Starkzap |
| Editor/debug UI | Monaco, React Router, Framer Motion |
| APIs | Vercel Serverless Functions |
| Testing and quality | Vitest, ESLint, TypeScript project build |

## Local Development

Use Node.js 22. The Starknet runtime dependencies require Node 22+, and Vercel should be configured to build with the same major version.

Install dependencies:

```bash
npm install
```

Start only the Vite app:

```bash
npm run dev
```

Start Vite plus the local EDB and Starknet simulator bridges:

```bash
npm run dev:full
```

Build the production bundle:

```bash
npm run build
```

Run quality checks:

```bash
npm run lint
npm run test:run
```

## Vercel Configuration

Client-side variables must be prefixed with `VITE_`. Server-side secrets are read only by `api/*` routes and should be configured in the Vercel dashboard.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_WALLETCONNECT_PROJECT_ID` | Client | WalletConnect project ID for EVM wallet connections |
| `VITE_SIMULATOR_BRIDGE_URL` | Client | EDB bridge endpoint, defaults to `/api/edb` |
| `VITE_STARKNET_SIM_BRIDGE_URL` | Client | Starknet simulator endpoint, defaults to `/api/starknet-sim` |
| `EDB_BRIDGE_URL` | Server | Upstream EDB bridge URL for the Vercel proxy |
| `EDB_API_KEY` | Server | API key injected into EDB bridge requests |
| `EDB_CORS_ALLOWED_ORIGINS` | Server | Extra allowed origins for the EDB proxy |
| `STARKNET_SIM_BRIDGE_URL` | Server | Upstream Starknet simulator bridge URL |
| `STARKNET_SIM_API_KEY` | Server | API key injected into Starknet simulator requests |
| `STARKNET_SIM_CORS_ALLOWED_ORIGINS` | Server | Extra allowed origins for the Starknet simulator proxy |
| `STARKNET_SIM_RPC_ALLOWED_HOSTS` | Server | Optional RPC override host allowlist for Starknet sim requests |
| `ETHERSCAN_API_KEY` | Server | Explorer API key for Etherscan-compatible requests |
| `LIFI_API_KEY` | Server | LI.FI Earn and Composer API key |
| `GEMINI_API_KEY` | Server | Gemini key for yield recommendation routes |
| `GEMINI_MODEL` | Server | Primary Gemini model |
| `GEMINI_FALLBACK_MODEL` | Server | Fallback Gemini model |
| `PROXY_SECRET` | Server | Optional server-to-server bypass for public proxy rate/origin checks |
| `ALLOWED_ORIGINS` | Server | Comma-separated production origins for browser-called public proxies |

See `.env.example` for a copyable template.

## Project Layout

```text
api/
  edb-proxy.ts                 EDB bridge proxy for Vercel
  starknet-sim-proxy.ts        Starknet simulator bridge proxy
  lifi-composer.ts             LI.FI quote/execute proxy
  lifi-earn.ts                 LI.FI Earn proxy
  llm-recommend.ts             Gemini recommendation proxy
  explorer/etherscan.ts        Explorer proxy

src/
  chains/                      Chain capabilities, adapters, Starknet clients
  components/                  App screens and UI components
  components/starknet/         Starknet builder, history, and result routes
  components/starknet-simulation-results/ Starknet result presentation adapters
  contexts/                    Wallet, network, simulation, and debug state
  features/earn/               Cross-chain earn adapter layer
  hooks/                       Shared React hooks
  lib/                         Monaco and asset helpers
  routes/                      Family-aware route helpers
  services/                    History, trace, and bridge services
  utils/                       Decoders, resolver, simulation, layout utilities

public/
  logos/                       Favicons, app icons, and public logo assets

scripts/
  dev-full.sh                  Local multi-service dev runner
  check-family-imports.mjs     Family import boundary check
  check-inline-copy.mjs        Inline copy guard

starknet-sim/                  Starknet simulator bridge workspace
edb/                           EVM debugger workspace
```

## Production Notes

- Vercel builds with `npm run build`.
- Generated output in `dist/` is ignored and does not need to be committed.
- Local bridge build products, node_modules folders, temp output, and worktrees are ignored and should not be pushed.
- Public assets are limited to files referenced by the app shell, manifest, route UI, or social metadata.
- For Starknet simulator production, keep `VITE_STARKNET_SIM_BRIDGE_URL` unset or set to `/api/starknet-sim`, then point `STARKNET_SIM_BRIDGE_URL` at the HTTPS droplet bridge URL. If the bridge requires auth, set `STARKNET_SIM_API_KEY` in Vercel and configure the same key on the droplet bridge.
- Do not expose `PROXY_SECRET` with a `VITE_` prefix. Browser-called proxy routes use origin checks and serverless rate limits; `PROXY_SECRET` is only for trusted server-to-server calls.

## Architecture Diagrams

Tracked diagrams live in `schematics/`:

| File | Purpose |
| --- | --- |
| `schematics/hexkit-app-architecture.excalidraw` | Frontend route, provider, and data-flow map |
| `schematics/edb-system-topology.excalidraw` | Browser, bridge, and EDB engine topology |
| `schematics/edb-engine-internals.excalidraw` | EDB engine execution and snapshot internals |

## License

Private. All rights reserved.
