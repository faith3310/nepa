/**
 * Frontend Error Reporting Service
 * Handles error collection, filtering, and reporting to external services
 * Browser-compatible version of backend's ErrorReportingService
 */

export interface ErrorReport {
  id: string;
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: string;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'network' | 'rendering' | 'logic' | 'user_input' | 'system';
  context?: Record<string, any>;
  retryCount?: number;
}

declare const process: {
  env: {
    NODE_ENV?: string;
    REACT_APP_ERROR_REPORTING_ENDPOINT?: string;
    REACT_APP_ERROR_REPORTING_API_KEY?: string;
  };
} | undefined;

export interface ErrorReportingConfig {
  enabled: boolean;
  endpoint: string;
  apiKey?: string;
  maxErrorsPerSession: number;
  samplingRate: number;
  includeStackTrace: boolean;
  includeUserContext: boolean;
  debounceMs: number;
}

class ErrorReportingService {
  private config: ErrorReportingConfig;
  private errorQueue: ErrorReport[] = [];
  private errorCounts = new Map<string, number>();
  private lastErrorTime = new Map<string, number>();
  private sessionId: string;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  constructor(config: Partial<ErrorReportingConfig> = {}) {
    const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
    
    this.config = {
      enabled: typeof process !== 'undefined' && process.env.NODE_ENV === 'production',
      endpoint: typeof process !== 'undefined' ? (process.env.REACT_APP_ERROR_REPORTING_ENDPOINT || '/api/errors/report') : '/api/errors/report',
      apiKey: typeof process !== 'undefined' ? process.env.REACT_APP_ERROR_REPORTING_API_KEY : undefined,
      maxErrorsPerSession: 50,
      samplingRate: 1.0,
      includeStackTrace: true,
      includeUserContext: true,
      debounceMs: 1000,
      ...config
    };

    this.sessionId = this.generateSessionId();
    this.setupEventListeners();
    this.startReportingInterval();
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') {
      return; // Not in browser environment
    }

    // Track online/offline status
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushErrorQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      this.reportError(event.reason, {
        category: 'system',
        severity: 'high',
        context: { type: 'unhandled_promise_rejection' }
      });
    });

    // Track global errors
    window.addEventListener('error', (event: ErrorEvent) => {
      const error = event.error || new Error(event.message);
      this.reportError(error, {
        category: 'system',
        severity: 'high',
        context: {
          type: 'global_error',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      });
    });
  }

  private startReportingInterval(): void {
    if (typeof setInterval === 'undefined') {
      return; // Not in browser environment
    }

    // Report queued errors every 30 seconds
    setInterval(() => {
      this.flushErrorQueue();
    }, 30000);
  }

  /**
   * Report an error to the monitoring service
   */
  async reportError(
    error: Error | string,
    options: {
      severity?: 'low' | 'medium' | 'high' | 'critical';
      category?: 'network' | 'rendering' | 'logic' | 'user_input' | 'system';
      context?: Record<string, any>;
      componentStack?: string;
      retryCount?: number;
    } = {}
  ): Promise<string | null> {
    if (!this.config.enabled) {
      return null;
    }

    // Apply sampling rate
    if (Math.random() > this.config.samplingRate) {
      return null;
    }

    const errorObj = typeof error === 'string' ? new Error(error) : error;
    const errorId = this.generateErrorId(errorObj.message);

    // Check debounce and rate limiting
    if (this.shouldDebounceError(errorId, errorObj.message)) {
      return null;
    }

    // Check session error limit
    if (this.errorQueue.length >= this.config.maxErrorsPerSession) {
      console.warn('Error reporting limit reached for session');
      return null;
    }

    const errorReport: ErrorReport = {
      id: errorId,
      message: errorObj.message,
      stack: this.config.includeStackTrace ? errorObj.stack : undefined,
      componentStack: options.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      sessionId: this.sessionId,
      severity: options.severity || this.determineSeverity(errorObj),
      category: options.category || 'logic',
      context: options.context,
      retryCount: options.retryCount
    };

    // Add user context if enabled
    if (this.config.includeUserContext) {
      errorReport.userId = this.getUserId();
    }

    this.errorQueue.push(errorReport);
    this.updateErrorTracking(errorId, errorObj.message);

    // Try to send immediately if online
    if (this.isOnline) {
      await this.sendError(errorReport);
    }

    return errorId;
  }

  private generateErrorId(message: string): string {
    const hash = this.simpleHash(message);
    return `err_${Date.now()}_${hash}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private shouldDebounceError(errorId: string, message: string): boolean {
    const now = Date.now();
    const lastTime = this.lastErrorTime.get(message);

    // Debounce identical errors within the configured time window
    if (lastTime && (now - lastTime) < this.config.debounceMs) {
      return true;
    }

    // Check if we've seen this error too many times
    const count = this.errorCounts.get(message) || 0;
    if (count >= 10) {
      // Max 10 occurrences of the same error
      return true;
    }

    return false;
  }

  private updateErrorTracking(errorId: string, message: string): void {
    const count = this.errorCounts.get(message) || 0;
    this.errorCounts.set(message, count + 1);
    this.lastErrorTime.set(message, Date.now());
  }

  private determineSeverity(error: Error): 'low' | 'medium' | 'high' | 'critical' {
    const message = error.message.toLowerCase();

    // Critical errors
    if (
      message.includes('chunkload') ||
      message.includes('loading chunk') ||
      message.includes('network') ||
      message.includes('fetch')
    ) {
      return 'critical';
    }

    // High severity errors
    if (
      message.includes('cannot read') ||
      message.includes('undefined') ||
      message.includes('null') ||
      message.includes('type error')
    ) {
      return 'high';
    }

    // Medium severity errors
    if (
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('failed to')
    ) {
      return 'medium';
    }

    return 'low';
  }

  private async sendError(errorReport: ErrorReport): Promise<void> {
    try {
      if (typeof fetch === 'undefined') {
        return; // Not in browser environment
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(errorReport),
        keepalive: true // Keep connection alive for error reporting
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Remove from queue on successful send
      const index = this.errorQueue.findIndex(e => e.id === errorReport.id);
      if (index !== -1) {
        this.errorQueue.splice(index, 1);
      }
    } catch (sendError) {
      console.warn('Failed to send error report:', sendError);
      // Keep in queue for retry
    }
  }

  private async flushErrorQueue(): Promise<void> {
    if (!this.isOnline || this.errorQueue.length === 0) {
      return;
    }

    const errorsToSend = [...this.errorQueue];
    const sendPromises = errorsToSend.map(error => this.sendError(error));

    await Promise.allSettled(sendPromises);
  }

  private getUserId(): string | undefined {
    // Try to get user ID from various sources
    try {
      if (typeof localStorage === 'undefined') {
        return undefined;
      }

      // Check localStorage
      const userId = localStorage.getItem('userId');
      if (userId) return userId;

      // Check sessionStorage
      if (typeof sessionStorage !== 'undefined') {
        const sessionUserId = sessionStorage.getItem('userId');
        if (sessionUserId) return sessionUserId;
      }

      // Check cookies
      if (typeof document !== 'undefined') {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'userId') return value;
        }
      }
    } catch (error) {
      // Ignore cookie/localStorage access errors
    }

    return undefined;
  }

  /**
   * Get error statistics for the current session
   */
  getErrorStats(): {
    totalErrors: number;
    queuedErrors: number;
    errorsByCategory: Record<string, number>;
    errorsBySeverity: Record<string, number>;
  } {
    const errorsByCategory: Record<string, number> = {};
    const errorsBySeverity: Record<string, number> = {};

    for (const error of this.errorQueue) {
      errorsByCategory[error.category] = (errorsByCategory[error.category] || 0) + 1;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
    }

    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
      queuedErrors: this.errorQueue.length,
      errorsByCategory,
      errorsBySeverity
    };
  }

  /**
   * Clear all queued errors
   */
  clearErrors(): void {
    this.errorQueue = [];
    this.errorCounts.clear();
    this.lastErrorTime.clear();
  }

  /**
   * Enable/disable error reporting
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ErrorReportingConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton instance
let errorReportingService: ErrorReportingService | null = null;

export function getErrorReportingService(): ErrorReportingService {
  if (!errorReportingService) {
    errorReportingService = new ErrorReportingService();
  }
  return errorReportingService;
}

export default ErrorReportingService;
