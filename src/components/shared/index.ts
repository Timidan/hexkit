// Shared UI Components
export { default as Input } from './Input';
export { default as Card } from './Card';
export { default as LoadingSpinner } from './LoadingSpinner';
export { default as ErrorDisplay } from './ErrorDisplay';
export { AddressDisplay, shortenAddress, shortenHash } from './AddressDisplay';
export type { AddressDisplayProps } from './AddressDisplay';

// Contract Badges
export {
  SourceBadge,
  ProxyTypeBadge,
  DiamondBadge,
  TokenTypeBadge,
  ContractBadges,
} from './ContractBadges';

// Re-export shadcn components for backwards compatibility
export { Button } from '../ui/button';
export { Badge } from '../ui/badge';

// Export types
export type { ButtonProps } from '../ui/button';
export type { InputProps } from './Input';
export type { CardProps } from './Card';
export type { LoadingSpinnerProps } from './LoadingSpinner';
export type { ErrorDisplayProps } from './ErrorDisplay';

// Badge types from shadcn
export type { VariantProps as BadgeVariantProps } from 'class-variance-authority';