import React from 'react';
import { CircleX, TriangleAlert, RefreshCw } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

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
  const Icon = variant === 'banner' ? TriangleAlert : CircleX;

  return (
    <Alert variant="destructive" className={cn(className)}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{errorMessage}</p>
        {showRetry && onRetry && (
          <Button
            variant={variant === 'inline' ? 'ghost' : 'destructive'}
            size="sm"
            onClick={onRetry}
            className="mt-2"
          >
            <RefreshCw className="h-3 w-3" />
            {variant === 'card' ? 'Try Again' : 'Retry'}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};

export default ErrorDisplay;
