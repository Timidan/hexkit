// scripts/smoke-heimdall.mjs
//
// Manual smoke test. Requires:
//   1. Bridge running: `npm run simulator:server`
//   2. heimdall binary on PATH (`heimdall --version` works)
//   3. The bridge has a server-side RPC allowlist entry for chain 1
//      (default mainnet URL is cloudflare-eth.com; override with
//      HEIMDALL_RPC_BY_CHAIN env).
//
// The client never sends rpcUrl — chainId only. The bridge resolves RPC
// server-side and computes the bytecode hash itself from eth_getCode.
//
// Usage:
//   EDB_API_KEY=... node scripts/smoke-heimdall.mjs

const BRIDGE = process.env.BRIDGE_URL || "http://127.0.0.1:5789";
const API_KEY = process.env.EDB_API_KEY || "";

const headers = { "Content-Type": "application/json" };
if (API_KEY) headers["X-API-Key"] = API_KEY;

async function call(path, body) {
  const res = await fetch(`${BRIDGE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text };
}

console.log("1) /heimdall/version");
console.log(await call("/heimdall/version", {}));

const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
console.log("\n2) /heimdall/decompile (USDT via address+chainId)");
const dec = await call("/heimdall/decompile", {
  address: USDT,
  chainId: 1,
});
const decBody = dec.body ? JSON.parse(dec.body) : {};
console.log({ status: dec.status, sourcePreview: decBody.source?.slice(0, 120) });

console.log("\n3) /heimdall/dump (USDT at block latest)");
const dump = await call("/heimdall/dump", {
  address: USDT,
  chainId: 1,
});
const dumpBody = dump.body ? JSON.parse(dump.body) : {};
console.log({ status: dump.status, slotCount: dumpBody.slots?.length });
