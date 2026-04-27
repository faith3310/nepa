import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ErrorProvider, useError } from './contexts/ErrorContext';
import ErrorDisplay from './components/ErrorDisplay';
import { useStellar } from './hooks/useStellar';
import { WalletConnector } from './components/WalletConnector';
import { PaymentForm } from './components/PaymentForm';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import './i18n';
import './App.css';

const AppContent: React.FC = () => {
  const { t } = useTranslation();
  const { addError, setGlobalError } = useError();
  const { address, status, error, connectWallet, sendPayment } = useStellar();

  useEffect(() => {
    // Handle global errors from Stellar hook
    if (error) {
      addError({
        message: error,
        severity: 'high',
        context: { component: 'Stellar', action: 'wallet_operation' }
      });
    }
  }, [error, addError]);

  useEffect(() => {
    // Setup global error handlers
    const handleUnhandledError = (event: ErrorEvent) => {
      setGlobalError({
        message: event.message,
        severity: 'critical'
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      setGlobalError({
        message: event.reason?.message || 'Unhandled promise rejection',
        severity: 'critical'
      });
    };

    window.addEventListener('error', handleUnhandledError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleUnhandledError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [setGlobalError]);

  return (
    <div className="app-container">
      <ErrorDisplay />
      
      <header>
        <h1>{t('app.header')}</h1>
        <LanguageSwitcher />
        <ErrorBoundary fallback={
          <div style={{ padding: '1rem', textAlign: 'center' }}>
            {t('errors.wallet_component', 'Wallet component temporarily unavailable')}
          </div>
        }>
          <WalletConnector address={address} onConnect={connectWallet} />
        </ErrorBoundary>
      </header>

      <main>
        {status === 'success' && (
          <div className="alert success">{t('payment.success')}</div>
        )}

        <section className="card">
          <h2>{t('payment.title')}</h2>
          <ErrorBoundary>
            <PaymentForm 
              onSubmit={sendPayment} 
              isLoading={status === 'loading'} 
            />
          </ErrorBoundary>
        </section>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ErrorProvider>
      <ErrorBoundary
        onError={(error, errorInfo) => {
          console.error('App-level error:', error, errorInfo);
        }}
      >
        <AppContent />
      </ErrorBoundary>
    </ErrorProvider>
  );
};

export default App;
