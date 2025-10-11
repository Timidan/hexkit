import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/SharedComponents.css';
import { CopyIcon, CheckIcon, AlertCircleIcon } from '../icons/IconLibrary';
import { copyTextToClipboard } from '../../utils/clipboard';

export type InlineCopyState = 'idle' | 'copied' | 'error';

interface InlineCopyButtonProps {
  value?: string;
  getValue?: () => string | Promise<string | undefined | null> | undefined;
  ariaLabel: string;
  title?: string;
  className?: string;
  iconSize?: number;
  size?: number;
  onStateChange?: (state: InlineCopyState) => void;
  onCopySuccess?: (value: string) => void;
  onCopyError?: (error: unknown) => void;
  successLabel?: string;
  errorLabel?: string;
  idleLabel?: string;
  disabled?: boolean;
}

const STATE_RESET_MS = 1600;

const InlineCopyButton: React.FC<InlineCopyButtonProps> = ({
  value,
  getValue,
  ariaLabel,
  title,
  className = '',
  iconSize = 18,
  size = 36,
  onStateChange,
  onCopySuccess,
  onCopyError,
  successLabel = 'Copied',
  errorLabel = 'Copy failed',
  idleLabel = ariaLabel,
  disabled = false,
}) => {
  const [state, setState] = useState<InlineCopyState>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const appliedTitle = useMemo(() => {
    if (state === 'copied') return successLabel;
    if (state === 'error') return errorLabel;
    return title ?? idleLabel;
  }, [state, successLabel, errorLabel, title, idleLabel]);

  const appliedAriaLabel = appliedTitle;

  const resetState = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState('idle');
    onStateChange?.('idle');
  };

  const scheduleReset = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(resetState, STATE_RESET_MS);
  };

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (disabled) {
      return;
    }

    try {
      const resolved =
        value ?? (typeof getValue === 'function' ? await getValue() : '');
      if (!resolved) {
        return;
      }
      await copyTextToClipboard(resolved);
      setState('copied');
      onStateChange?.('copied');
      onCopySuccess?.(resolved);
      scheduleReset();
    } catch (error) {
      console.warn('Copy failed', error);
      setState('error');
      onStateChange?.('error');
      onCopyError?.(error);
      scheduleReset();
    }
  };

  const buttonStyle = useMemo(
    () => ({ '--inline-copy-size': `${size}px` }) as React.CSSProperties,
    [size]
  );

  return (
    <button
      type="button"
      className={`inline-copy-icon ${className}`.trim()}
      data-state={state}
      aria-label={appliedAriaLabel}
      title={appliedTitle}
      onClick={handleCopy}
      disabled={disabled}
      style={buttonStyle}
    >
      {state === 'copied' ? (
        <CheckIcon width={iconSize} height={iconSize} />
      ) : state === 'error' ? (
        <AlertCircleIcon width={iconSize} height={iconSize} />
      ) : (
        <CopyIcon width={iconSize} height={iconSize} />
      )}
    </button>
  );
};

export default InlineCopyButton;
