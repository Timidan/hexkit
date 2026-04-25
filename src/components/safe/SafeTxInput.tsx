import React from 'react';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Label } from '../ui/label';

export type SafeTxInputMode = 'hash' | 'json';

export type SafeTxInputState = {
  mode: SafeTxInputMode;
  chainId: number;
  safe: string;
  safeTxHash: string;
  rawJson: string;
};

type Props = {
  state: SafeTxInputState;
  onChange: (next: SafeTxInputState) => void;
  onFetch: () => void;
  onDecodeJson: () => void;
  loading?: boolean;
};

export const SafeTxInput: React.FC<Props> = ({
  state,
  onChange,
  onFetch,
  onDecodeJson,
  loading,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant={state.mode === 'hash' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange({ ...state, mode: 'hash' })}
        >
          By hash
        </Button>
        <Button
          variant={state.mode === 'json' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange({ ...state, mode: 'json' })}
        >
          Paste JSON
        </Button>
      </div>

      {state.mode === 'hash' ? (
        <div className="grid grid-cols-[140px_1fr] items-center gap-2">
          <Label className="text-xs text-zinc-400">chainId</Label>
          <Input
            value={String(state.chainId)}
            onChange={(e) =>
              onChange({ ...state, chainId: Number(e.target.value) || 1 })
            }
            className="font-mono text-xs"
          />
          <Label className="text-xs text-zinc-400">Safe address</Label>
          <Input
            value={state.safe}
            onChange={(e) => onChange({ ...state, safe: e.target.value })}
            placeholder="0x…"
            className="font-mono text-xs"
          />
          <Label className="text-xs text-zinc-400">safeTxHash</Label>
          <Input
            value={state.safeTxHash}
            onChange={(e) => onChange({ ...state, safeTxHash: e.target.value })}
            placeholder="0x…"
            className="font-mono text-xs"
          />
          <div />
          <div>
            <Button size="sm" onClick={onFetch} disabled={loading}>
              {loading ? 'Fetching…' : 'Fetch from tx-service'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={state.rawJson}
            onChange={(e) => onChange({ ...state, rawJson: e.target.value })}
            rows={10}
            className="font-mono text-xs"
            placeholder="Paste the tx-service /multisig-transactions/ response JSON…"
          />
          <Button size="sm" onClick={onDecodeJson} disabled={loading}>
            Decode
          </Button>
        </div>
      )}
    </div>
  );
};

export default SafeTxInput;
