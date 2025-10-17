import React, { useMemo, useCallback, useState } from 'react';
import type { ParameterDisplayEntry } from './StackedOverview';
import { copyTextToClipboard } from '../utils/clipboard';
import '../styles/RawJsonView.css';

interface RawJsonViewProps {
  parameters: ParameterDisplayEntry[];
}

const sanitizeValue = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === 'object') {
    if ((value as any)._isBigNumber && typeof (value as any).toString === 'function') {
      try {
        return (value as any).toString();
      } catch {
        return String(value);
      }
    }

    if (value instanceof Uint8Array) {
      return `0x${Array.from(value)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')}`;
    }

    const entries = Object.entries(value as Record<string, any>).map(([key, val]) => [
      key,
      sanitizeValue(val)
    ]);
    return Object.fromEntries(entries);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return value;
};

const RawJsonView: React.FC<RawJsonViewProps> = ({ parameters }) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const payload = useMemo(() => {
    if (!parameters.length) {
      return null;
    }

    const record: Record<string, any> = {};

    parameters.forEach((param, index) => {
      const key = param.name && param.name.length ? param.name : `param_${index}`;
      record[key] = sanitizeValue(param.value);
    });

    return record;
  }, [parameters]);

  const formattedJson = useMemo(() => {
    if (payload === null) {
      return '{\n  "message": "No decoded parameters available"\n}';
    }
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return JSON.stringify({ error: 'Unable to format decoded payload' }, null, 2);
    }
  }, [payload]);

  const handleCopy = useCallback(async () => {
    try {
      await copyTextToClipboard(formattedJson);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2400);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2400);
    }
  }, [formattedJson]);

  return (
    <section className="raw-json-panel" aria-label="Decoded parameters in raw JSON form">
      <div className="raw-json-toolbar">
        <button
          type="button"
          className="inline-copy-icon raw-json-copy-button"
          aria-label="Copy JSON"
          data-state={copyState === 'idle' ? undefined : copyState}
          onClick={handleCopy}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="9" y="9" width="10" height="10" rx="2" ry="2" />
            <path d="M5 15c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        </button>
      </div>

      <pre className="raw-json-pre">
        <code>{formattedJson}</code>
      </pre>
    </section>
  );
};

export default RawJsonView;
