import React, { useMemo, useState } from 'react';

import '../../styles/SharedComponents.css';
import InlineCopyButton, { type InlineCopyState } from './InlineCopyButton';

type Tone = 'default' | 'success' | 'error' | 'info' | 'warning';

interface CopyableResultProps {
  title?: React.ReactNode;
  htmlContent?: string;
  plainText?: string;
  copyText?: string;
  tone?: Tone;
  monospace?: boolean;
  children?: React.ReactNode;
}

const stripHtml = (html?: string): string => {
  if (!html) return '';
  const tmp = html
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ');
  return tmp.replace(/\s+/g, ' ').trim();
};

const CopyableResult: React.FC<CopyableResultProps> = ({
  title,
  htmlContent,
  plainText,
  copyText,
  tone = 'default',
  monospace = true,
  children,
}) => {
  const [copyState, setCopyState] = useState<InlineCopyState>('idle');

  const resolvedCopyText = useMemo(() => {
    if (copyText) return copyText;
    if (plainText) return plainText;
    if (htmlContent) return stripHtml(htmlContent);
    return '';
  }, [copyText, plainText, htmlContent]);

  return (
    <div
      className={[
        'copyable-result',
        `copyable-result-${tone}`,
        monospace ? 'copyable-result-mono' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="copyable-result-header">
        <div className="copyable-result-title">{title}</div>
        {resolvedCopyText && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <InlineCopyButton
              value={resolvedCopyText}
              ariaLabel="Copy result content"
              onStateChange={setCopyState}
              iconSize={16}
            />
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
                ? 'Copied'
                : copyState === 'error'
                ? 'Copy failed'
                : ''}
            </span>
          </div>
        )}
      </div>

      <div className="copyable-result-content">
        {children ? (
          children
        ) : htmlContent ? (
          <div
            className="copyable-result-html"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        ) : (
          <div>{plainText}</div>
        )}
      </div>
    </div>
  );
};

export default CopyableResult;
