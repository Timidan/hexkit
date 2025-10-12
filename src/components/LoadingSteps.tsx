import React from 'react';
import { PendingIcon, ActiveIcon, CompletedIcon, ErrorIcon } from './icons/IconLibrary';

interface LoadingStep {
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  detail?: string;
}

interface LoadingStepsProps {
  steps: LoadingStep[];
  title?: string;
  className?: string;
}

const LoadingSteps: React.FC<LoadingStepsProps> = ({
  steps,
  title = 'Processing...',
  className = '',
}) => {
  const getStepIcon = (status: LoadingStep['status']) => {
    switch (status) {
      case 'pending':
        return <PendingIcon width={16} height={16} />;
      case 'active':
        return <ActiveIcon width={16} height={16} />;
      case 'completed':
        return <CompletedIcon width={16} height={16} />;
      case 'error':
        return <ErrorIcon width={16} height={16} />;
      default:
        return <PendingIcon width={16} height={16} />;
    }
  };

  const getStepClass = (status: LoadingStep['status']) => {
    switch (status) {
      case 'pending':
        return 'step-pending';
      case 'active':
        return 'step-active';
      case 'completed':
        return 'step-completed';
      case 'error':
        return 'step-error';
      default:
        return 'step-pending';
    }
  };

  return (
    <div className={`loading-steps ${className}`}>
      <div className="loading-title">
        <span className="loading-icon">
          <ActiveIcon width={16} height={16} />
        </span>
        {title}
      </div>
      
      <div className="steps-list">
        {steps.map((step, index) => (
          <div key={index} className={`step-item ${getStepClass(step.status)}`}>
            <div className="step-indicator">
              <span className="step-icon">{getStepIcon(step.status)}</span>
              <span className="step-number">{index + 1}</span>
            </div>
            
            <div className="step-content">
              <div className="step-label">{step.label}</div>
              {step.detail && (
                <div className="step-detail">{step.detail}</div>
              )}
            </div>
            
            {step.status === 'active' && (
              <div className="step-spinner">
                <div className="spinner"></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoadingSteps;
