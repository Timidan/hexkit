import React from 'react';
import { Loader2Icon } from '../icons/IconLibrary';
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
  const spinnerClasses = [
    'shared-loading-spinner',
    `shared-loading-spinner-${size}`,
    `shared-loading-spinner-${variant}`,
    className
  ].filter(Boolean).join(' ');

  if (text) {
    return (
      <div className="shared-loading-with-text">
        <Loader2Icon className={spinnerClasses} />
        <span className="shared-loading-text">{text}</span>
      </div>
    );
  }

  return <Loader2Icon className={spinnerClasses} />;
};

export default LoadingSpinner;