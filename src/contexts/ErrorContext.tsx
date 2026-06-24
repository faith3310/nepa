import { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { getErrorReportingService } from '../services/ErrorReportingService';

export interface ErrorState {
  errors: Array<{
    id: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: string;
    resolved: boolean;
    context?: Record<string, any>;
  }>;
  isRecovering: boolean;
  recoveryAttempts: number;
  globalError: {
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: string;
  } | null;
}

export interface ErrorContextValue {
  state: ErrorState;
  addError: (error: {
    message: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    context?: Record<string, any>;
  }) => string;
  resolveError: (errorId: string) => void;
  clearErrors: () => void;
  recoverFromError: (errorId?: string) => Promise<void>;
  setGlobalError: (error: {
    message: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  }) => void;
  clearGlobalError: () => void;
}

type ErrorAction =
  | { type: 'ADD_ERROR'; payload: ErrorState['errors'][0] }
  | { type: 'RESOLVE_ERROR'; payload: string }
  | { type: 'CLEAR_ERRORS' }
  | { type: 'SET_RECOVERING'; payload: boolean }
  | { type: 'INCREMENT_RECOVERY_ATTEMPTS' }
  | { type: 'SET_GLOBAL_ERROR'; payload: ErrorState['globalError'] }
  | { type: 'CLEAR_GLOBAL_ERROR' };

const initialState: ErrorState = {
  errors: [],
  isRecovering: false,
  recoveryAttempts: 0,
  globalError: null
};

function errorReducer(state: ErrorState, action: ErrorAction): ErrorState {
  switch (action.type) {
    case 'ADD_ERROR':
      return {
        ...state,
        errors: [...state.errors, action.payload]
      };

    case 'RESOLVE_ERROR':
      return {
        ...state,
        errors: state.errors.map(error =>
          error.id === action.payload ? { ...error, resolved: true } : error
        )
      };

    case 'CLEAR_ERRORS':
      return {
        ...state,
        errors: [],
        recoveryAttempts: 0
      };

    case 'SET_RECOVERING':
      return {
        ...state,
        isRecovering: action.payload
      };

    case 'INCREMENT_RECOVERY_ATTEMPTS':
      return {
        ...state,
        recoveryAttempts: state.recoveryAttempts + 1
      };

    case 'SET_GLOBAL_ERROR':
      return {
        ...state,
        globalError: action.payload
      };

    case 'CLEAR_GLOBAL_ERROR':
      return {
        ...state,
        globalError: null
      };

    default:
      return state;
  }
}

const ErrorContext = createContext<ErrorContextValue | undefined>(undefined);

interface ErrorProviderProps {
  children: ReactNode;
}

export const ErrorProvider: React.FC<ErrorProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(errorReducer, initialState);
  const errorReportingService = getErrorReportingService();

  const addError = useCallback((error: {
    message: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    context?: Record<string, any>;
  }): string => {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newError = {
      id: errorId,
      message: error.message,
      severity: error.severity || 'medium',
      timestamp: new Date().toISOString(),
      resolved: false,
      context: error.context
    };

    dispatch({ type: 'ADD_ERROR', payload: newError });

    // Report to error service
    errorReportingService.reportError(error.message, {
      severity: error.severity,
      category: 'user_input',
      context: error.context
    });

    return errorId;
  }, [errorReportingService]);

  const resolveError = useCallback((errorId: string) => {
    dispatch({ type: 'RESOLVE_ERROR', payload: errorId });
  }, []);

  const clearErrors = useCallback(() => {
    dispatch({ type: 'CLEAR_ERRORS' });
    errorReportingService.clearErrors();
  }, [errorReportingService]);

  const recoverFromError = useCallback(async (errorId?: string) => {
    dispatch({ type: 'SET_RECOVERING', payload: true });
    dispatch({ type: 'INCREMENT_RECOVERY_ATTEMPTS' });

    try {
      // Attempt different recovery strategies based on error type
      if (errorId) {
        const error = state.errors.find(e => e.id === errorId);
        if (error) {
          await performErrorRecovery(error);
        }
      } else {
        // General recovery
        await performGeneralRecovery();
      }

      // Mark error as resolved if it exists
      if (errorId) {
        resolveError(errorId);
      }

      // Clear global error if set
      if (state.globalError) {
        dispatch({ type: 'CLEAR_GLOBAL_ERROR' });
      }

    } catch (recoveryError) {
      console.error('Error recovery failed:', recoveryError);

      const errorMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
      
      // Add recovery error
      addError({
        message: 'Failed to recover from error. Please refresh the page.',
        severity: 'high',
        context: { originalError: errorId, recoveryError: errorMessage }
      });
    } finally {
      dispatch({ type: 'SET_RECOVERING', payload: false });
    }
  }, [state.errors, state.globalError, addError, resolveError]);

  const setGlobalError = useCallback((error: {
    message: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  }) => {
    const globalError = {
      message: error.message,
      severity: error.severity || 'medium',
      timestamp: new Date().toISOString()
    };

    dispatch({ type: 'SET_GLOBAL_ERROR', payload: globalError });

    // Report to error service
    errorReportingService.reportError(error.message, {
      severity: error.severity,
      category: 'system',
      context: { type: 'global_error' }
    });
  }, [errorReportingService]);

  const clearGlobalError = useCallback(() => {
    dispatch({ type: 'CLEAR_GLOBAL_ERROR' });
  }, []);

  const value: ErrorContextValue = {
    state,
    addError,
    resolveError,
    clearErrors,
    recoverFromError,
    setGlobalError,
    clearGlobalError
  };

  return (
    <ErrorContext.Provider value={value}>
      {children}
    </ErrorContext.Provider>
  );
};

export const useError = (): ErrorContextValue => {
  const context = useContext(ErrorContext);
  if (context === undefined) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
};

// Recovery strategies
async function performErrorRecovery(error: ErrorState['errors'][0]): Promise<void> {
  const { message, context } = error;

  // Network error recovery
  if (message.toLowerCase().includes('network') || 
      message.toLowerCase().includes('fetch') ||
      message.toLowerCase().includes('connection')) {
    await networkErrorRecovery();
    return;
  }

  // Authentication error recovery
  if (message.toLowerCase().includes('unauthorized') || 
      message.toLowerCase().includes('token') ||
      message.toLowerCase().includes('authentication')) {
    await authErrorRecovery();
    return;
  }

  // Resource loading error recovery
  if (message.toLowerCase().includes('chunk') || 
      message.toLowerCase().includes('loading') ||
      message.toLowerCase().includes('resource')) {
    await resourceErrorRecovery();
    return;
  }

  // Generic recovery
  await performGeneralRecovery();
}

async function networkErrorRecovery(): Promise<void> {
  // Check if we're back online
  if (navigator.onLine) {
    // Retry the last failed request if we have context
    console.log('Network recovered, attempting to retry operations');
  } else {
    throw new Error('Still offline - cannot recover network errors');
  }
}

async function authErrorRecovery(): Promise<void> {
  // Clear potentially invalid tokens
  try {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    sessionStorage.removeItem('authToken');
    
    // Redirect to login if needed
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  } catch (error) {
    console.error('Auth recovery failed:', error);
  }
}

async function resourceErrorRecovery(): Promise<void> {
  // Try to clear caches and reload
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    
    // Clear service worker cache
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
  } catch (error) {
    console.error('Resource recovery failed:', error);
  }
}

async function performGeneralRecovery(): Promise<void> {
  // Generic recovery attempts
  const attempts = [
    // Clear localStorage items that might be corrupted
    () => {
      const keysToKeep = ['userId', 'preferences', 'theme'];
      const allKeys = Object.keys(localStorage);
      const keysToRemove = allKeys.filter(key => !keysToKeep.includes(key));
      keysToRemove.forEach(key => localStorage.removeItem(key));
    },
    
    // Clear sessionStorage
    () => sessionStorage.clear(),
    
    // Reset application state
    () => {
      // Dispatch custom event for app reset
      window.dispatchEvent(new CustomEvent('app:reset'));
    }
  ];

  for (const attempt of attempts) {
    try {
      attempt();
      break; // Stop after first successful attempt
    } catch (error) {
      console.warn('Recovery attempt failed:', error);
    }
  }
}

export default ErrorContext;
