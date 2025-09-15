import React from "react";

export type ChainKey = "ETH" | "BASE" | "POLY" | "ARB" | "OP" | "BSC" | "GNO";

interface ChainIconProps {
  chain: ChainKey;
  size?: number;
  rounded?: number;
}

const CircleBg: React.FC<
  React.PropsWithChildren<{ color: string; size: number; rounded: number }>
> = ({ color, size, rounded, children }) => (
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <rect
      x="0"
      y="0"
      width={size}
      height={size}
      rx={rounded}
      ry={rounded}
      fill={color}
    />
    {children}
  </svg>
);

const ChainIcon: React.FC<ChainIconProps> = ({
  chain,
  size = 24,
  rounded = 12,
}) => {
  switch (chain) {
    case "ETH":
      return (
        <CircleBg color="#627EEA" size={size} rounded={rounded}>
          <path d="M12 4 L6 12 L12 10 L18 12 Z" fill="#FFFFFF" opacity="0.9" />
          <path d="M12 20 L6 13 L12 15 L18 13 Z" fill="#FFFFFF" opacity="0.9" />
        </CircleBg>
      );
    case "BASE":
      return (
        <CircleBg color="#0052FF" size={size} rounded={rounded}>
          <circle cx="12" cy="12" r="6" fill="#FFFFFF" />
        </CircleBg>
      );
    case "POLY":
      return (
        <CircleBg color="#8247E5" size={size} rounded={rounded}>
          <path d="M7 10 L10 8 L13 10 L13 14 L10 16 L7 14 Z" fill="#FFFFFF" />
        </CircleBg>
      );
    case "ARB":
      return (
        <CircleBg color="#28A0F0" size={size} rounded={rounded}>
          <path d="M7 8 L17 8 L12 16 Z" fill="#FFFFFF" />
        </CircleBg>
      );
    case "OP":
      return (
        <CircleBg color="#FF0420" size={size} rounded={rounded}>
          <text
            x="12"
            y="14"
            textAnchor="middle"
            fontFamily="sans-serif"
            fontSize="10"
            fill="#fff"
            fontWeight="700"
          >
            OP
          </text>
        </CircleBg>
      );
    case "BSC":
      return (
        <CircleBg color="#F3BA2F" size={size} rounded={rounded}>
          <path d="M12 6 L16 10 L12 14 L8 10 Z" fill="#111" />
        </CircleBg>
      );
    case "GNO":
      return (
        <CircleBg color="#48A9A6" size={size} rounded={rounded}>
          <circle cx="12" cy="12" r="4" fill="#FFFFFF" />
        </CircleBg>
      );
    default:
      return (
        <CircleBg color="#9CA3AF" size={size} rounded={rounded}>
          <text
            x="12"
            y="14"
            textAnchor="middle"
            fontFamily="sans-serif"
            fontSize="10"
            fill="#111"
            fontWeight="700"
          >
            NET
          </text>
        </CircleBg>
      );
  }
};

export default ChainIcon;
