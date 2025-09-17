import React from 'react';
import { Loader2 } from 'lucide-react';
import '../../styles/AnimatedButton.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}) => {
  const classes = [
    'animated-button',
    `animated-button-${variant}`,
    `animated-button-${size}`,
    fullWidth ? 'animated-button-full-width' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      data-loading={loading}
      {...props}
    >
      <div className="button-glow"></div>
      <div className="button-scan-line"></div>
      <div className="button-content">
        {loading && (
          <div className="button-icon">
            <Loader2 size={16} />
          </div>
        )}
        {!loading && icon && (
          <div className="button-icon">{icon}</div>
        )}
        <span className="button-text">{children}</span>
      </div>
    </button>
  );
};

export default Button;