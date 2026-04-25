import React from 'react';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import type { RiskLevel, RiskSignal } from '../../utils/signature/types';

const LEVEL_CLASS: Record<RiskLevel, string> = {
  ok: 'border-emerald-900 bg-emerald-950/30 text-emerald-100',
  warn: 'border-amber-900 bg-amber-950/30 text-amber-100',
  danger: 'border-red-900 bg-red-950/30 text-red-100',
};

const LEVEL_TITLE: Record<RiskLevel, string> = {
  ok: 'No blocking risks detected',
  warn: 'Review the warnings below',
  danger: 'Dangerous signature',
};

export const RiskBanner: React.FC<{ level: RiskLevel; signals: RiskSignal[] }> = ({
  level,
  signals,
}) => {
  return (
    <Alert className={LEVEL_CLASS[level]}>
      <AlertTitle>{LEVEL_TITLE[level]}</AlertTitle>
      <AlertDescription>
        {signals.length === 0 ? (
          <span className="text-xs text-zinc-400">
            Nothing obvious — still verify every field manually.
          </span>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {signals.map((s) => (
              <li key={`${s.code}-${s.field ?? ''}`}>
                <span
                  className={
                    s.level === 'danger'
                      ? 'text-red-300'
                      : s.level === 'warn'
                        ? 'text-amber-300'
                        : 'text-emerald-300'
                  }
                >
                  [{s.level.toUpperCase()}]
                </span>{' '}
                <span className="font-mono">{s.code}</span>
                {s.field ? ` · ${s.field}` : ''} — {s.message}
              </li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
};

export default RiskBanner;
