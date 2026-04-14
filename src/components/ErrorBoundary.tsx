import React, { Component } from 'react';
import type { ReactNode } from 'react';
import { Warning, ArrowsClockwise } from '@phosphor-icons/react';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '20px',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          background: 'rgba(239, 68, 68, 0.05)',
          textAlign: 'center',
          margin: '20px 0'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '16px',
            color: '#ef4444'
          }}>
            <Warning size={24} />
            <h3 style={{ margin: 0, fontSize: '19px' }}>Something went wrong</h3>
          </div>
          
          <p style={{ 
            color: '#6b7280', 
            marginBottom: '16px',
            fontSize: '15px' 
          }}>
            This component encountered an error. Please try refreshing or contact support if the problem persists.
          </p>

          {this.state.error && (
            <details style={{ marginBottom: '16px', textAlign: 'left' }}>
              <summary style={{ 
                cursor: 'pointer', 
                color: '#6b7280', 
                fontSize: '13px',
                marginBottom: '8px'
              }}>
                Technical Details
              </summary>
              <pre style={{
                background: '#f3f4f6',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '11px',
                overflow: 'auto',
                color: '#374151'
              }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}

          <Button
            type="button"
            variant="default"
            onClick={() => {
              this.setState({ hasError: false, error: undefined });
              window.location.reload();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              margin: '0 auto'
            }}
          >
            <ArrowsClockwise size={16} />
            Refresh Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
