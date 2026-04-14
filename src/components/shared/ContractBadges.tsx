/**
 * Contract Badges
 *
 * Reusable badge components for displaying contract information:
 * - Source (Sourcify, Etherscan, Blockscout)
 * - Proxy type (EIP-1967, Diamond, Safe, etc.)
 * - Token type (ERC20, ERC721, ERC1155)
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Shield } from '@phosphor-icons/react';
import type { Source, ProxyInfo, ProxyType } from '@/utils/resolver/types';

type BadgeSize = 'sm' | 'md' | 'lg';
type BadgeSizeProp = BadgeSize | 'default';

const resolveBadgeSize = (size?: BadgeSizeProp): BadgeSize =>
  size === 'default' ? 'md' : size ?? 'sm';

const SourcifyLogo: React.FC<{ className?: string }> = ({ className = 'h-3 w-3' }) => (
  <svg className={className} viewBox="0 0 100 100" fill="currentColor">
    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" />
    <path d="M30 50 L45 65 L70 35" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BlockscoutLogo: React.FC<{ className?: string }> = ({ className = 'h-3 w-3' }) => (
  <svg className={className} viewBox="0 0 100 100" fill="currentColor">
    <circle cx="50" cy="30" r="20" />
    <circle cx="25" cy="70" r="15" />
    <circle cx="75" cy="70" r="15" />
  </svg>
);

const EtherscanLogo: React.FC<{ className?: string }> = ({ className = 'h-3 w-3' }) => (
  <svg className={className} viewBox="0 0 100 100" fill="currentColor">
    <path d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z" fill="none" stroke="currentColor" strokeWidth="6" />
    <circle cx="50" cy="50" r="15" />
  </svg>
);

const GemIcon: React.FC<{ className?: string }> = ({ className = 'h-3 w-3' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h12l4 6-10 13L2 9z" />
    <path d="M11 3l1 10-10-4" />
    <path d="M13 3l-1 10 10-4" />
    <path d="M12 22L2 9h20z" />
  </svg>
);

interface SourceBadgeProps {
  source: Source | string | null;
  size?: BadgeSizeProp;
  showLogo?: boolean;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({
  source,
  size = 'sm',
  showLogo = true,
}) => {
  if (!source) return null;
  const resolvedSize = resolveBadgeSize(size);

  const getVariant = () => {
    switch (source) {
      case 'sourcify':
        return 'success';
      case 'blockscout':
        return 'info';
      case 'etherscan':
        return 'accent';
      case 'blockscout-bytecode':
        return 'teal';
      default:
        return 'secondary';
    }
  };

  const getDisplayName = () => {
    switch (source) {
      case 'blockscout-bytecode':
        return 'bytecode-db';
      default:
        return source;
    }
  };

  const getTitle = () => {
    switch (source) {
      case 'sourcify':
        return 'Contract ABI verified from Sourcify - Source code verified with reproducible builds';
      case 'blockscout':
        return 'Contract ABI verified from Blockscout - Verified contract explorer';
      case 'etherscan':
        return 'Contract ABI verified from Etherscan - Blockchain explorer verification';
      case 'blockscout-bytecode':
        return 'Contract ABI from Blockscout Bytecode DB - Shared bytecode database fallback';
      default:
        return `Source: ${source}`;
    }
  };

  return (
    <Badge
      variant={getVariant() as 'success' | 'info' | 'accent' | 'teal' | 'secondary'}
      size={resolvedSize}
      className="uppercase tracking-wide cursor-help gap-1"
      title={getTitle()}
    >
      {getDisplayName()}
      {showLogo && source === 'sourcify' && <SourcifyLogo />}
      {showLogo && (source === 'blockscout' || source === 'blockscout-bytecode') && <BlockscoutLogo />}
      {showLogo && source === 'etherscan' && <EtherscanLogo />}
    </Badge>
  );
};

interface ProxyTypeBadgeProps {
  proxyInfo: ProxyInfo | null | undefined;
  size?: BadgeSizeProp;
  showIcon?: boolean;
}

const PROXY_LABELS: Record<ProxyType, string> = {
  'eip1967': 'EIP-1967',
  'transparent': 'Transparent',
  'eip1967-beacon': 'Beacon',
  'eip1167': 'Clone',
  'eip1822': 'UUPS',
  'gnosis-safe': 'Safe',
  'diamond': 'Diamond',
  'unknown': 'Proxy',
};

const PROXY_TITLES: Record<ProxyType, string> = {
  'eip1967': 'EIP-1967 Transparent Proxy',
  'transparent': 'Transparent Proxy',
  'eip1967-beacon': 'EIP-1967 Beacon Proxy',
  'eip1167': 'EIP-1167 Minimal Proxy (Clone)',
  'eip1822': 'EIP-1822 UUPS Proxy',
  'gnosis-safe': 'Gnosis Safe Proxy',
  'diamond': 'EIP-2535 Diamond Proxy',
  'unknown': 'Proxy Contract',
};

export const ProxyTypeBadge: React.FC<ProxyTypeBadgeProps> = ({
  proxyInfo,
  size = 'sm',
  showIcon = true,
}) => {
  if (!proxyInfo?.isProxy) return null;
  const resolvedSize = resolveBadgeSize(size);

  // Don't show proxy badge for diamonds - they have their own badge
  if (proxyInfo.proxyType === 'diamond') return null;

  const proxyType = proxyInfo.proxyType || 'unknown';
  const label = PROXY_LABELS[proxyType] || 'Proxy';
  const title = PROXY_TITLES[proxyType] || 'Proxy Contract';

  const fullTitle = proxyInfo.implementationAddress
    ? `${title} → ${proxyInfo.implementationAddress.slice(0, 10)}...`
    : title;

  return (
    <Badge
      variant="secondary"
      size={resolvedSize}
      className="uppercase tracking-wide cursor-help gap-1"
      title={fullTitle}
    >
      {showIcon && <Shield className="h-3 w-3" />}
      {label}
    </Badge>
  );
};

interface DiamondBadgeProps {
  proxyInfo: ProxyInfo | null | undefined;
  size?: BadgeSizeProp;
  variant?: 'icon' | 'badge' | 'both';
}

export const DiamondBadge: React.FC<DiamondBadgeProps> = ({
  proxyInfo,
  size = 'sm',
  variant = 'both',
}) => {
  if (!proxyInfo?.isProxy || proxyInfo.proxyType !== 'diamond') return null;
  const resolvedSize = resolveBadgeSize(size);

  const facetCount = proxyInfo.implementations?.length;
  const title = facetCount
    ? `EIP-2535 Diamond Proxy with ${facetCount} facets`
    : 'EIP-2535 Diamond Proxy';

  if (variant === 'icon') {
    return (
      <span
        title={title}
        className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full cursor-help"
        style={{
          background: 'rgba(124, 58, 237, 0.15)',
          border: '1px solid rgba(124, 58, 237, 0.4)',
          color: '#a78bfa',
        }}
      >
        <GemIcon className="h-3 w-3" />
      </span>
    );
  }

  if (variant === 'badge') {
    return (
      <Badge
        variant="secondary"
        size={resolvedSize}
        className="uppercase tracking-wide cursor-help gap-1 bg-purple-500/20 text-purple-400 border-purple-500/30"
        title={title}
      >
        Diamond
      </Badge>
    );
  }

  // Both: icon + badge
  return (
    <div className="flex items-center gap-1">
      <span
        title={title}
        className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full cursor-help"
        style={{
          background: 'rgba(124, 58, 237, 0.15)',
          border: '1px solid rgba(124, 58, 237, 0.4)',
          color: '#a78bfa',
        }}
      >
        <GemIcon className="h-3 w-3" />
      </span>
      <Badge
        variant="secondary"
        size={resolvedSize}
        className="uppercase tracking-wide cursor-help gap-1 bg-purple-500/20 text-purple-400 border-purple-500/30"
        title={title}
      >
        Diamond
      </Badge>
    </div>
  );
};

interface TokenTypeBadgeProps {
  tokenType: 'ERC20' | 'ERC721' | 'ERC1155' | 'ERC777' | 'ERC4626' | string | null;
  symbol?: string | null;
  size?: BadgeSizeProp;
  showSymbol?: boolean;
}

const TOKEN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'ERC20': { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.4)' },
  'ERC721': { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.4)' },
  'ERC1155': { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.4)' },
  'ERC777': { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.4)' },
  'ERC4626': { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899', border: 'rgba(236, 72, 153, 0.4)' },
};

const TOKEN_LABELS: Record<string, string> = {
  'ERC20': 'ERC20 Token',
  'ERC721': 'ERC721 NFT',
  'ERC1155': 'ERC1155 Multi-Token',
  'ERC777': 'ERC777 Token',
  'ERC4626': 'ERC4626 Vault',
};

export const TokenTypeBadge: React.FC<TokenTypeBadgeProps> = ({
  tokenType,
  symbol,
  size = 'sm',
  showSymbol = true,
}) => {
  if (!tokenType) return null;
  const resolvedSize = resolveBadgeSize(size);

  const colors = TOKEN_COLORS[tokenType] || { bg: 'rgba(156, 163, 175, 0.15)', text: '#9ca3af', border: 'rgba(156, 163, 175, 0.4)' };
  const label = TOKEN_LABELS[tokenType] || tokenType;

  return (
    <Badge
      variant="secondary"
      size={resolvedSize}
      className="uppercase tracking-wide cursor-help gap-1"
      style={{
        background: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
      title={`${label}${symbol ? ` (${symbol})` : ''}`}
    >
      {tokenType}
      {showSymbol && symbol && (
        <span className="font-normal opacity-75">{symbol}</span>
      )}
    </Badge>
  );
};

interface ContractBadgesProps {
  source?: Source | string | null;
  proxyInfo?: ProxyInfo | null;
  tokenType?: 'ERC20' | 'ERC721' | 'ERC1155' | 'ERC777' | 'ERC4626' | string | null;
  tokenSymbol?: string | null;
  size?: BadgeSizeProp;
  showSource?: boolean;
  showProxy?: boolean;
  showToken?: boolean;
}

export const ContractBadges: React.FC<ContractBadgesProps> = ({
  source,
  proxyInfo,
  tokenType,
  tokenSymbol,
  size = 'sm',
  showSource = true,
  showProxy = true,
  showToken = true,
}) => {
  const isDiamond = proxyInfo?.isProxy && proxyInfo.proxyType === 'diamond';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Diamond badge takes priority */}
      {showProxy && isDiamond && (
        <DiamondBadge proxyInfo={proxyInfo} size={size} variant="badge" />
      )}

      {/* Source badge */}
      {showSource && source && (
        <SourceBadge source={source} size={size} />
      )}

      {/* Proxy badge (non-diamond) */}
      {showProxy && !isDiamond && (
        <ProxyTypeBadge proxyInfo={proxyInfo} size={size} />
      )}

      {/* Token type badge */}
      {showToken && tokenType && (
        <TokenTypeBadge tokenType={tokenType} symbol={tokenSymbol} size={size} />
      )}
    </div>
  );
};

export default ContractBadges;
