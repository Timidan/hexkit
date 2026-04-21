# Hack incident library

Curated EVM post-mortems used by the hack-analysis classifier and retrieval layer. Each incident is a JSON file conforming to the `Incident` schema in [`../types.ts`](../types.ts).

**Coverage:** 21 incidents, 2022-01 to 2025-02, roughly $3.36B cumulative loss.

## Incidents

| Incident | Date | Loss | Exploit classes |
|---|---|---:|---|
| [Qubit QBridge](qubit-2022-01.json) | 2022-01-27 | $80M | bridge-message-forgery, access-control-bypass |
| [Ronin bridge](ronin-2022-03.json) | 2022-03-23 | $624M | signer-compromise |
| [Inverse Finance Anchor](inverse-finance-2022-04.json) | 2022-04-02 | $15.6M | oracle-manipulation, flashloan-price-manipulation |
| [Beanstalk governance](beanstalk-2022-04.json) | 2022-04-17 | $182M | governance-takeover, flashloan-price-manipulation |
| [Rari Fuse pools](rari-fuse-2022-04.json) | 2022-04-30 | $80M | reentrancy |
| [Harmony Horizon](harmony-2022-06.json) | 2022-06-23 | $100M | signer-compromise, bridge-message-forgery |
| [Nomad bridge](nomad-2022-08.json) | 2022-08-01 | $190M | bridge-message-forgery, access-control-bypass |
| [Team Finance](team-finance-2022-10.json) | 2022-10-27 | $14.5M | access-control-bypass, math-invariant-manipulation |
| [Ankr aBNBc](ankr-2022-12.json) | 2022-12-02 | $5M | access-control-bypass |
| [Orion Protocol](orion-protocol-2023-02.json) | 2023-02-02 | $2.9M | reentrancy |
| [Platypus Finance](platypus-2023-02.json) | 2023-02-16 | $8.5M | math-invariant-manipulation, flashloan-price-manipulation |
| [Euler Finance](euler-2023-03.json) | 2023-03-13 | $197M | math-invariant-manipulation, flashloan-price-manipulation |
| [Multichain MPC](multichain-2023-07.json) | 2023-07-06 | $125M | signer-compromise |
| [Curve Vyper reentrancy](curve-vyper-2023-07.json) | 2023-07-30 | $52M | reentrancy |
| [KyberSwap Elastic](kyberswap-elastic-2023-11.json) | 2023-11-22 | $48M | math-invariant-manipulation |
| [Ledger Connect Kit](ledger-connect-2023-12.json) | 2023-12-14 | $610K | approval-drain |
| [Orbit bridge](orbit-bridge-2024-01.json) | 2024-01-01 | $81.5M | signer-compromise, bridge-message-forgery |
| [WOOFi sPMM](woofi-2024-03.json) | 2024-03-05 | $8.75M | oracle-manipulation, flashloan-price-manipulation |
| [Penpie Finance](penpie-2024-09.json) | 2024-09-03 | $27M | reentrancy, math-invariant-manipulation |
| [Radiant multisig](radiant-2024-10.json) | 2024-10-16 | $58M | signer-compromise, delegatecall-to-user-controlled |
| [Bybit cold wallet](bybit-2025-02.json) | 2025-02-21 | $1.46B | signer-compromise, delegatecall-to-user-controlled |

## What each incident carries

- `id`, `name`, `chain`, `date`, `protocol`, `amountUsd`
- `canonicalTxs`: on-chain transaction hashes for the exploit
- `exploitClasses`: canonical class labels matching the classifier
- `coreContradiction`: one-line invariant the exploit violated
- `attackSteps`: ordered steps with evidence citations
- `entities`: attacker EOAs, victim contracts, oracles, tokens (with addresses and roles)
- `fundFlow`: token transfers tying the step chain to dollar loss
- `sources`: rekt.news, CertiK, explorer links backing every claim

See [`../types.ts`](../types.ts) for the full Zod schema.

## Adding an incident

1. Create `<id>.json` in this directory matching the schema above.
2. Filename (without `.json`) must equal the `id` field.
3. Addresses must be EIP-55 checksummed.
4. Every `attackStep.sourceIds` entry must reference an `id` in `sources`.
5. Run `npm test -- hack-analysis/incidents` to validate.
