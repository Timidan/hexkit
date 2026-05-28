// LI.FI Escrow needs nonce uniqueness per (user, originChainId), not
// monotonicity. Layout `(ts << 48) | (rand32 << 16) | counter16` keeps
// same-millisecond collisions across tabs at ~1/2^32.

let counter = 0;

const RAND_BITS = 32n;
const COUNTER_BITS = 16n;

export function nextOrderNonce(): bigint {
  counter = (counter + 1) & 0xffff;
  const ts = BigInt(Date.now());
  const rand = BigInt(Math.floor(Math.random() * 0xffffffff));
  return (ts << (RAND_BITS + COUNTER_BITS)) | (rand << COUNTER_BITS) | BigInt(counter);
}
