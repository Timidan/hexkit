import React from 'react';
import type { DelegateCategory } from '@/utils/eip7702/riskRegistry';
import { cn } from '@/lib/utils';

const STYLES: Record<DelegateCategory, string> = {
  drainer: 'bg-red-500/10 text-red-400 border-red-500/30',
  wallet: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  session: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  unknown: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
};

export const DelegationBadge: React.FC<{
  category: DelegateCategory;
  verified: boolean;
}> = ({ category, verified }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
      STYLES[category],
    )}
  >
    {category}
    {verified ? <span aria-label="verified">·verified</span> : null}
  </span>
);

export default DelegationBadge;
