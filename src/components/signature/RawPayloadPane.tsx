import React, { useMemo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Button } from '../ui/button';
import type { TypedDataPayload } from '../../utils/signature/types';
import { computeHash } from '../../utils/signature/hashAndVerify';

export const RawPayloadPane: React.FC<{ payload: TypedDataPayload }> = ({
  payload,
}) => {
  const pretty = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const hash = useMemo(() => {
    try {
      return computeHash(payload);
    } catch (e) {
      return `Unable to hash: ${(e as Error).message}`;
    }
  }, [payload]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <Tabs.Root defaultValue="json">
      <Tabs.List className="mb-2 flex gap-2 border-b border-zinc-800">
        <Tabs.Trigger
          value="json"
          className="px-3 py-1 text-xs text-zinc-400 data-[state=active]:text-emerald-400"
        >
          JSON
        </Tabs.Trigger>
        <Tabs.Trigger
          value="hash"
          className="px-3 py-1 text-xs text-zinc-400 data-[state=active]:text-emerald-400"
        >
          Hash
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="json">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => copy(pretty)}>
            Copy JSON
          </Button>
        </div>
        <pre className="mt-2 max-h-96 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-200">
          {pretty}
        </pre>
      </Tabs.Content>
      <Tabs.Content value="hash">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs break-all text-zinc-200">
            {hash}
          </span>
          <Button variant="outline" size="sm" onClick={() => copy(hash)}>
            Copy
          </Button>
        </div>
      </Tabs.Content>
    </Tabs.Root>
  );
};

export default RawPayloadPane;
