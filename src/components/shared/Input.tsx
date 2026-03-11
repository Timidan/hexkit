import React, { useId } from 'react';
import '../../styles/SharedComponents.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variant?: 'default' | 'ghost' | 'accent';
  fullWidth?: boolean;
}

const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  variant = 'default',
  fullWidth = true,
  className = '',
  ...props
}) => {
  const inputId = useId();

  const inputClasses = [
    'shared-input',
    `shared-input-${variant}`,
    leftIcon ? 'shared-input-with-left-icon' : '',
    rightIcon ? 'shared-input-with-right-icon' : '',
    error ? 'shared-input-error' : '',
    className
  ].filter(Boolean).join(' ');

  const containerClasses = fullWidth ? 'shared-input-container' : '';

  return (
    <div className={containerClasses}>
      {label && (
        <label className="shared-input-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      
      <div className="shared-input-wrapper">
        {leftIcon && (
          <div className="shared-input-icon-left">
            {leftIcon}
          </div>
        )}
        
        <input
          id={inputId}
          className={inputClasses}
          {...props}
        />
        
        {rightIcon && (
          <div className="shared-input-icon-right">
            {rightIcon}
          </div>
        )}
      </div>
      
      {error && (
        <p className="shared-input-error-text">{error}</p>
      )}
      
      {hint && !error && (
        <p className="shared-input-hint-text">{hint}</p>
      )}
    </div>
  );
};

export default Input;