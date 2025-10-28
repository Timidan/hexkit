import React from 'react';
import '../../styles/SharedComponents.css';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'secondary' | 'accent';
  text?: string;
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'primary',
  text,
  className = ''
}) => {
  const baseClasses = [
    'shared-loading-spinner',
    `shared-loading-spinner-${size}`,
    `shared-loading-spinner-${variant}`,
  ].join(' ');

  if (text) {
    return (
      <div
        className={`shared-loading-with-text ${className}`.trim()}
        role="status"
        aria-live="polite"
      >
        <span className={baseClasses} aria-hidden="true" />
        <span className="shared-loading-text">{text}</span>
      </div>
    );
  }

  return (
    <span
      className={`${baseClasses} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    />
  );
};

export default LoadingSpinner;