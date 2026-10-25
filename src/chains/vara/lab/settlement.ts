import { createPublicClient, decodeEventLog, http, isAddress, parseAbi } from "viem";
import type { Address, Hex, Log } from "viem";
import { errorText } from "./files";

/** Public RPCs refuse reads at older blocks and keep receipts for a limited time: say that, not the RPC's raw error. */
export function settlementError(err: unknown, next = "") {
  const text = errorText(err);
  if (/archive requests|personal token/i.test(text)) return `The public Ethereum RPC only serves recent blocks, so this older read could not run.${next}`;
  if (/receipt with hash .* could not be found/i.test(text)) return "The public Ethereum RPC returned no receipt for this transaction. It may be older than the history the RPC keeps.";
  return text;
}

// Gear IMirror.sol: request ids and Reply.replyTo, never temporal proximity, join the stages.
export const MIRROR_ABI = parseAbi([
  "event MessageQueueingRequested(bytes32 id, address indexed source, bytes payload, uint128 value, bool callReply)",
  "event Reply(bytes payload, uint128 value, bytes32 replyTo, bytes4 indexed replyCode)",
  "event ReplyCallFailed(uint128 value, bytes32 replyTo, bytes4 indexed replyCode)",
  "event StateChanged(bytes32 stateHash)",
  "function stateHash() view returns (bytes32)",
  "function exited() view returns (bool)",
]);
export const ETH_NETWORKS = { hoodi: { name: "Hoodi", chainId: 560048, rpc: "https://ethereum-hoodi-rpc.publicnode.com" }, mainnet: { name: "Ethereum", chainId: 1, rpc: "https://ethereum-rpc.publicnode.com" } };
export interface SettlementInput { network: keyof typeof ETH_NETWORKS; transaction: string; settlementTransaction: string; message: string; mirror: string; from: string; to: string; validator: string }
export function mirrorEvent(log: Pick<Log, "topics" | "data">) {
  try { return decodeEventLog({ abi: MIRROR_ABI, data: log.data, topics: log.topics }); } catch { return null; }
}
export function isReplyFor(log: Pick<Log, "topics" | "data">, message: string) {
  const decoded = mirrorEvent(log);
  return decoded?.eventName === "Reply" && decoded.args.replyTo.toLowerCase() === message.toLowerCase();
}

export async function inspectSettlement(input: SettlementInput, signal: AbortSignal) {
  const network = ETH_NETWORKS[input.network];
  if (!network) throw new Error("Choose a supported Ethereum network");
  const client = createPublicClient({ transport: http(network.rpc, { retryCount: 0, timeout: 20_000, fetchOptions: { signal } }) });
  if (await client.getChainId() !== network.chainId) throw new Error("RPC chain id does not match the selected network");
  const hash = (value: string) => /^0x[\da-f]{64}$/i.test(value);
  if (input.transaction && !hash(input.transaction)) throw new Error("Request transaction must be a 32-byte hash");
  if (input.settlementTransaction && !hash(input.settlementTransaction)) throw new Error("Settlement transaction must be a 32-byte hash");
  if (input.message && !hash(input.message)) throw new Error("Message id must be 32-byte hex");
  if (!input.transaction && (!input.message || !isAddress(input.mirror) || !/^\d+$/.test(input.from))) throw new Error("Supply a request transaction, or a message id, Mirror address, and starting block");
  if (input.mirror && !isAddress(input.mirror)) throw new Error("Mirror must be an Ethereum address");
  let mirror = input.mirror as Address, message = input.message as Hex, requestBlock: bigint | null = null;
  let request: unknown = null;
  if (input.transaction) {
    const receipt = await client.getTransactionReceipt({ hash: input.transaction as Hex });
    if (receipt.status === "reverted") throw new Error("The Ethereum request transaction reverted; it did not queue a message");
    const candidates = receipt.logs.flatMap((log) => { const decoded = mirrorEvent(log); return decoded?.eventName === "MessageQueueingRequested" ? [{ mirror: log.address, ...decoded.args, transactionHash: log.transactionHash, block: log.blockNumber, blockHash: log.blockHash }] : []; });
    const matches = candidates.filter((c) => (!message || c.id.toLowerCase() === message.toLowerCase()) && (!mirror || c.mirror.toLowerCase() === mirror.toLowerCase()));
    if (matches.length !== 1) throw new Error(matches.length ? `This transaction queued ${matches.length} matching messages; specify the message id. Candidates: ${matches.map((c) => c.id).join(", ")}` : "No matching MessageQueueingRequested log in this receipt. Check the network, Mirror, message id, and contract ABI version.");
    request = matches[0]; mirror = matches[0].mirror; message = matches[0].id; requestBlock = receipt.blockNumber;
  }
  const head = await client.getBlockNumber();
  if ((input.from && !/^\d+$/.test(input.from)) || (input.to && !/^\d+$/.test(input.to))) throw new Error("Block bounds must be integers");
  const from = input.from ? BigInt(input.from) : requestBlock!;
  let to = input.to ? BigInt(input.to) : head < from + 4999n ? head : from + 4999n;
  if (!input.settlementTransaction && (to < from || from < 0n || to > head || to - from >= 5000n)) throw new Error(`Choose 1–5,000 blocks, ending at or before head ${head}`);
  if (requestBlock !== null && from < requestBlock) throw new Error("Start the search at or after the request block");
  const replies: { transactionHash: Hex | null; block: bigint | null; blockHash: Hex | null; payload: Hex; value: bigint; replyTo: Hex; replyCode: Hex }[] = [];
  const deliveryFailures: unknown[] = [], stateChanges: unknown[] = [];
  let scanError: string | null = null, coveredThrough: bigint | null = null;
  const collect = (logs: Log[]) => {
    for (const log of logs) {
      if (log.address.toLowerCase() !== mirror.toLowerCase()) continue;
      const event = mirrorEvent(log);
      if (event?.eventName === "Reply" && event.args.replyTo.toLowerCase() === message.toLowerCase()) replies.push({ ...event.args, transactionHash: log.transactionHash, block: log.blockNumber, blockHash: log.blockHash });
      if (event?.eventName === "ReplyCallFailed" && event.args.replyTo.toLowerCase() === message.toLowerCase()) deliveryFailures.push({ ...event.args, block: log.blockNumber, transactionHash: log.transactionHash });
      if (event?.eventName === "StateChanged") stateChanges.push({ ...event.args, block: log.blockNumber, transactionHash: log.transactionHash });
    }
    if (stateChanges.length > 5000 || replies.length > 100) throw new Error("Too many logs; narrow the scan window");
  };
  try {
    if (input.settlementTransaction) {
      const receipt = await client.getTransactionReceipt({ hash: input.settlementTransaction as Hex });
      if (receipt.status === "reverted") throw new Error("The supplied settlement transaction reverted");
      if (receipt.blockNumber < from) throw new Error("The settlement transaction predates the starting block");
      to = receipt.blockNumber;
      collect(receipt.logs);
    } else {
      for (let start = from; start <= to; start += 1000n) {
        const end = start + 999n < to ? start + 999n : to;
        collect(await client.getLogs({ address: mirror, fromBlock: start, toBlock: end }));
        coveredThrough = end;
      }
    }
  } catch (err) {
    if (signal.aborted) throw err;
    scanError = settlementError(err, " Supply the known settlement transaction to read its receipt directly.");
  }
  let finalized: bigint | null = null;
  try { finalized = (await client.getBlock({ blockTag: "finalized" })).number; } catch { /* Finality may be unavailable on this provider. */ }
  let state: unknown = null, stateError: string | null = null;
  try {
    const [stateHash, exited] = await Promise.all([client.readContract({ address: mirror, abi: MIRROR_ABI, functionName: "stateHash", blockNumber: to }), client.readContract({ address: mirror, abi: MIRROR_ABI, functionName: "exited", blockNumber: to })]);
    state = { stateHash, exited, block: to };
    if (input.validator.trim()) {
      const url = new URL(input.validator);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Use a local validator HTTP endpoint (localhost or 127.0.0.1)");
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "program_readState", params: [stateHash] }), signal });
      if (!response.ok) throw new Error(`Validator HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message ?? "Validator could not read the settled state");
      if (data.result === undefined) throw new Error("Invalid validator response");
      state = { stateHash, exited, block: to, validatorState: data.result };
    }
  } catch (err) { stateError = settlementError(err); }
  return { network: network.name, chainId: network.chainId, rpc: network.rpc, mirror, message, request, from, to, head, finalized, replies, deliveryFailures, stateChanges, state, stateError, scanError, coveredThrough, settlementTransaction: input.settlementTransaction || null,
    requestStatus: request ? "Observed on Ethereum" : "Not supplied; message id only",
    executionStatus: replies.length ? "Reply observed on Ethereum" : "Not established by the scanned evidence",
    settlementStatus: replies.length ? replies.every((r) => finalized !== null && r.block !== null && r.block <= finalized) ? "Reply settled in finalized Ethereum block" : "Reply included; finality not established" : scanError ? "Evidence unavailable; settlement unknown" : input.settlementTransaction ? "No matching reply in this receipt" : "No matching reply in this range" };
}
