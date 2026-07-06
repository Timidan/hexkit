import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GitDiff, CircleNotch, Copy, Check, Sparkle } from '@phosphor-icons/react';
import { getChainById } from '@/utils/chains';
import { getSharedProvider } from '@/utils/providerPool';
import { prepareBytecode, diffHexChars, type NormalizeMode, type DiffChar } from '@/utils/bytecodeDiff';
import NetworkSelector, { EXTENDED_NETWORKS, type ExtendedChain } from '@/components/shared/NetworkSelector';
import { resolveContractContext, type ContractContext } from '@/utils/resolver/contractContext';
import { useBtlExplain } from '@/lib/btl/useBtlExplain';
import BtlExplanation from '@/components/btl/BtlExplanation';
import { isAddress } from 'ethers/lib/utils';
import '@/styles/ContractDiff.css';

const LLM_MODE =
  (import.meta.env.VITE_LLM_MODE as "live" | "fixture" | "off" | undefined) ??
  "live";

// Per-side source cap: keeps the combined V1+V2 body well under the 64KB
// proxy limit even for large contracts (ABI signatures aren't capped here,
// only the raw source text).
const SOURCE_CHAR_CAP = 8_000;

function buildSourceSnippet(ctx: ContractContext): string {
  if (!ctx.metadata?.sources) return '';
  return Object.entries(ctx.metadata.sources)
    .map(([path, content]) => `// ${path}\n${content}`)
    .join('\n\n')
    .slice(0, SOURCE_CHAR_CAP);
}

interface BytecodeSide {
  address: string;
  network: ExtendedChain;
  bytecode: string;
  loading: boolean;
  error: string | null;
}

const INITIAL_SIDE: BytecodeSide = {
  address: '',
  network: EXTENDED_NETWORKS[0],
  bytecode: '',
  loading: false,
  error: null,
};

const CopyBtn: React.FC<{ text: string; label: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      title={`Copy ${label}`}
      className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check width={10} height={10} /> : <Copy width={10} height={10} />}
    </button>
  );
};

const HexDiffText: React.FC<{ chars: DiffChar[] }> = ({ chars }) => {
  // Group consecutive chars by their state to reduce DOM nodes
  const spans: { text: string; cls: string }[] = [];
  let currentCls = '';
  let currentText = '';

  for (const c of chars) {
    const cls = (c.diff || c.extra) ? 'cdiff-diff' : 'cdiff-same';
    if (cls === currentCls) {
      currentText += c.char;
    } else {
      if (currentText) spans.push({ text: currentText, cls: currentCls });
      currentCls = cls;
      currentText = c.char;
    }
  }
  if (currentText) spans.push({ text: currentText, cls: currentCls });

  return (
    <>
      {spans.map((s, i) => (
        <span key={i} className={s.cls}>{s.text}</span>
      ))}
    </>
  );
};

const ContractDiff: React.FC = () => {
  const location = useLocation();
  const [left, setLeft] = useState<BytecodeSide>({ ...INITIAL_SIDE });
  const [right, setRight] = useState<BytecodeSide>({ ...INITIAL_SIDE });
  const [normalizeMode, setNormalizeMode] = useState<NormalizeMode>('strip-solc-metadata');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const addressParam = params.get('address')?.trim();
    if (!addressParam || !isAddress(addressParam)) return;

    const chainIdParam = params.get('chainId');
    const parsedChainId = chainIdParam ? Number.parseInt(chainIdParam, 10) : Number.NaN;
    const nextNetwork =
      EXTENDED_NETWORKS.find((network) => network.id === parsedChainId) ?? INITIAL_SIDE.network;

    setLeft((prev) => {
      if (
        prev.address.toLowerCase() === addressParam.toLowerCase() &&
        prev.network.id === nextNetwork.id
      ) {
        return prev;
      }
      return {
        ...prev,
        address: addressParam,
        network: nextNetwork,
        error: null,
      };
    });
  }, [location.search]);

  const fetchBytecode = useCallback(async (
    address: string,
    network: ExtendedChain,
    setSide: React.Dispatch<React.SetStateAction<BytecodeSide>>,
  ) => {
    if (!isAddress(address)) {
      setSide(prev => ({ ...prev, error: 'Invalid address' }));
      return;
    }

    const chain = getChainById(network.id);
    if (!chain) {
      setSide(prev => ({ ...prev, error: `Chain ${network.name} not supported` }));
      return;
    }

    setSide(prev => ({ ...prev, loading: true, error: null, bytecode: '' }));

    try {
      const provider = getSharedProvider(chain);
      const code = await provider.getCode(address);
      if (!code || code === '0x') {
        throw new Error('No runtime bytecode at this address (EOA or self-destructed)');
      }
      setSide(prev => ({ ...prev, loading: false, bytecode: code }));
    } catch (e: unknown) {
      setSide(prev => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to fetch bytecode',
      }));
    }
  }, []);

  const leftPrepared = useMemo(
    () => left.bytecode ? prepareBytecode(left.bytecode, normalizeMode) : null,
    [left.bytecode, normalizeMode],
  );
  const rightPrepared = useMemo(
    () => right.bytecode ? prepareBytecode(right.bytecode, normalizeMode) : null,
    [right.bytecode, normalizeMode],
  );

  const diff = useMemo(() => {
    if (!leftPrepared || !rightPrepared) return null;
    return diffHexChars(leftPrepared.effectiveHex, rightPrepared.effectiveHex);
  }, [leftPrepared, rightPrepared]);

  const isLoading = left.loading || right.loading;
  const hasBothBytecodes = !!leftPrepared && !!rightPrepared;

  const handleCompare = () => {
    fetchBytecode(left.address, left.network, setLeft);
    fetchBytecode(right.address, right.network, setRight);
  };

  const [auditFetching, setAuditFetching] = useState(false);
  const {
    explain: explainAudit,
    text: auditText,
    meta: auditMeta,
    loading: auditExplainLoading,
    error: auditError,
  } = useBtlExplain();
  const auditLoading = auditFetching || auditExplainLoading;

  const handleAudit = useCallback(async () => {
    if (!leftPrepared || !rightPrepared || !diff) return;
    setAuditFetching(true);
    try {
      const leftChain = getChainById(left.network.id);
      const rightChain = getChainById(right.network.id);

      const [leftCtx, rightCtx] = await Promise.all([
        leftChain
          ? resolveContractContext(left.address, leftChain, { abi: true })
          : Promise.resolve(null),
        rightChain
          ? resolveContractContext(right.address, rightChain, { abi: true })
          : Promise.resolve(null),
      ]);

      const bothVerified =
        !!leftCtx?.verified && !!leftCtx.metadata?.sources &&
        !!rightCtx?.verified && !!rightCtx.metadata?.sources;

      let userText: string;
      if (bothVerified && leftCtx && rightCtx) {
        const payload = {
          sourceAvailable: true,
          v1: {
            name: leftCtx.name,
            readFunctions: leftCtx.functions.read.map((f) => f.signature),
            writeFunctions: leftCtx.functions.write.map((f) => f.signature),
            source: buildSourceSnippet(leftCtx),
          },
          v2: {
            name: rightCtx.name,
            readFunctions: rightCtx.functions.read.map((f) => f.signature),
            writeFunctions: rightCtx.functions.write.map((f) => f.signature),
            source: buildSourceSnippet(rightCtx),
          },
        };
        userText = JSON.stringify(payload).slice(0, 60_000);
      } else {
        const payload = {
          sourceAvailable: false,
          diffCount: diff.diffCount,
          v1ByteLength: leftPrepared.byteLength,
          v2ByteLength: rightPrepared.byteLength,
          v1StrippedMetadataBytes: leftPrepared.strippedMetadataBytes,
          v2StrippedMetadataBytes: rightPrepared.strippedMetadataBytes,
        };
        userText = JSON.stringify(payload);
      }

      await explainAudit(
        "You are a smart-contract upgrade auditor. Compare V1 and V2 and summarize what changed, flagging risky changes (access-control regressions, fee/param bumps, new privileged or pausable functions, changed ownership). Present the risky changes as a markdown table with columns: Risk | Evidence | Why it matters | Action. If only bytecode is available, say so and keep it structural. Always end with 'AI-assisted — verify before trusting.'",
        userText,
      );
    } finally {
      setAuditFetching(false);
    }
  }, [leftPrepared, rightPrepared, diff, left.address, left.network.id, right.address, right.network.id, explainAudit]);

  return (
    <div className="bg-background p-3 max-w-5xl mx-auto space-y-3">
      <div className="flex items-center justify-center gap-2 mb-1">
        <GitDiff width={16} height={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold">Bytecode Diff</h2>
        <span className="text-[10px] text-muted-foreground">Compare runtime bytecode</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SideInput
          side={left}
          setSide={setLeft}
          label="Contract 1"
          onFetch={() => fetchBytecode(left.address, left.network, setLeft)}
          prepared={leftPrepared}
        />
        <SideInput
          side={right}
          setSide={setRight}
          label="Contract 2"
          onFetch={() => fetchBytecode(right.address, right.network, setRight)}
          prepared={rightPrepared}
        />
      </div>

      <div className="flex justify-center">
        <Button
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={handleCompare}
          disabled={isLoading || !left.address.trim() || !right.address.trim()}
        >
          <GitDiff width={12} height={12} />
          Compare
        </Button>
      </div>

      {hasBothBytecodes && diff && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Metadata:</span>
              <button
                onClick={() => setNormalizeMode(m => m === 'raw' ? 'strip-solc-metadata' : 'raw')}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  normalizeMode === 'strip-solc-metadata'
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {normalizeMode === 'strip-solc-metadata' ? 'Stripped' : 'Included'}
              </button>
            </div>

            <Badge variant="outline" className="text-[9px] font-mono">
              {diff.diffCount === 0 ? 'Identical' : `${diff.diffCount} chars differ`}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <BytecodeStats prepared={leftPrepared!} label="Contract 1" rawBytecode={left.bytecode} />
            <BytecodeStats prepared={rightPrepared!} label="Contract 2" rawBytecode={right.bytecode} />
          </div>

          <div className="cdiff-container">
            <div className="cdiff-side-by-side">
              <div className="cdiff-panel-label">Contract 1</div>
              <div className="cdiff-panel-label">Contract 2</div>
              <div className="cdiff-panel">
                <HexDiffText chars={diff.left} />
              </div>
              <div className="cdiff-panel">
                <HexDiffText chars={diff.right} />
              </div>
            </div>
            <div className="cdiff-footer">
              <span><span className="cdiff-swatch cdiff-swatch-diff" /> different</span>
              <span><span className="cdiff-swatch cdiff-swatch-same" /> same</span>
            </div>
          </div>

          {LLM_MODE !== 'off' && (
            <div className="pt-1 space-y-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={handleAudit}
                disabled={auditLoading}
              >
                {auditLoading ? (
                  <>
                    <CircleNotch width={12} height={12} className="animate-spin" />
                    Auditing...
                  </>
                ) : (
                  <>
                    <Sparkle width={12} height={12} />
                    Audit this upgrade with AI
                  </>
                )}
              </Button>

              {(auditText || auditLoading || auditError) && (
                <BtlExplanation
                  text={auditText}
                  meta={auditMeta}
                  loading={auditLoading}
                  error={auditError}
                  title="Upgrade audit"
                />
              )}
            </div>
          )}
        </div>
      )}

      {!hasBothBytecodes && !isLoading && (
        <div className="text-center py-8 text-muted-foreground text-xs">
          Enter two contract addresses and click Compare to see bytecode differences
        </div>
      )}
    </div>
  );
};

interface SideInputProps {
  side: BytecodeSide;
  setSide: React.Dispatch<React.SetStateAction<BytecodeSide>>;
  label: string;
  onFetch: () => void;
  prepared: ReturnType<typeof prepareBytecode> | null;
}

const SideInput: React.FC<SideInputProps> = ({ side, setSide, label, onFetch, prepared }) => (
  <div className="border border-border/50 rounded-lg p-2.5 space-y-2">
    <div className="flex items-center gap-2">
      <Badge variant="outline" size="sm" className="text-[9px]">{label}</Badge>
      {prepared && (
        <span className="text-[10px] font-mono text-muted-foreground">
          {prepared.byteLength.toLocaleString()} bytes
        </span>
      )}
    </div>
    <div className="flex gap-1.5 items-center">
      <NetworkSelector
        selectedNetwork={side.network}
        onNetworkChange={(n) => setSide(prev => ({ ...prev, network: n }))}
        size="sm"
        variant="input"
        showTestnets
      />
      <Input
        value={side.address}
        onChange={(e) => setSide(prev => ({ ...prev, address: e.target.value }))}
        placeholder="0x..."
        className="font-mono h-7 text-[10px]"
        onKeyDown={(e) => { if (e.key === 'Enter') onFetch(); }}
      />
    </div>
    {side.error && <p className="text-[10px] text-destructive">{side.error}</p>}
    {side.loading && (
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <CircleNotch width={10} height={10} className="animate-spin" />
        Fetching bytecode...
      </p>
    )}
  </div>
);

interface BytecodeStatsProps {
  prepared: NonNullable<ReturnType<typeof prepareBytecode>>;
  label: string;
  rawBytecode: string;
}

const BytecodeStats: React.FC<BytecodeStatsProps> = ({ prepared, label, rawBytecode }) => (
  <div className="border border-border/30 rounded p-2 space-y-1">
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium">{label}</span>
      {prepared.strippedMetadataBytes > 0 && (
        <Badge variant="outline" className="text-[10px] font-mono">
          -{prepared.strippedMetadataBytes}b metadata
        </Badge>
      )}
    </div>
    <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
      <span>{prepared.byteLength.toLocaleString()} bytes</span>
      <span className="text-border">|</span>
      <span className="truncate max-w-[200px]" title={prepared.hash}>
        {prepared.hash.slice(0, 10)}...{prepared.hash.slice(-6)}
      </span>
      <CopyBtn text={prepared.hash} label="hash" />
    </div>
  </div>
);

export default ContractDiff;
