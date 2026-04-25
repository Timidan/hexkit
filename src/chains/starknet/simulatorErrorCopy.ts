// Plain-English mappings for the bridge error codes the simulator
// client surfaces. The raw `CODE: message` string remains useful for
// power users / bug reports, so the BridgeErrorAlert component renders
// the friendly copy on top and keeps the raw line muted underneath.

import { StarknetSimulatorBridgeError } from "./simulatorClient";

export interface BridgeErrorCopy {
  title: string;
  hint: string;
}

export interface ResolvedBridgeError extends BridgeErrorCopy {
  code: string;
  message: string;
}

const BASE_COPY: Record<string, BridgeErrorCopy> = {
  UNAUTHORIZED: {
    title: "Bridge rejected the request",
    hint: "The bridge is configured to require an API key. Set VITE_STARKNET_SIM_BRIDGE_API_KEY in your .env and reload.",
  },
  TX_NOT_FOUND: {
    title: "Transaction not found",
    hint: "The bridge looked up this hash on the upstream RPC and it isn't there. Check for typos, confirm the tx actually landed on mainnet, or paste the Voyager URL again — it might be on a different network.",
  },
  BLOCK_NOT_FOUND: {
    title: "Block not found",
    hint: "The pinned block isn't reachable from the upstream RPC. Try a more recent number, or switch the pin back to Fork head.",
  },
  INVALID_TRANSACTION: {
    title: "Bridge couldn't parse the transaction",
    hint: "The request body is structurally invalid (missing field, malformed felt, wrong tx version). Recheck the form and resubmit.",
  },
  PENDING_UNSUPPORTED: {
    title: "Pending block isn't supported",
    hint: "Pin to a specific block number — the bridge replays against committed state, not the moving pending block.",
  },
  STALE_FORK: {
    title: "Bridge fork-head is stale",
    hint: "The upstream RPC moved past the bridge's resolved block. Hit Refresh on the bridge banner above and resubmit.",
  },
  STATE_UNAVAILABLE: {
    title: "Bridge can't reach the chain",
    hint: "The upstream Starknet RPC isn't responding. Check your bridge's STARKNET_RPC_URL and the provider's status page.",
  },
  RATE_LIMITED: {
    title: "Bridge rate limited",
    hint: "Slow down — the bridge or its upstream RPC is throttling requests. Wait a few seconds and retry.",
  },
  TIMEOUT: {
    title: "Bridge timed out",
    hint: "The simulation didn't finish in time. Smaller calls usually work; for heavy traces, retry once or pin to an older block.",
  },
  CLIENT_TIMEOUT: {
    title: "Request timed out",
    hint: "The browser gave up before the bridge replied. Heavy traces sometimes need a second attempt; otherwise check that the bridge is still alive in the banner above.",
  },
  NETWORK_ERROR: {
    title: "Couldn't reach the bridge",
    hint: "The fetch failed before the bridge could respond. Confirm the bridge is running on the configured port (default 5790) and reachable from the browser.",
  },
  BRIDGE_DISABLED: {
    title: "Bridge isn't configured",
    hint: "Set VITE_STARKNET_SIM_BRIDGE_URL in your .env to enable simulation.",
  },
  HTTP_ERROR: {
    title: "Bridge returned an HTTP error",
    hint: "The bridge replied with a non-2xx status without an error envelope. Check its log output for the underlying cause.",
  },
  NOT_IMPLEMENTED: {
    title: "Bridge feature isn't wired up",
    hint: "This sprint of the bridge doesn't implement the requested feature yet. Check the bridge changelog or run an older feature path.",
  },
  BLOCKIFIER_PANIC: {
    title: "Blockifier crashed during execution",
    hint: "The simulator's executor panicked. Capture the raw message and file an issue — this usually means a malformed input that slipped past validation.",
  },
  SIMULATION_FAILED: {
    title: "Transaction reverted in simulation",
    hint: "Blockifier ran the tx but it failed validation or execution. Read the bridge message for the exact reason — it's usually a nonce mismatch, a panic in __validate__, or a custom assert in the called contract.",
  },
};

/** Sub-pattern hints layered on top of SIMULATION_FAILED — these are
 *  the most common failure modes for INVOKE v3 sims, and a one-liner
 *  here saves the user from reading blockifier's verbose error. */
function refineSimulationFailed(message: string): BridgeErrorCopy | null {
  const m = message.toLowerCase();
  if (m.includes("invalid transaction nonce")) {
    return {
      title: "Nonce mismatch",
      hint: "The account's on-chain nonce no longer matches what you submitted. /estimate-fee handles this for you, but /simulate enforces strict nonce checks. Refresh the form's nonce or pin /simulate to the block you actually want to replay against.",
    };
  }
  if (m.includes("__validate__") && m.includes("invalid signature")) {
    return {
      title: "Signature didn't validate",
      hint: "The account's __validate__ rejected the signature you supplied. Either provide a real signature, or check SKIP_VALIDATE so the bridge bypasses that entrypoint.",
    };
  }
  if (m.includes("entry point") && m.includes("not found")) {
    return {
      title: "Entrypoint not on the contract",
      hint: "The selector resolved on calldata isn't an entrypoint of the target class — typically a calldata layout mismatch or wrong target address.",
    };
  }
  if (m.includes("insufficient balance")) {
    return {
      title: "Account is short on funds",
      hint: "The sender doesn't hold enough STRK / ETH to cover the resource bounds you specified. Lower the bounds or use SKIP_FEE_CHARGE if you only need to inspect execution.",
    };
  }
  return null;
}

export function resolveBridgeError(err: unknown): ResolvedBridgeError {
  let code = "UNKNOWN";
  let message = "";
  let status: number | null = null;

  if (err instanceof StarknetSimulatorBridgeError) {
    code = err.code;
    message = err.message;
    status = err.status;
  } else if (err instanceof Error) {
    message = err.message;
  } else if (typeof err === "string") {
    message = err;
  } else {
    message = String(err);
  }

  const base =
    BASE_COPY[code] ?? {
      title: "Bridge call failed",
      hint: "The bridge replied with an error code we don't recognize. The raw message below has the details.",
    };

  let copy = base;
  if (code === "SIMULATION_FAILED") {
    const refined = refineSimulationFailed(message);
    if (refined) copy = refined;
  }
  if (status === 429 && code !== "RATE_LIMITED") {
    copy = BASE_COPY.RATE_LIMITED;
  }

  return { code, message, ...copy };
}
