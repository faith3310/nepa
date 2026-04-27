import React, { Component, ReactNode, ErrorInfo } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
}

const ErrorFallback: React.FC<{ 
  error: Error | null; 
  onRetry: () => void; 
  errorId: string;
}> = ({ error, onRetry, errorId }) => {
  const { t } = useTranslation();

  return (
    <div className="error-boundary-fallback" style={{
      padding: '2rem',
      textAlign: 'center',
      backgroundColor: '#fee',
      border: '1px solid #fcc',
      borderRadius: '8px',
      margin: '1rem 0'
    }}>
      <h2 style={{ color: '#c33', marginBottom: '1rem' }}>
        {t('errors.general.title', 'Something went wrong')}
      </h2>
      
      <div style={{ color: '#666', marginBottom: '1.5rem' }}>
        {t('errors.general.message', 'An unexpected error occurred. Please try again.')}
      </div>

      {process.env.NODE_ENV === 'development' && error && (
        <details style={{ 
          textAlign: 'left', 
          margin: '1rem 0', 
          padding: '1rem', 
          backgroundColor: '#f9f9f9',
          borderRadius: '4px',
          border: '1px solid #ddd'
        }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
            {t('errors.details', 'Error Details')}
          </summary>
          <pre style={{ 
            fontSize: '0.875rem', 
            overflow: 'auto',
            maxHeight: '200px',
            marginTop: '0.5rem'
          }}>
            {error.stack}
          </pre>
        </details>
      )}

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={onRetry}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem'
          }}
        >
          {t('errors.retry', 'Try Again')}
        </button>
        
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem'
          }}
        >
          {t('errors.refresh', 'Refresh Page')}
        </button>
      </div>

      <div style={{ 
        fontSize: '0.75rem', 
        color: '#999', 
        marginTop: '1rem' 
      }}>
        {t('errors.reference', 'Error ID')}: {errorId}
      </div>
    </div>
  );
};

export class ErrorBoundary extends Component<Props, State> {
  private retryCount = 0;
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: this.generateErrorId()
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorId: ErrorBoundary.generateErrorId()
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // Report error to monitoring service
    this.reportError(error, errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private static generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateErrorId(): string {
    return ErrorBoundary.generateErrorId();
  }

  private async reportError(error: Error, errorInfo: ErrorInfo): Promise<void> {
    try {
      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        errorId: this.state.errorId,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        retryCount: this.retryCount
      };

      // Send to error reporting service
      if (process.env.NODE_ENV === 'production') {
        await fetch('/api/errors/report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(errorData),
        }).catch(reportError => {
          console.warn('Failed to report error:', reportError);
        });
      }

      // Store in localStorage for debugging
      const recentErrors = JSON.parse(localStorage.getItem('recentErrors') || '[]');
      recentErrors.push(errorData);
      
      // Keep only last 10 errors
      if (recentErrors.length > 10) {
        recentErrors.shift();
      }
      
      localStorage.setItem('recentErrors', JSON.stringify(recentErrors));
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  }

  private handleRetry = (): void => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: this.generateErrorId()
      });
    } else {
      // Max retries reached, refresh the page
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
          errorId={this.state.errorId}
        />
      );
    }

    return this.props.children;
  }
}

// Hook for functional components to use error boundary
export const useErrorHandler = () => {
  const handleError = (error: Error, errorInfo?: Partial<ErrorInfo>) => {
    // Generate error ID
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Log error
    console.error('Unhandled error:', error, errorInfo);
    
    // Report error
    if (process.env.NODE_ENV === 'production') {
      fetch('/api/errors/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo?.componentStack,
          errorId,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href
        })
      }).catch(reportError => {
        console.warn('Failed to report error:', reportError);
      });
    }
    
    return errorId;
  };

  return { handleError };
};

export default ErrorBoundary;
