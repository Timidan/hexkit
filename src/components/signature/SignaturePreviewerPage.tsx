import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useChainId } from 'wagmi';
import type { Address, Hex } from 'viem';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import PayloadInput from './PayloadInput';
import RiskBanner from './RiskBanner';
import SummaryCard from './SummaryCard';
import FieldTable from './FieldTable';
import RawPayloadPane from './RawPayloadPane';
import { renderForKind } from './renderForKind';
import { parsePayload, type ParseResult } from '../../utils/signature/parse';
import {
  decodePayloadFromLink,
  encodePayloadToLink,
} from '../../utils/signature/encodeLink';
import { classify } from '../../utils/signature/classify';
import {
  scoreSignals,
  summarizeLevel,
} from '../../utils/signature/riskScorer';
import { recoverSigner } from '../../utils/signature/hashAndVerify';
import type { TypedDataPayload } from '../../utils/signature/types';

export const SignaturePreviewerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const connectedChainId = useChainId();
  const [raw, setRaw] = useState<string>('');
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [signature, setSignature] = useState<string>('');
  const [recovered, setRecovered] = useState<Address | null>(null);
  const [recoverError, setRecoverError] = useState<string | null>(null);

  useEffect(() => {
    const data = searchParams.get('data');
    if (!data) return;
    try {
      const raw = decodePayloadFromLink(data);
      const text = JSON.stringify(raw, null, 2);
      setRaw(text);
      // Re-run the same validator as manual pastes so malformed links can't
      // slip through into the renderer.
      setParse(parsePayload(text));
    } catch (e) {
      setParse({
        ok: false,
        code: 'BAD_LINK',
        error: `Could not decode ?data= parameter: ${(e as Error).message}`,
      });
    }
  }, [searchParams]);

  const payload: TypedDataPayload | null = parse?.ok ? parse.payload : null;

  const classified = useMemo(
    () => (payload ? classify(payload) : null),
    [payload],
  );
  const render = useMemo(
    () =>
      classified
        ? renderForKind(classified, {
            chainId:
              typeof classified.payload.domain.chainId === 'number'
                ? classified.payload.domain.chainId
                : Number(classified.payload.domain.chainId ?? 1),
          })
        : null,
    [classified],
  );
  const signals = useMemo(
    () =>
      classified && render
        ? scoreSignals(classified, render, {
            connectedChainId:
              typeof connectedChainId === 'number' ? connectedChainId : undefined,
          })
        : [],
    [classified, render, connectedChainId],
  );
  const level = useMemo(() => summarizeLevel(signals), [signals]);

  const share = async () => {
    if (!payload) return;
    const link = encodePayloadToLink(payload);
    const url = `${window.location.origin}/database/preview?data=${link}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  };

  const verify = async () => {
    if (!payload || !signature) return;
    setRecovered(null);
    setRecoverError(null);
    try {
      const addr = await recoverSigner(payload, signature as Hex);
      setRecovered(addr);
    } catch (e) {
      setRecoverError((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">
          Signature Previewer
        </h1>
        {payload ? (
          <Button variant="outline" size="sm" onClick={share}>
            Share link
          </Button>
        ) : null}
      </div>

      <PayloadInput
        value={raw}
        onChange={setRaw}
        onParsed={(r) => {
          setParse(r);
          setRecovered(null);
          setRecoverError(null);
        }}
      />

      {parse && !parse.ok ? (
        <div className="rounded border border-red-900 bg-red-950/30 p-3 text-xs text-red-200">
          <span className="font-mono">{parse.code}</span> — {parse.error}
        </div>
      ) : null}

      {render && classified ? (
        <>
          <RiskBanner level={level} signals={signals} />
          <SummaryCard title={render.title} summary={render.summary} />
          <FieldTable
            rows={render.rows}
            chainId={
              typeof classified.payload.domain.chainId === 'number'
                ? classified.payload.domain.chainId
                : undefined
            }
          />
          <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
            <div className="mb-2 text-xs text-zinc-400">
              Verify signature (optional)
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="0x…"
                className="font-mono text-xs"
              />
              <Button variant="outline" size="sm" onClick={verify}>
                Recover
              </Button>
            </div>
            {recovered ? (
              <div className="mt-2 text-xs text-emerald-300">
                Recovered: <span className="font-mono">{recovered}</span>
              </div>
            ) : null}
            {recoverError ? (
              <div className="mt-2 text-xs text-red-300">{recoverError}</div>
            ) : null}
          </div>
          <RawPayloadPane payload={classified.payload} />
        </>
      ) : null}
    </div>
  );
};

export default SignaturePreviewerPage;
