import React, { useMemo, useState } from 'react';

import '../../styles/SharedComponents.css';
import InlineCopyButton, { type InlineCopyState } from './InlineCopyButton';

interface CopyableKeyValueProps {
  label: React.ReactNode;
  value: any;
  valueDisplay?: React.ReactNode;
  type?: string;
  copyFallback?: string;
  className?: string;
}

const stringifyValue = (value: any, fallback: string = ''): string => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    return JSON.stringify(value, (_key, val) => {
      if (val && typeof val === 'object') {
        if (val._isBigNumber && val._hex) {
          return val.toString?.() ?? val._hex;
        }
        if (typeof val === 'bigint') {
          return val.toString();
        }
      }
      return val;
    }, 2);
  } catch (error) {
    try {
      return String(value);
    } catch {
      console.warn('Failed to stringify value for copy', error);
      return fallback;
    }
  }
};

const CopyableKeyValue: React.FC<CopyableKeyValueProps> = ({
  label,
  value,
  valueDisplay,
  type,
  copyFallback = '',
  className = '',
}) => {
  const [copyState, setCopyState] = useState<InlineCopyState>('idle');

  const copyText = useMemo(
    () => stringifyValue(value, copyFallback),
    [value, copyFallback]
  );

  return (
    <div className={`copyable-kv ${className}`.trim()}>
      <div className="copyable-kv-header">
        <div className="copyable-kv-label">{label}</div>
        <div className="copyable-kv-meta">
          {type && <span className="copyable-kv-type">({type})</span>}
          <InlineCopyButton
            value={copyText}
            ariaLabel={`Copy value for ${typeof label === 'string' ? label : 'field'}`}
            iconSize={14}
            size={32}
            onStateChange={setCopyState}
          />
        </div>
      </div>
      <div className="copyable-kv-value">
        {valueDisplay ?? value}
      </div>
      <span
        className={`copy-feedback-text ${
          copyState === 'copied'
            ? 'is-success'
            : copyState === 'error'
            ? 'is-error'
            : ''
        }`}
        aria-live="polite"
      >
        {copyState === 'copied'
          ? 'Copied to clipboard'
          : copyState === 'error'
          ? 'Copy failed'
          : ''}
      </span>
    </div>
  );
};

export default CopyableKeyValue;
