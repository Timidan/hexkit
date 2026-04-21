# `fhe/` — TxCaptain CoFHE toolchain

Isolated Hardhat workspace for the encrypted-triage contracts (`HackTriage`, `RiskThrottle`). Runs against **real Ethereum Sepolia** — no mocks.

## One-time setup

```bash
cd fhe
pnpm install
cp .env.example .env    # already created; fill in the values below
```

Edit `fhe/.env`:

- `DEPLOYER_PRIVATE_KEY` — 0x-prefixed private key of a wallet funded with Ethereum Sepolia ETH.
- `ETH_SEPOLIA_RPC_URL` — optional custom RPC (Alchemy / Infura / QuickNode). Defaults to `https://ethereum-sepolia.publicnode.com`, which is rate-limited.
- `ETHERSCAN_API_KEY` — optional, only needed for `hardhat verify`.

## Common commands

```bash
pnpm compile                  # hardhat compile → artifacts/
pnpm test                     # hardhat test --network sepolia (real testnet txs)
pnpm deploy:triage            # deploy HackTriage, write address to deployments/sepolia.json
pnpm deploy:throttle          # deploy RiskThrottle (reads HackTriage address from deployments)
```

## Why real testnet (no mocks)

CoFHE encrypted-value semantics only run end-to-end against the live coprocessor on Ethereum Sepolia. Local mocks (`@cofhe/mock-contracts`) don't exercise the permit system or async decryption timing. The Wave 3 submission requires a deployed demo anyway, so we bake that into the test loop.

Each `pnpm test` run costs a few cents of Sepolia ETH per contract deployment + triage call.

## Artifacts → Vite app

Compiled ABIs land in `fhe/artifacts/contracts/<Name>.sol/<Name>.json`. The Vite app imports them from there (Task 33e wires this up explicitly).
