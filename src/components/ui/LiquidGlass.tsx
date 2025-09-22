import React from 'react';
import '../../styles/LiquidGlass.css';

export interface LiquidGlassProps {
  children: React.ReactNode;
  variant?: 'container' | 'panel' | 'card' | 'overlay';
  blur?: number;
  saturation?: number;
  opacity?: number;
  padding?: string;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

const LiquidGlass: React.FC<LiquidGlassProps> = ({
  children,
  variant = 'container',
  blur = 20,
  saturation = 180,
  opacity = 0.08,
  padding = '24px',
  borderRadius = '16px',
  className = '',
  style = {}
}) => {
  const getVariantStyles = () => {
    const baseStyles = {
      backdropFilter: `blur(${blur}px) saturate(${saturation}%)`,
      WebkitBackdropFilter: `blur(${blur}px) saturate(${saturation}%)`,
      borderRadius,
      position: 'relative' as const,
      overflow: 'hidden' as const,
    };

    switch (variant) {
      case 'container':
        return {
          ...baseStyles,
          background: `
            linear-gradient(135deg, rgba(255, 255, 255, ${opacity}) 0%, rgba(255, 255, 255, ${opacity * 0.3}) 100%),
            radial-gradient(circle at 20% 80%, rgba(0, 255, 255, ${opacity * 0.5}) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255, 0, 127, ${opacity * 0.4}) 0%, transparent 50%)
          `,
          border: `1px solid rgba(255, 255, 255, ${opacity * 2})`,
          padding,
        };
      case 'panel':
        return {
          ...baseStyles,
          background: `linear-gradient(135deg, rgba(255, 255, 255, ${opacity * 0.7}) 0%, rgba(255, 255, 255, ${opacity * 0.2}) 100%)`,
          border: `1px solid rgba(255, 255, 255, ${opacity * 1.5})`,
          padding,
        };
      case 'card':
        return {
          ...baseStyles,
          background: `
            linear-gradient(135deg, rgba(255, 255, 255, ${opacity * 0.9}) 0%, rgba(255, 255, 255, ${opacity * 0.4}) 100%),
            radial-gradient(circle at 30% 30%, rgba(0, 255, 255, ${opacity * 0.3}) 0%, transparent 70%)
          `,
          border: `1px solid rgba(255, 255, 255, ${opacity * 2.5})`,
          padding,
          boxShadow: `
            0 8px 32px rgba(0, 0, 0, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, ${opacity * 3})
          `,
        };
      case 'overlay':
        return {
          ...baseStyles,
          background: `rgba(0, 0, 0, ${opacity * 3})`,
          border: `1px solid rgba(255, 255, 255, ${opacity})`,
          padding,
        };
      default:
        return {
          ...baseStyles,
          background: `rgba(255, 255, 255, ${opacity})`,
          border: `1px solid rgba(255, 255, 255, ${opacity * 2})`,
          padding,
        };
    }
  };

  const containerStyles = {
    ...getVariantStyles(),
    ...style,
  };

  return (
    <div
      className={`liquid-glass-container ${className}`}
      style={containerStyles}
    >
      {/* Enhanced edge highlights */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '1px',
          bottom: 0,
          background: 'linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.2), transparent)',
          pointerEvents: 'none',
        }}
      />
      
      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
      
      {/* Subtle animated background */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `
            radial-gradient(circle at 20% 20%, rgba(0, 255, 255, 0.05) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(255, 0, 127, 0.03) 0%, transparent 50%)
          `,
          animation: 'liquidFloat 8s ease-in-out infinite',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
    </div>
  );
};

export default LiquidGlass;