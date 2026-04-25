import type { ClassifiedPayload, RiskLevel, RiskSignal, SchemaRender } from './types';

export type RiskScoreContext = {
  connectedChainId?: number;
  drainerRegistry?: ReadonlySet<string>;
  verifiedContracts?: ReadonlySet<string>;
};

const LEVEL_ORDER: Record<RiskLevel, number> = {
  ok: 0,
  warn: 1,
  danger: 2,
};

function spenderFromRows(render: SchemaRender): string | null {
  const row =
    render.rows.find((r) => r.label === 'spender') ??
    render.rows.find((r) => r.annotation === 'spender');
  if (!row) return null;
  const raw = row.raw;
  return typeof raw === 'string' ? raw.toLowerCase() : null;
}

function dedupeSignals(signals: RiskSignal[]): RiskSignal[] {
  const seen = new Set<string>();
  const out: RiskSignal[] = [];
  for (const s of signals) {
    const key = `${s.code}|${s.field ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function scoreSignals(
  classified: ClassifiedPayload,
  render: SchemaRender,
  ctx: RiskScoreContext,
): RiskSignal[] {
  const extra: RiskSignal[] = [];
  const domainChainIdRaw = classified.payload.domain?.chainId;
  const domainChainId =
    typeof domainChainIdRaw === 'number'
      ? domainChainIdRaw
      : typeof domainChainIdRaw === 'string' && /^\d+$/.test(domainChainIdRaw)
        ? Number(domainChainIdRaw)
        : null;

  if (
    typeof ctx.connectedChainId === 'number' &&
    domainChainId !== null &&
    domainChainId !== ctx.connectedChainId
  ) {
    extra.push({
      level: 'danger',
      code: 'CHAIN_MISMATCH',
      message: `Signature is scoped to chainId ${domainChainId} but the wallet is connected to ${ctx.connectedChainId}.`,
      field: 'domain.chainId',
    });
  }

  const spender = spenderFromRows(render);
  if (spender && ctx.drainerRegistry?.has(spender)) {
    extra.push({
      level: 'danger',
      code: 'SPENDER_IN_DRAINER_REGISTRY',
      message: `Spender ${spender} is in the drainer registry.`,
      field: 'spender',
    });
  }
  if (spender && ctx.verifiedContracts && !ctx.verifiedContracts.has(spender)) {
    extra.push({
      level: 'warn',
      code: 'SPENDER_UNVERIFIED',
      message: `Spender ${spender} is not in the verified-contract allowlist.`,
      field: 'spender',
    });
  }

  if (
    classified.canonicalVerifyingContract &&
    classified.payload.domain?.verifyingContract &&
    classified.canonicalVerifyingContract.toLowerCase() !==
      classified.payload.domain.verifyingContract.toLowerCase()
  ) {
    extra.push({
      level: 'danger',
      code: 'VERIFYING_CONTRACT_MISMATCH',
      message: `Expected ${classified.canonicalVerifyingContract} but domain.verifyingContract is ${classified.payload.domain.verifyingContract}.`,
      field: 'domain.verifyingContract',
    });
  }

  return dedupeSignals([...render.signals, ...extra]);
}

export function summarizeLevel(signals: RiskSignal[]): RiskLevel {
  let worst: RiskLevel = 'ok';
  for (const s of signals) {
    if (LEVEL_ORDER[s.level] > LEVEL_ORDER[worst]) worst = s.level;
  }
  return worst;
}
