import React from 'react';
import '../../styles/LiquidGlass.css';

export interface GlassButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
}

const GlassButton: React.FC<GlassButtonProps> = ({
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  style = {},
  icon,
  type = 'button'
}) => {
  const getVariantStyles = () => {
    const baseStyles = {
      background: 'rgba(255, 255, 255, 0.08)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    };

    switch (variant) {
      case 'primary':
        return {
          ...baseStyles,
          background: 'rgba(0, 255, 255, 0.1)',
          border: '1px solid rgba(0, 255, 255, 0.3)',
          color: '#00ffff',
          boxShadow: `
            0 8px 32px rgba(0, 255, 255, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            inset 0 -1px 0 rgba(0, 255, 255, 0.1)
          `,
        };
      case 'secondary':
        return {
          ...baseStyles,
          background: 'rgba(255, 255, 255, 0.06)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          color: '#e5e7eb',
          boxShadow: `
            0 8px 32px rgba(0, 0, 0, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.15),
            inset 0 -1px 0 rgba(255, 255, 255, 0.08)
          `,
        };
      case 'success':
        return {
          ...baseStyles,
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          color: '#22c55e',
          boxShadow: `
            0 8px 32px rgba(34, 197, 94, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            inset 0 -1px 0 rgba(34, 197, 94, 0.1)
          `,
        };
      case 'warning':
        return {
          ...baseStyles,
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#f59e0b',
          boxShadow: `
            0 8px 32px rgba(245, 158, 11, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            inset 0 -1px 0 rgba(245, 158, 11, 0.1)
          `,
        };
      case 'danger':
        return {
          ...baseStyles,
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#ef4444',
          boxShadow: `
            0 8px 32px rgba(239, 68, 68, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            inset 0 -1px 0 rgba(239, 68, 68, 0.1)
          `,
        };
      case 'info':
        return {
          ...baseStyles,
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          color: '#3b82f6',
          boxShadow: `
            0 8px 32px rgba(59, 130, 246, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            inset 0 -1px 0 rgba(59, 130, 246, 0.1)
          `,
        };
      default:
        return baseStyles;
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          padding: '8px 16px',
          fontSize: '14px',
          borderRadius: '8px',
        };
      case 'md':
        return {
          padding: '12px 20px',
          fontSize: '16px',
          borderRadius: '10px',
        };
      case 'lg':
        return {
          padding: '16px 24px',
          fontSize: '18px',
          borderRadius: '12px',
        };
      default:
        return {
          padding: '12px 20px',
          fontSize: '16px',
          borderRadius: '10px',
        };
    }
  };

  const getDisabledStyles = () => {
    if (!disabled) return {};
    
    return {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none' as const,
    };
  };

  const buttonStyles = {
    ...getVariantStyles(),
    ...getSizeStyles(),
    ...getDisabledStyles(),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: icon ? '8px' : '0',
    fontWeight: '500',
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
    whiteSpace: 'nowrap' as const,
    userSelect: 'none' as const,
    ...style,
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    
    const button = e.currentTarget;
    const shine = button.querySelector('.glass-button-shine') as HTMLElement;
    
    // Enhanced liquid glass effect on hover
    button.style.transform = 'translateY(-2px) scale(1.02)';
    button.style.backdropFilter = 'blur(25px) saturate(200%)';
    (button.style as any).WebkitBackdropFilter = 'blur(25px) saturate(200%)';
    
    // Trigger shine animation
    if (shine) {
      shine.style.left = '100%';
    }
    
    // Enhance glass transparency on hover
    button.style.background = 'rgba(0, 255, 255, 0.15)';
    button.style.borderColor = 'rgba(0, 255, 255, 0.4)';
    button.style.boxShadow = `
      0 12px 40px rgba(0, 255, 255, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.3),
      inset 0 -1px 0 rgba(0, 255, 255, 0.15)
    `;
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    
    const button = e.currentTarget;
    const shine = button.querySelector('.glass-button-shine') as HTMLElement;
    const variantStyles = getVariantStyles();
    
    // Reset to original state with smooth transition
    button.style.transform = 'translateY(0) scale(1)';
    button.style.backdropFilter = 'blur(20px) saturate(180%)';
    (button.style as any).WebkitBackdropFilter = 'blur(20px) saturate(180%)';
    button.style.background = variantStyles.background || '';
    button.style.borderColor = variantStyles.border?.split(' ')[2] || '';
    button.style.boxShadow = ('boxShadow' in variantStyles ? variantStyles.boxShadow : '') || '';
    
    // Reset shine animation
    if (shine) {
      shine.style.left = '-100%';
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    
    const button = e.currentTarget;
    const ripple = button.querySelector('.glass-button-ripple') as HTMLElement;
    
    button.style.transform = 'translateY(-1px) scale(0.98)';
    
    // Trigger ripple effect
    if (ripple) {
      ripple.style.width = '100px';
      ripple.style.height = '100px';
      ripple.style.opacity = '1';
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    
    const button = e.currentTarget;
    const ripple = button.querySelector('.glass-button-ripple') as HTMLElement;
    
    button.style.transform = 'translateY(-2px) scale(1.02)';
    
    // Reset ripple effect
    if (ripple) {
      setTimeout(() => {
        ripple.style.width = '0';
        ripple.style.height = '0';
        ripple.style.opacity = '0';
      }, 200);
    }
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`glass-button ${className}`}
      style={buttonStyles}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {icon && <span className="glass-button-icon">{icon}</span>}
      <span className="glass-button-text">{children}</span>
      
      {/* Enhanced liquid shine effect */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '-100%',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1), transparent)',
          transition: 'left 0.6s cubic-bezier(0.4, 0.0, 0.2, 1)',
          pointerEvents: 'none',
          borderRadius: 'inherit',
          mixBlendMode: 'overlay',
        }}
        className="glass-button-shine"
      />
      
      {/* Liquid ripple effect */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '0',
          height: '0',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          transition: 'width 0.3s ease, height 0.3s ease',
          pointerEvents: 'none',
          opacity: 0,
        }}
        className="glass-button-ripple"
      />
    </button>
  );
};

export default GlassButton;