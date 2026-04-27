import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { NetworkError, ErrorHandler } from '../utils/errorHandler';

interface ErrorInfo {
  id: string;
  error: NetworkError;
  timestamp: Date;
  resolved?: boolean;
}

interface ErrorContextType {
  errors: ErrorInfo[];
  addError: (error: NetworkError | any, context?: any) => string;
  removeError: (id: string) => void;
  clearErrors: () => void;
  hasErrors: boolean;
  getLatestError: () => ErrorInfo | null;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

interface ErrorProviderProps {
  children: ReactNode;
}

export const ErrorProvider: React.FC<ErrorProviderProps> = ({ children }) => {
  const [errors, setErrors] = useState<ErrorInfo[]>([]);

  const addError = useCallback((error: NetworkError | any, context?: any): string => {
    const networkError = error.type ? error : ErrorHandler.classifyError(error);
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    const errorInfo: ErrorInfo = {
      id,
      error: networkError,
      timestamp: new Date(),
      resolved: false
    };

    setErrors(prev => [...prev, errorInfo]);
    ErrorHandler.logError(networkError, context);
    
    // Auto-remove non-critical errors after 5 seconds
    if (networkError.type !== 'SERVER_ERROR' && networkError.type !== 'UNKNOWN_ERROR') {
      setTimeout(() => {
        removeError(id);
      }, 5000);
    }

    return id;
  }, []);

  const removeError = useCallback((id: string) => {
    setErrors(prev => prev.filter(error => error.id !== id));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const hasErrors = errors.length > 0;
  
  const getLatestError = useCallback(() => {
    return errors.length > 0 ? errors[errors.length - 1] : null;
  }, [errors]);

  const value: ErrorContextType = {
    errors,
    addError,
    removeError,
    clearErrors,
    hasErrors,
    getLatestError
  };

  return (
    <ErrorContext.Provider value={value}>
      {children}
    </ErrorContext.Provider>
  );
};

export const useError = (): ErrorContextType => {
  const context = useContext(ErrorContext);
  if (context === undefined) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
};

// Error Toast Component
interface ErrorToastProps {
  error: ErrorInfo;
  onClose: () => void;
}

export const ErrorToast: React.FC<ErrorToastProps> = ({ error, onClose }) => {
  const errorInfo = ErrorHandler.getErrorMessage(error.error);
  const isError = error.error.type === 'SERVER_ERROR' || error.error.type === 'UNKNOWN_ERROR';

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm animate-pulse">
      <div className={`${
        isError ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
      } border rounded-lg shadow-lg p-4`}>
        <div className="flex items-start">
          <div className={`flex-shrink-0 ${
            isError ? 'text-red-400' : 'text-yellow-400'
          }`}>
            {isError ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <CheckCircle className="h-5 w-5" />
            )}
          </div>
          <div className="ml-3 flex-1">
            <h3 className={`text-sm font-medium ${
              isError ? 'text-red-800' : 'text-yellow-800'
            }`}>
              {errorInfo.title}
            </h3>
            <p className={`mt-1 text-sm ${
              isError ? 'text-red-700' : 'text-yellow-700'
            }`}>
              {errorInfo.message}
            </p>
            {errorInfo.action && (
              <p className={`mt-1 text-xs ${
                isError ? 'text-red-600' : 'text-yellow-600'
              } font-medium`}>
                {errorInfo.action}
              </p>
            )}
          </div>
          <div className="ml-auto pl-3">
            <button
              onClick={onClose}
              className={`${
                isError ? 'text-red-400 hover:text-red-500' : 'text-yellow-400 hover:text-yellow-500'
              }`}
            >
              <span className="sr-only">Dismiss</span>
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Error Container Component
export const ErrorContainer: React.FC = () => {
  const { errors, removeError } = useError();

  if (errors.length === 0) return null;

  return (
    <>
      {errors.map(error => (
        <ErrorToast
          key={error.id}
          error={error}
          onClose={() => removeError(error.id)}
        />
      ))}
    </>
  );
};

export default ErrorContext;
