import React, { useMemo, useState } from 'react';
import type { Address, Hex } from 'viem';
import SafeTxInput, { type SafeTxInputState } from './SafeTxInput';
import SafeTxSummary from './SafeTxSummary';
import SignerGrid from './SignerGrid';
import MultiSendExpander from './MultiSendExpander';
import RiskBanner from './RiskBanner';
import {
  buildSafeDomain,
  computeSafeTxHash,
  normalizeSafeTx,
} from '../../utils/safe/safeTxHash';
import {
  fetchSafeInfo,
  fetchSafeTx,
  type SafeInfoResponse,
} from '../../utils/safe/txServiceClient';
import {
  recoverSafeSigners,
  type SafeSignatureType,
} from '../../utils/safe/recoverSigners';
import { decodeMultiSendFromExecData } from '../../utils/safe/multiSendDecode';
import { scoreSafeTx, summarizeLevel } from '../../utils/safe/riskScorer';
import { detectSingletonVersion } from '../../utils/safe/safeRegistry';
import type {
  MultiSendSubCall,
  RiskSignal,
  SafeTx,
  SafeVersion,
} from '../../utils/safe/types';

type Decoded = {
  tx: SafeTx;
  computedHash: Hex;
  expectedHash: Hex | null;
  hashMatch: boolean;
  signers: Array<{ signer: Address; type: SafeSignatureType }>;
  subCalls: MultiSendSubCall[] | null;
  signals: RiskSignal[];
  version: SafeVersion;
  ownersAtExec: string[];
  threshold: number | null;
  raw: {
    safe: string;
    chainId: number;
    confirmations: Array<{ owner: string; signature: string }>;
  };
};

function concatSignatures(
  confirmations: Array<{ signature: string }>,
): Hex | null {
  if (confirmations.length === 0) return null;
  return (`0x${confirmations.map((c) => c.signature.replace(/^0x/, '')).join('')}`) as Hex;
}

function versionFromString(raw: string | undefined | null): SafeVersion {
  if (!raw) return 'unknown';
  const s = raw.toLowerCase();
  if (s.startsWith('1.4.1')) return s.includes('l2') ? '1.4.1-l2' : '1.4.1';
  if (s.startsWith('1.3.0')) return s.includes('l2') ? '1.3.0-l2' : '1.3.0-l1';
  if (s.startsWith('1.1') || s.startsWith('1.0')) return '1.0';
  return 'unknown';
}

function resolveVersion(info: SafeInfoResponse | null): {
  version: SafeVersion;
  assumed: boolean;
} {
  const detected = info?.masterCopy ? detectSingletonVersion(info.masterCopy) : 'unknown';
  if (detected !== 'unknown') return { version: detected, assumed: false };
  const fromString = versionFromString(info?.version ?? null);
  if (fromString !== 'unknown') return { version: fromString, assumed: false };
  // No reliable info — default to 1.3.0-l1 but flag as assumed.
  return { version: '1.3.0-l1', assumed: true };
}

async function decode(args: {
  chainId: number;
  safe: string;
  raw: Awaited<ReturnType<typeof fetchSafeTx>>;
  expectedHash: string | null;
  info: SafeInfoResponse | null;
}): Promise<Decoded> {
  const { chainId, safe, raw, expectedHash, info } = args;

  const { version, assumed } = resolveVersion(info);

  const tx = normalizeSafeTx(raw);
  const domain = buildSafeDomain({
    chainId,
    safeAddress: safe as Address,
    version,
  });

  let computed: Hex | null = null;
  let hashError: string | null = null;
  try {
    computed = computeSafeTxHash(tx, domain);
  } catch (e) {
    hashError = (e as Error).message;
  }

  const expected = (expectedHash ?? null) as Hex | null;
  const hashMatch =
    computed !== null && expected
      ? expected.toLowerCase() === computed.toLowerCase()
      : computed !== null; // computed-only: no claim to contradict

  // Only attempt signer recovery when we actually produced a canonical hash
  // AND any expected hash the caller supplied matches. Otherwise recovered
  // addresses would correspond to some other payload / wrong digest.
  const concatenated = concatSignatures(raw.confirmations);
  const signers =
    concatenated && computed !== null && hashMatch
      ? await recoverSafeSigners({
          safeTxHash: computed,
          signatures: concatenated,
        })
      : [];

  let subCalls: MultiSendSubCall[] | null = null;
  let subCallsError: string | null = null;
  try {
    subCalls = decodeMultiSendFromExecData(tx.data);
  } catch (e) {
    subCallsError = (e as Error).message;
    subCalls = null;
  }

  const ownerSet = info
    ? new Set(info.owners.map((a) => a.toLowerCase()))
    : undefined;

  const signals = scoreSafeTx({
    tx,
    subCalls,
    masterCopy: info?.masterCopy,
    claimedVersion: version,
    safeAddress: safe,
    threshold: info?.threshold,
    ownerSet,
    hashMatch,
    recoveredSigners: signers,
  });

  if (hashError) {
    signals.unshift({
      level: 'danger',
      code: 'LEGACY_VERSION_UNSUPPORTED',
      message: `Cannot compute canonical safeTxHash: ${hashError}`,
    });
  }
  if (assumed) {
    signals.unshift({
      level: 'warn',
      code: 'VERSION_ASSUMED',
      message: `Safe version could not be determined (masterCopy not canonical); assumed ${version}. Cross-check before trusting the hash.`,
    });
  }
  if (subCallsError) {
    signals.unshift({
      level: 'danger',
      code: 'MULTISEND_DECODE_FAILED',
      message: `MultiSend decode failed: ${subCallsError}. Do NOT execute without a manual review of the calldata.`,
    });
  }

  return {
    tx,
    computedHash: (computed ?? '0x') as Hex,
    expectedHash: expected,
    hashMatch,
    signers,
    subCalls,
    signals,
    version,
    ownersAtExec: info?.owners ?? [],
    threshold: info?.threshold ?? null,
    raw: {
      safe,
      chainId,
      confirmations: raw.confirmations.map((c) => ({
        owner: c.owner,
        signature: c.signature,
      })),
    },
  };
}

export const SafeVerifierPage: React.FC = () => {
  const [state, setState] = useState<SafeTxInputState>({
    mode: 'hash',
    chainId: 1,
    safe: '',
    safeTxHash: '',
    rawJson: '',
  });
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const level = useMemo(
    () => (decoded ? summarizeLevel(decoded.signals) : 'info'),
    [decoded],
  );

  const onFetch = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetchSafeTx({
        chainId: state.chainId,
        safeTxHash: state.safeTxHash,
        proxyBase: '/api/safe/proxy',
      });
      const safeAddr = state.safe || res.safe;
      let info: SafeInfoResponse | null = null;
      try {
        info = await fetchSafeInfo({
          chainId: state.chainId,
          safeAddress: safeAddr,
          proxyBase: '/api/safe/proxy',
        });
      } catch {
        info = null;
      }
      const out = await decode({
        chainId: state.chainId,
        safe: safeAddr,
        raw: res,
        expectedHash: state.safeTxHash || null,
        info,
      });
      setDecoded(out);
    } catch (e) {
      setError((e as Error).message);
      setDecoded(null);
    } finally {
      setLoading(false);
    }
  };

  const onDecodeJson = async () => {
    setError(null);
    setLoading(true);
    try {
      const parsed = JSON.parse(state.rawJson);
      // Prefer the Safe address embedded in the pasted tx-service payload —
      // otherwise a stale value in the "safe" field from hash-mode would
      // silently override and produce a meaningless hash against the wrong
      // Safe.
      const safeAddr =
        (typeof parsed.safe === 'string' && parsed.safe.length > 0
          ? parsed.safe
          : state.safe) || '';
      let info: SafeInfoResponse | null = null;
      if (safeAddr) {
        try {
          info = await fetchSafeInfo({
            chainId: state.chainId,
            safeAddress: safeAddr,
            proxyBase: '/api/safe/proxy',
          });
        } catch {
          info = null;
        }
      }
      // If the pasted JSON carries its own safeTxHash, honor it so the
      // MISMATCH banner remains meaningful. Otherwise we leave expected
      // null and report "computed only" in the summary.
      const pastedHash =
        typeof parsed.safeTxHash === 'string' && parsed.safeTxHash.length > 0
          ? (parsed.safeTxHash as string)
          : null;
      const out = await decode({
        chainId: state.chainId,
        safe: safeAddr,
        raw: parsed,
        expectedHash: pastedHash,
        info,
      });
      setDecoded(out);
    } catch (e) {
      setError((e as Error).message);
      setDecoded(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold text-zinc-100">
        Safe Multisig Transaction Verifier
      </h1>
      <SafeTxInput
        state={state}
        onChange={setState}
        onFetch={onFetch}
        onDecodeJson={onDecodeJson}
        loading={loading}
      />
      {error ? (
        <div className="rounded border border-red-900 bg-red-950/30 p-3 text-xs text-red-200">
          {error}
        </div>
      ) : null}
      {decoded ? (
        <>
          <RiskBanner level={level} signals={decoded.signals} />
          <SafeTxSummary
            tx={decoded.tx}
            expectedHash={decoded.expectedHash}
            computedHash={decoded.computedHash}
            version={decoded.version}
          />
          {decoded.hashMatch && decoded.signers.length > 0 ? (
            <SignerGrid
              rows={decoded.signers}
              ownersAtExec={decoded.ownersAtExec}
              threshold={decoded.threshold}
            />
          ) : null}
          {decoded.subCalls ? (
            <MultiSendExpander subCalls={decoded.subCalls} />
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export default SafeVerifierPage;
