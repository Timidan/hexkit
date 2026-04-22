import React from 'react';
import { Database, Hash, Shield, BracketsCurly, WarningCircle } from '@phosphor-icons/react';
import { middleTruncate } from './storageViewerHelpers';
import type { ResolvedSlot } from './storageViewerTypes';
import { copyTextToClipboard } from '../../utils/clipboard';

export const CopyableCell: React.FC<{
  value: string;
  fullValue?: string;
  className?: string;
  maxChars?: number;
}> = ({ value, fullValue, className = '', maxChars = 20 }) => {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copyText = fullValue || value;

  const handleCopy = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!copyText) return;
    copyTextToClipboard(copyText).catch(() => {});
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  }, [copyText]);

  if (!value) return <span className={`font-mono text-xs text-muted-foreground/40 ${className}`}>{'\u2014'}</span>;

  const display = middleTruncate(value, maxChars);

  return (
    <button
      onClick={handleCopy}
      className={`font-mono text-xs text-left cursor-pointer hover:underline decoration-dotted underline-offset-2 block w-full overflow-hidden whitespace-nowrap ${className}`}
      title={value.length > maxChars ? value : undefined}
    >
      {copied ? <span className="text-green-400">Copied!</span> : display}
    </button>
  );
};

export const ClickableValue: React.FC<{
  value: string;
  rawValue?: string;
  label?: string;
  dimmed?: boolean;
  maxChars?: number;
}> = ({ value, rawValue, dimmed, maxChars = 20 }) => {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fullValue = rawValue && rawValue.length > value.length ? rawValue : value;

  const handleCopy = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!fullValue || fullValue === '\u2014') return;
    copyTextToClipboard(fullValue).catch(() => {});
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  }, [fullValue]);

  if (!value || value === '\u2014') {
    return (
      <span className={`font-mono text-xs ${dimmed ? 'text-muted-foreground/40' : 'text-foreground'}`}>
        {value || '\u2014'}
      </span>
    );
  }

  const display = middleTruncate(value, maxChars);

  return (
    <button
      onClick={handleCopy}
      className={`font-mono text-xs text-left cursor-pointer hover:underline decoration-dotted underline-offset-2 block w-full overflow-hidden whitespace-nowrap ${
        dimmed ? 'text-muted-foreground/40' : 'text-foreground'
      }`}
      title={value.length > maxChars ? value : undefined}
    >
      {copied ? <span className="text-green-400">Copied!</span> : display}
    </button>
  );
};

export function DecodeKindIcon({ kind }: { kind: ResolvedSlot['decodeKind'] }) {
  switch (kind) {
    case 'exact': return <Database className="h-3 w-3 text-blue-400" />;
    case 'derived': return <Hash className="h-3 w-3 text-yellow-400" />;
    case 'proxy_slot': return <Shield className="h-3 w-3 text-purple-400" />;
    case 'namespace_root': return <BracketsCurly className="h-3 w-3 text-cyan-400" />;
    case 'unknown': return <WarningCircle className="h-3 w-3 text-muted-foreground" />;
  }
}
