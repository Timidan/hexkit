# Local Vara scenario runtime

The browser sends a versioned JSON scenario to the loopback bridge. The bridge launches a fresh process that executes Gear WASM using `gtest = 2.0.0`, then returns the observed logs, balances, gas, and assertions. Messages within a run share state; separate runs do not. It does not use REVM or a remote simulator.

```sh
npm run vara:simulator
# Frontend, in another terminal:
npm run dev
```

Requires Node.js and Rust; verified with Rust 1.97.1. The initial Cargo build downloads and compiles Gear dependencies. The bridge listens only on `127.0.0.1:5791`. Default browser origins are local Vite ports 5173/5174/4173; set `HEXKIT_ORIGIN` explicitly for a trusted hosted frontend origin.

Open `/vara/transactions?tool=scenarios`. Load a bundled example or upload the program's `.wasm`. The first message initializes each program, so supply its constructor bytes before sending service messages. Adding a legacy Sails IDL or IDL v2 enables typed service payloads. The Sails example uses sails-rs 0.10.4 and legacy IDL. Local mock dependencies are explicitly marked and can reply or fail on handle; they do not execute WASM.

Supported steps: send a message, advance blocks, assert a successful reply payload, assert processing status, or assert a balance. A processing-status assertion does not establish the application outcome; use reply assertions for that. Gas reported for a block span includes other messages executed in those blocks.

An investigation handoff copies the sender, destination, and original message bytes. It still requires matching WASM, initialization, and local setup. It does not restore historical storage or the complete on-chain environment.

Limits per run: 8 programs, 32 accounts, 128 steps, 256 executed blocks, 4 MiB per WASM, 64 KiB per payload, 48 MiB JSON input, 8 MiB report, and 45 seconds in the bridge. One run executes at a time. Cancelling the browser request kills that run's process. Program limits and the gtest version can differ from a live chain runtime.

## Regression exports and checks

**Rust test** exports embedded WASM and assertions. At least one assertion is required. Put it in an integration-test file in a Rust crate with these dev dependencies:

```toml
[dev-dependencies]
gtest = "=2.0.0"
hex = "0.4"
```

Run `cargo test`. Use JSON export to preserve the editable scenario and its attached IDLs.

```sh
npm run vara:check
npm run check:chains
npm run build
```

The Rust check covers the real counter WASM's persistent state, a runtime trap, a deliberately wrong assertion, delayed communication between two real WASM programs, and an injected dependency failure. The frontend checks cover payload compatibility, input bounds, voucher eligibility, evidence status, event mapping, reply correlation, and regression export.

Example regeneration:

```sh
cargo run --manifest-path vara-simulator/Cargo.toml --example demo > public/vara/scenario.json
cargo run --manifest-path vara-simulator/Cargo.toml --example async_demo > public/vara/async-scenario.json
```
