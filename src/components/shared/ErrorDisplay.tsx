import React from 'react';
import { XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './Button';
import Card from './Card';
import '../../styles/SharedComponents.css';

export interface ErrorDisplayProps {
  error: string | Error;
  title?: string;
  variant?: 'inline' | 'card' | 'banner';
  showRetry?: boolean;
  onRetry?: () => void;
  className?: string;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  title = 'Error',
  variant = 'inline',
  showRetry = false,
  onRetry,
  className = ''
}) => {
  const errorMessage = error instanceof Error ? error.message : error;

  const InlineError = () => (
    <div className={`shared-error-inline ${className}`}>
      <XCircle className="shared-error-icon" />
      <div className="shared-error-content">
        <p className="shared-error-title">{title}</p>
        <p className="shared-error-message">{errorMessage}</p>
        {showRetry && onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            icon={<RefreshCw size={12} />}
            style={{ 
              marginTop: 'var(--space-2)', 
              color: 'var(--error)', 
              borderColor: 'rgba(255, 0, 64, 0.3)' 
            }}
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  );

  const CardError = () => (
    <Card 
      variant="default" 
      className={className}
      style={{ 
        borderColor: 'rgba(255, 0, 64, 0.3)', 
        background: 'rgba(255, 0, 64, 0.05)' 
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <XCircle style={{ 
          width: '1.5rem', 
          height: '1.5rem', 
          color: 'var(--error)', 
          flexShrink: 0, 
          marginTop: 'var(--space-1)' 
        }} />
        <div style={{ flex: 1 }}>
          <h4 style={{ 
            fontSize: 'var(--text-base)', 
            fontWeight: 'var(--font-weight-semibold)', 
            color: 'var(--error)', 
            marginBottom: 'var(--space-2)' 
          }}>
            {title}
          </h4>
          <p style={{ 
            fontSize: 'var(--text-sm)', 
            color: 'var(--text-secondary)', 
            marginBottom: 'var(--space-4)' 
          }}>
            {errorMessage}
          </p>
          {showRetry && onRetry && (
            <Button
              variant="primary"
              size="sm"
              onClick={onRetry}
              icon={<RefreshCw size={16} />}
              style={{ background: 'var(--error)' }}
            >
              Try Again
            </Button>
          )}
        </div>
      </div>
    </Card>
  );

  const BannerError = () => (
    <div className={`shared-error-banner ${className}`}>
      <div className="shared-error-banner-content">
        <AlertTriangle className="shared-error-banner-icon" />
        <div className="shared-error-banner-text">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h4 className="shared-error-banner-title">{title}</h4>
              <p className="shared-error-banner-message">{errorMessage}</p>
            </div>
            {showRetry && onRetry && (
              <Button
                variant="primary"
                size="sm"
                onClick={onRetry}
                icon={<RefreshCw size={16} />}
                style={{ background: 'var(--error)' }}
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  switch (variant) {
    case 'card':
      return <CardError />;
    case 'banner':
      return <BannerError />;
    default:
      return <InlineError />;
  }
};

export default ErrorDisplay;