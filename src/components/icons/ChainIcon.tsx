import React from "react";

export type ChainKey =
  | "ETH"
  | "BASE"
  | "POLY"
  | "ARB"
  | "OP"
  | "BSC"
  | "GNO"
  | "LISK"
  | "AVAX";

interface ChainIconProps {
  chain: ChainKey;
  size?: number;
  rounded?: number;
}

// Official chain logos as lightweight SVGs
const ChainIcon: React.FC<ChainIconProps> = ({
  chain,
  size = 24,
  rounded = 6,
}) => {
  const r = Math.min(rounded, size / 2);

  switch (chain) {
    // Ethereum - Official diamond logo
    case "ETH":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx={r} fill="#627EEA" />
          <path d="M16 4V13.0417L23.5 16.3333L16 4Z" fill="white" fillOpacity="0.6" />
          <path d="M16 4L8.5 16.3333L16 13.0417V4Z" fill="white" />
          <path d="M16 22.0833V28L23.5 17.7917L16 22.0833Z" fill="white" fillOpacity="0.6" />
          <path d="M16 28V22.0833L8.5 17.7917L16 28Z" fill="white" />
          <path d="M16 20.625L23.5 16.3333L16 13.0417V20.625Z" fill="white" fillOpacity="0.2" />
          <path d="M8.5 16.3333L16 20.625V13.0417L8.5 16.3333Z" fill="white" fillOpacity="0.6" />
        </svg>
      );

    // Base - Official logo (B cutout in circle)
    case "BASE":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx={r} fill="#0052FF" />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M16 26C21.5228 26 26 21.5228 26 16C26 10.4772 21.5228 6 16 6C10.4772 6 6 10.4772 6 16C6 21.5228 10.4772 26 16 26ZM13.5 11H18.5C20.433 11 22 12.567 22 14.5C22 15.7 21.4 16.75 20.5 17.4C21.7 18.05 22.5 19.35 22.5 20.5C22.5 22.433 20.933 24 19 24H13.5V11ZM16 15.5H18C18.8284 15.5 19.5 14.8284 19.5 14C19.5 13.1716 18.8284 12.5 18 12.5H16V15.5ZM16 17V22H18.5C19.3284 22 20 21.3284 20 20.5C20 19.6716 19.3284 19 18.5 19H16V17Z"
            fill="white"
          />
        </svg>
      );

    // Polygon - Official logo
    case "POLY":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx={r} fill="#8247E5" />
          <path
            d="M21.5 12.5C21.1 12.3 20.6 12.3 20.2 12.5L17.5 14.1L15.7 15.1L13 16.7C12.6 16.9 12.1 16.9 11.7 16.7L9.6 15.5C9.2 15.3 9 14.9 9 14.4V12.1C9 11.6 9.2 11.2 9.6 11L11.7 9.8C12.1 9.6 12.6 9.6 13 9.8L15.1 11C15.5 11.2 15.7 11.6 15.7 12.1V13.7L17.5 12.6V11C17.5 10.5 17.3 10.1 16.9 9.9L13.1 7.7C12.7 7.5 12.2 7.5 11.8 7.7L7.9 9.9C7.5 10.1 7.3 10.5 7.3 11V15.5C7.3 16 7.5 16.4 7.9 16.6L11.8 18.8C12.2 19 12.7 19 13.1 18.8L15.8 17.3L17.6 16.2L20.3 14.7C20.7 14.5 21.2 14.5 21.6 14.7L23.7 15.9C24.1 16.1 24.3 16.5 24.3 17V19.3C24.3 19.8 24.1 20.2 23.7 20.4L21.6 21.7C21.2 21.9 20.7 21.9 20.3 21.7L18.2 20.5C17.8 20.3 17.6 19.9 17.6 19.4V17.9L15.8 19V20.6C15.8 21.1 16 21.5 16.4 21.7L20.3 23.9C20.7 24.1 21.2 24.1 21.6 23.9L25.5 21.7C25.9 21.5 26.1 21.1 26.1 20.6V16C26.1 15.5 25.9 15.1 25.5 14.9L21.5 12.5Z"
            fill="white"
          />
        </svg>
      );

    // Arbitrum - Official logo
    case "ARB":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx={r} fill="#2D374B" />
          <path
            d="M17.7 11.2L20.3 15.5L23 11.4L20.9 7.5L17.7 11.2Z"
            fill="#28A0F0"
          />
          <path
            d="M23.1 20.5L25.8 16L23 11.4L20.3 15.5L23.1 20.5Z"
            fill="#28A0F0"
          />
          <path
            d="M14.3 11.2L11.1 7.5L9 11.4L11.7 15.5L14.3 11.2Z"
            fill="white"
          />
          <path
            d="M8.9 20.5L11.7 15.5L9 11.4L6.2 16L8.9 20.5Z"
            fill="white"
          />
          <path
            d="M16 13.5L11.7 15.5L14.5 20.5L16 17.5L17.5 20.5L20.3 15.5L16 13.5Z"
            fill="white"
          />
          <path
            d="M14.5 20.5L16 24.5L17.5 20.5H14.5Z"
            fill="#28A0F0"
          />
        </svg>
      );

    // Optimism - Official logo
    case "OP":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx={r} fill="#FF0420" />
          <path
            d="M11.5 21C8.5 21 6 18.5 6 15.5C6 12.5 8.5 10 11.5 10C14.5 10 17 12.5 17 15.5C17 18.5 14.5 21 11.5 21ZM11.5 12.5C9.8 12.5 8.5 13.8 8.5 15.5C8.5 17.2 9.8 18.5 11.5 18.5C13.2 18.5 14.5 17.2 14.5 15.5C14.5 13.8 13.2 12.5 11.5 12.5Z"
            fill="white"
          />
          <path
            d="M21 21H18.5V10H22C24.5 10 26.5 12 26.5 14.5C26.5 17 24.5 19 22 19H21V21ZM21 12.5V16.5H22C23.1 16.5 24 15.6 24 14.5C24 13.4 23.1 12.5 22 12.5H21Z"
            fill="white"
          />
        </svg>
      );

    // BNB/BSC - Official logo
    case "BSC":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx={r} fill="#F3BA2F" />
          <path
            d="M16 8L12.5 11.5L14.5 13.5L16 12L17.5 13.5L19.5 11.5L16 8Z"
            fill="white"
          />
          <path
            d="M10 14L8 16L10 18L12 16L10 14Z"
            fill="white"
          />
          <path
            d="M16 24L19.5 20.5L17.5 18.5L16 20L14.5 18.5L12.5 20.5L16 24Z"
            fill="white"
          />
          <path
            d="M22 14L20 16L22 18L24 16L22 14Z"
            fill="white"
          />
          <path
            d="M16 14L14 16L16 18L18 16L16 14Z"
            fill="white"
          />
        </svg>
      );

    // Gnosis - Official owl logo (simplified)
    case "GNO":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx={r} fill="#04795B" />
          <circle cx="12" cy="13" r="3" fill="white" />
          <circle cx="20" cy="13" r="3" fill="white" />
          <circle cx="12" cy="13" r="1.5" fill="#04795B" />
          <circle cx="20" cy="13" r="1.5" fill="#04795B" />
          <path
            d="M16 17C13 17 11 19 11 22H13C13 20 14 19 16 19C18 19 19 20 19 22H21C21 19 19 17 16 17Z"
            fill="white"
          />
        </svg>
      );

    // Lisk - Official logo
    case "LISK":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx={r} fill="#0074FF" />
          <path
            d="M16 6L8 11V21L16 26L24 21V11L16 6ZM16 8.5L21.5 12V20L16 23.5L10.5 20V12L16 8.5Z"
            fill="white"
          />
          <path
            d="M16 11L12 13.5V18.5L16 21L20 18.5V13.5L16 11Z"
            fill="white"
            fillOpacity="0.5"
          />
        </svg>
      );

    // Avalanche - Official logo
    case "AVAX":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx={r} fill="#E84142" />
          <path
            d="M20.5 21H24L16 7L12.5 13.5L17 13.5L20.5 21Z"
            fill="white"
          />
          <path
            d="M11.5 21H8L12.5 13.5L15 18L11.5 21Z"
            fill="white"
          />
        </svg>
      );

    // Default fallback
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx={r} fill="#6B7280" />
          <circle cx="16" cy="16" r="8" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="16" cy="16" r="3" fill="white" />
        </svg>
      );
  }
};

export default ChainIcon;
