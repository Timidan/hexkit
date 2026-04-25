import type { Address } from 'viem';
import type {
  MultiSendSubCall,
  RiskSignal,
  SafeTx,
  SafeVersion,
} from './types';
import {
  DRAINER_REGISTRY,
  MULTISEND_ADDRESSES,
  allKnownSingletons,
  detectSingletonVersion,
  isApprovedMultiSend,
} from './safeRegistry';
import type { SafeSignatureType } from './recoverSigners';

export interface ScoreInput {
  tx: SafeTx;
  subCalls?: MultiSendSubCall[] | null;
  /** Master copy / singleton reported for the Safe, if known. */
  masterCopy?: string;
  /** Safe proxy address — used to suppress self-refund false positives. */
  safeAddress?: string;
  /** Threshold at execution (if known). */
  threshold?: number;
  /** On-chain owners at the nonce this tx will execute at (lower-cased). */
  ownerSet?: ReadonlySet<string>;
  /** Addresses known to be verified (Etherscan/Sourcify) — lower-cased. */
  verifiedContracts?: ReadonlySet<string>;
  drainerRegistry?: ReadonlySet<string>;
  /** Version claimed by the caller (used to flag domain mismatch). */
  claimedVersion?: SafeVersion;
  /** Did computeSafeTxHash match the hash provided by the tx-service? */
  hashMatch?: boolean;
  /** Recovered signer rows from splitConcatenatedSignatures. */
  recoveredSigners?: Array<{ signer: Address; type: SafeSignatureType }>;
}

const ZERO = '0x0000000000000000000000000000000000000000';

function eq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function scoreSafeTx(input: ScoreInput): RiskSignal[] {
  const { tx, subCalls } = input;
  const signals: RiskSignal[] = [];
  const registry = input.drainerRegistry ?? DRAINER_REGISTRY;

  if (input.hashMatch === false) {
    signals.push({
      level: 'danger',
      code: 'HASH_MISMATCH',
      message:
        'computed safeTxHash does not match the hash supplied by the tx-service — recovered signers belong to a different payload and cannot be trusted.',
    });
  }

  if (tx.operation === 1) {
    if (!isApprovedMultiSend(tx.to, { allowUnsafe: false })) {
      signals.push({
        level: 'danger',
        code: 'DELEGATECALL_TO_UNAPPROVED',
        message: `DELEGATECALL target ${tx.to} is not on the MultiSendCallOnly allowlist — this executes arbitrary code with the Safe's storage.`,
        field: 'to',
      });
    } else {
      signals.push({
        level: 'info',
        code: 'DELEGATECALL_MULTISEND_CALLONLY',
        message: `DELEGATECALL target ${tx.to} is a known MultiSendCallOnly.`,
        field: 'to',
      });
    }
  }

  if (tx.gasToken !== ZERO) {
    signals.push({
      level: 'warn',
      code: 'GASTOKEN_NONZERO',
      message: `Non-zero gasToken (${tx.gasToken}) — refund will be paid in this token; verify supply.`,
      field: 'gasToken',
    });
  }

  const refund = tx.refundReceiver;
  if (
    refund !== ZERO &&
    (!input.safeAddress || !eq(refund, input.safeAddress))
  ) {
    signals.push({
      level: 'warn',
      code: 'REFUND_RECEIVER_REDIRECT',
      message: `refundReceiver ${refund} is not zero and is not the Safe itself — gas refund will be redirected.`,
      field: 'refundReceiver',
    });
  }

  const tAddr = tx.to.toLowerCase();
  if (registry.has(tAddr)) {
    signals.push({
      level: 'danger',
      code: 'TARGET_IN_DRAINER_REGISTRY',
      message: `Target ${tx.to} is in the drainer registry.`,
      field: 'to',
    });
  }
  if (input.verifiedContracts && !input.verifiedContracts.has(tAddr)) {
    signals.push({
      level: 'warn',
      code: 'TARGET_UNVERIFIED',
      message: `Target ${tx.to} is not in the verified-contract allowlist.`,
      field: 'to',
    });
  }

  if (subCalls) {
    subCalls.forEach((sc, i) => {
      if (sc.operation === 1) {
        signals.push({
          level: 'danger',
          code: 'MULTISEND_INNER_DELEGATECALL',
          message: `MultiSend sub-call #${i} uses DELEGATECALL — only possible via the legacy (unsafe) MultiSend.`,
          field: `subCall[${i}].operation`,
        });
      }
      const subAddr = sc.to.toLowerCase();
      if (registry.has(subAddr)) {
        signals.push({
          level: 'danger',
          code: 'SUBCALL_IN_DRAINER_REGISTRY',
          message: `MultiSend sub-call #${i} targets drainer ${sc.to}.`,
          field: `subCall[${i}].to`,
        });
      }
      if (input.verifiedContracts && !input.verifiedContracts.has(subAddr)) {
        signals.push({
          level: 'warn',
          code: 'SUBCALL_UNVERIFIED',
          message: `MultiSend sub-call #${i} targets unverified contract ${sc.to}.`,
          field: `subCall[${i}].to`,
        });
      }
      // Nested MultiSend — same selector routed through a sub-call.
      if (
        MULTISEND_ADDRESSES.some((m) => eq(m, sc.to)) &&
        sc.data.toLowerCase().startsWith('0x8d80ff0a')
      ) {
        signals.push({
          level: 'warn',
          code: 'NESTED_MULTISEND',
          message: `MultiSend sub-call #${i} itself invokes MultiSend — nested batches are not decoded; inspect calldata manually.`,
          field: `subCall[${i}].data`,
        });
      }
    });
  }

  if (input.masterCopy) {
    const detected = detectSingletonVersion(input.masterCopy);
    if (detected === 'unknown') {
      signals.push({
        level: 'danger',
        code: 'UNKNOWN_SINGLETON',
        message: `Safe masterCopy ${input.masterCopy} is not a canonical Safe singleton. Expected one of: ${allKnownSingletons().join(', ')}.`,
      });
    } else if (input.claimedVersion && input.claimedVersion !== detected) {
      signals.push({
        level: 'warn',
        code: 'SINGLETON_VERSION_MISMATCH',
        message: `Caller assumed version ${input.claimedVersion} but masterCopy resolves to ${detected}. safeTxHash may not match.`,
      });
    }
  }

  // Signer-level checks: duplicates, ordering, non-owner, untrusted sig types.
  const rows = input.recoveredSigners ?? [];
  const seen = new Set<string>();
  let prev: string | null = null;
  let verifiedCount = 0;
  let unverifiedCount = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const addr = row.signer.toLowerCase();
    if (seen.has(addr)) {
      signals.push({
        level: 'danger',
        code: 'DUPLICATE_SIGNER',
        message: `Signer ${row.signer} appears more than once — Safe.checkSignatures would revert.`,
        field: `signer[${i}]`,
      });
    }
    seen.add(addr);
    if (prev !== null && BigInt(addr) <= BigInt(prev)) {
      signals.push({
        level: 'danger',
        code: 'SIGNERS_NOT_ASCENDING',
        message: `Signer ${row.signer} breaks strict-ascending owner order required by Safe.`,
        field: `signer[${i}]`,
      });
    }
    prev = addr;
    if (input.ownerSet && !input.ownerSet.has(addr)) {
      signals.push({
        level: 'danger',
        code: 'SIGNER_NOT_OWNER',
        message: `Signer ${row.signer} is not an owner at nonce ${tx.nonce.toString()}.`,
        field: `signer[${i}]`,
      });
    }
    if (row.type === 'contract') {
      signals.push({
        level: 'warn',
        code: 'UNVERIFIED_CONTRACT_SIGNATURE',
        message: `Contract signature claimed by ${row.signer} — we cannot verify EIP-1271 without an RPC call; treat as unverified.`,
        field: `signer[${i}]`,
      });
      unverifiedCount += 1;
    } else if (row.type === 'approved_hash') {
      signals.push({
        level: 'warn',
        code: 'UNVERIFIED_APPROVED_HASH',
        message: `Pre-approved-hash signature for ${row.signer} — we cannot verify approvedHashes without RPC; treat as unverified.`,
        field: `signer[${i}]`,
      });
      unverifiedCount += 1;
    } else {
      if (row.type === 'eth_sign') {
        signals.push({
          level: 'warn',
          code: 'ETH_SIGN_SIGNATURE',
          message: `eth_sign-style signature from ${row.signer} — legacy flow; confirm this signer intended to use eth_sign.`,
          field: `signer[${i}]`,
        });
      }
      verifiedCount += 1;
    }
  }

  // Threshold check runs unconditionally when threshold is known — zero signers
  // against a threshold of N is the whole point of this signal.
  if (typeof input.threshold === 'number') {
    const totalClaimed = rows.length;
    if (totalClaimed < input.threshold) {
      signals.push({
        level: 'danger',
        code: 'THRESHOLD_NOT_MET',
        message: `Got ${totalClaimed} signatures but Safe threshold is ${input.threshold}.`,
      });
    } else if (verifiedCount < input.threshold) {
      // Claim-count is enough but only because of unverified contract /
      // approved-hash rows — execution would revert unless EIP-1271 /
      // approvedHashes actually hold on-chain.
      signals.push({
        level: 'danger',
        code: 'THRESHOLD_DEPENDS_ON_UNVERIFIED',
        message: `Verified signatures (${verifiedCount}) are below threshold ${input.threshold}; the remaining ${unverifiedCount} rows are contract/approved-hash entries we could not verify off-chain.`,
      });
    }
  }

  return signals;
}

export function summarizeLevel(signals: RiskSignal[]): 'info' | 'warn' | 'danger' {
  let worst: 'info' | 'warn' | 'danger' = 'info';
  for (const s of signals) {
    if (s.level === 'danger') return 'danger';
    if (s.level === 'warn') worst = 'warn';
  }
  return worst;
}
