import React from 'react';
import { useTranslation } from 'react-i18next';
import { useError } from '../contexts/ErrorContext';

interface ErrorDisplayProps {
  className?: string;
  maxErrors?: number;
  showDismiss?: boolean;
  showRetry?: boolean;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  className = '',
  maxErrors = 3,
  showDismiss = true,
  showRetry = true
}) => {
  const { t } = useTranslation();
  const { state, resolveError, recoverFromError, clearErrors } = useError();

  const activeErrors = state.errors
    .filter(error => !error.resolved)
    .slice(0, maxErrors);

  if (activeErrors.length === 0 && !state.globalError) {
    return null;
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#dc3545';
      case 'high': return '#fd7e14';
      case 'medium': return '#ffc107';
      case 'low': return '#28a745';
      default: return '#6c757d';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '⚡';
      case 'low': return 'ℹ️';
      default: return '📝';
    }
  };

  const getUserFriendlyMessage = (error: { message: string; severity: string }) => {
    const message = error.message.toLowerCase();
    
    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return t('errors.network', 'Network connection issue. Please check your internet connection.');
    }
    
    // Authentication errors
    if (message.includes('unauthorized') || message.includes('token') || message.includes('authentication')) {
      return t('errors.auth', 'Authentication issue. Please log in again.');
    }
    
    // Resource loading errors
    if (message.includes('chunk') || message.includes('loading') || message.includes('resource')) {
      return t('errors.loading', 'Resource loading failed. Please refresh the page.');
    }
    
    // Validation errors
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return t('errors.validation', 'Please check your input and try again.');
    }
    
    // Server errors
    if (message.includes('server') || message.includes('500') || message.includes('internal')) {
      return t('errors.server', 'Server issue. Please try again later.');
    }
    
    // Default message
    return t('errors.general.message', 'An unexpected error occurred. Please try again.');
  };

  const handleRetry = async (errorId?: string) => {
    await recoverFromError(errorId);
  };

  const handleDismiss = (errorId: string) => {
    resolveError(errorId);
  };

  return (
    <div className={`error-display ${className}`}>
      {/* Global Error */}
      {state.globalError && (
        <div
          className="error-alert error-global"
          style={{
            backgroundColor: getSeverityColor(state.globalError.severity),
            color: 'white',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>
              {getSeverityIcon(state.globalError.severity)}
            </span>
            <span>
              {getUserFriendlyMessage(state.globalError)}
            </span>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {showRetry && (
              <button
                onClick={() => handleRetry()}
                disabled={state.isRecovering}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: state.isRecovering ? 'not-allowed' : 'pointer',
                  opacity: state.isRecovering ? 0.6 : 1
                }}
              >
                {state.isRecovering ? t('errors.recovering', 'Recovering...') : t('errors.retry', 'Retry')}
              </button>
            )}
            
            <button
              onClick={clearGlobalError}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {t('errors.dismiss', 'Dismiss')}
            </button>
          </div>
        </div>
      )}

      {/* Individual Errors */}
      {activeErrors.map(error => (
        <div
          key={error.id}
          className="error-alert error-individual"
          style={{
            backgroundColor: getSeverityColor(error.severity),
            color: 'white',
            padding: '0.75rem',
            borderRadius: '6px',
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
            <span style={{ fontSize: '1rem' }}>
              {getSeverityIcon(error.severity)}
            </span>
            <span style={{ fontSize: '0.9rem' }}>
              {getUserFriendlyMessage(error)}
            </span>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {showRetry && (
              <button
                onClick={() => handleRetry(error.id)}
                disabled={state.isRecovering}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '4px',
                  cursor: state.isRecovering ? 'not-allowed' : 'pointer',
                  fontSize: '0.8rem',
                  opacity: state.isRecovering ? 0.6 : 1
                }}
              >
                {state.isRecovering ? t('errors.recovering', '...') : t('errors.retry', 'Retry')}
              </button>
            )}
            
            {showDismiss && (
              <button
                onClick={() => handleDismiss(error.id)}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                {t('errors.dismiss', '✕')}
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Error count indicator */}
      {state.errors.filter(e => !e.resolved).length > maxErrors && (
        <div
          className="error-more-indicator"
          style={{
            textAlign: 'center',
            padding: '0.5rem',
            fontSize: '0.8rem',
            color: '#6c757d'
          }}
        >
          {t('errors.more', '+{{count}} more errors', {
            count: state.errors.filter(e => !e.resolved).length - maxErrors
          })}
        </div>
      )}
    </div>
  );
};

export default ErrorDisplay;
