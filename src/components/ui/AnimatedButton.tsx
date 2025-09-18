import React from 'react';
import { motion } from 'framer-motion';
import { Loader2Icon } from '../icons/IconLibrary';

interface AnimatedButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  className?: string;
  fullWidth?: boolean;
}

const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  className = '',
  fullWidth = false
}) => {
  const buttonVariants = {
    idle: {
      scale: 1,
      rotateX: 0,
    },
    hover: {
      scale: 1.02,
      rotateX: -2,
      transition: { duration: 0.2 }
    },
    tap: {
      scale: 0.98,
      rotateX: 2,
      transition: { duration: 0.1 }
    },
    disabled: {
      scale: 1,
      opacity: 0.6,
      transition: { duration: 0.2 }
    }
  };

  const glowVariants = {
    idle: {
      opacity: 0,
      scale: 1,
    },
    hover: {
      opacity: variant === 'primary' ? 0.8 : 0.4,
      scale: 1.1,
      transition: { duration: 0.3 }
    },
    tap: {
      opacity: variant === 'primary' ? 1 : 0.6,
      scale: 0.95,
      transition: { duration: 0.1 }
    }
  };

  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return 'animated-button-primary';
      case 'secondary':
        return 'animated-button-secondary';
      case 'ghost':
        return 'animated-button-ghost';
      case 'danger':
        return 'animated-button-danger';
      default:
        return 'animated-button-primary';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'animated-button-sm';
      case 'lg':
        return 'animated-button-lg';
      default:
        return 'animated-button-md';
    }
  };

  const getAnimationState = () => {
    if (disabled || loading) return 'disabled';
    return 'idle';
  };

  const renderIcon = (pos: 'left' | 'right') => {
    if (!icon || iconPosition !== pos) return null;
    return (
      <motion.div
        className="button-icon"
        animate={loading ? { rotate: 360 } : {}}
        transition={loading ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
      >
        {loading ? <Loader2Icon width={16} height={16} /> : icon}
      </motion.div>
    );
  };

  return (
    <motion.button
      className={`
        animated-button 
        ${getVariantClasses()} 
        ${getSizeClasses()} 
        ${fullWidth ? 'animated-button-full-width' : ''}
        ${className}
      `}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      variants={buttonVariants}
      initial="idle"
      animate={getAnimationState()}
      whileHover={!disabled && !loading ? "hover" : undefined}
      whileTap={!disabled && !loading ? "tap" : undefined}
      style={{ perspective: '1000px' }}
    >
      {/* Background glow effect */}
      <motion.div
        className="button-glow"
        variants={glowVariants}
        initial="idle"
        animate={getAnimationState()}
      />

      {/* Button content */}
      <div className="button-content">
        {renderIcon('left')}
        <span className="button-text">{children}</span>
        {renderIcon('right')}
      </div>

      {/* Cyber scan line effect */}
      <motion.div
        className="button-scan-line"
        initial={{ x: '-100%' }}
        whileHover={{
          x: '100%',
          transition: { duration: 0.6, ease: 'easeInOut' }
        }}
      />
    </motion.button>
  );
};

export default AnimatedButton;