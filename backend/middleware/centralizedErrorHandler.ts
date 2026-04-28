import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { logger } from '../services/logger';
import { errorTracker } from '../services/errorTracking';

export interface AppError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  details?: Record<string, unknown>;
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path?: string;
  method?: string;
  eventId?: string;
  details?: Record<string, unknown>;
  suggestions?: string[];
}

export interface ErrorLogEntry {
  timestamp: Date;
  error: AppError;
  request: {
    method: string;
    url: string;
    headers: Record<string, string | undefined>;
    body?: unknown;
    params: Record<string, string>;
    query: Record<string, unknown>;
  };
  user?: {
    id?: string;
    email?: string;
  };
  eventId?: string;
  correlationId?: string;
}

class CentralizedErrorHandler {
  private errorLog: ErrorLogEntry[] = [];
  private readonly MAX_LOG_SIZE = 1000;
  private errorCountByType: Record<string, number> = {};
  private alertThresholds = {
    validation: 10,
    authentication: 5,
    authorization: 5,
    rateLimit: 20,
    database: 3,
    internal: 1
  };

  handleError(error: AppError, req: Request): ErrorResponse {
    const statusCode = error.status || error.statusCode || 500;
    const eventId = errorTracker.captureException(error, {
      request: {
        method: req.method,
        url: req.originalUrl,
        headers: req.headers as Record<string, string>,
        body: req.body,
        params: req.params,
        query: req.query
      },
      user: (req as any).user
    });

    this.logError(error, req, eventId);
    this.trackErrorType(error);

    const response: ErrorResponse = {
      error: this.getErrorType(error),
      message: this.getUserFriendlyMessage(error, statusCode),
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method,
      eventId: process.env.NODE_ENV === 'development' ? eventId : undefined,
      details: error.details,
      suggestions: this.getSuggestions(error, statusCode)
    };

    return response;
  }

  private logError(error: AppError, req: Request, eventId?: string): void {
    const entry: ErrorLogEntry = {
      timestamp: new Date(),
      error,
      request: {
        method: req.method,
        url: req.originalUrl,
        headers: {
          'user-agent': req.get('user-agent'),
          'content-type': req.get('content-type'),
          'authorization': req.headers.authorization ? '[REDACTED]' : undefined
        },
        body: this.sanitizeBody(req.body),
        params: req.params,
        query: req.query
      },
      user: (req as any).user,
      eventId,
      correlationId: (req as any).correlationId
    };

    this.errorLog.push(entry);
    if (this.errorLog.length > this.MAX_LOG_SIZE) {
      this.errorLog.shift();
    }

    logger.logError(error, {
      correlationId: entry.correlationId,
      userId: entry.user?.id,
      url: entry.request.url,
      method: entry.request.method,
      eventId
    });
  }

  private trackErrorType(error: AppError): void {
    const errorType = this.getErrorType(error);
    this.errorCountByType[errorType] = (this.errorCountByType[errorType] || 0) + 1;

    if (this.shouldTriggerAlert(errorType)) {
      this.triggerAlert(errorType);
    }
  }

  private shouldTriggerAlert(errorType: string): boolean {
    const count = this.errorCountByType[errorType] || 0;
    const threshold = this.alertThresholds[errorType as keyof typeof this.alertThresholds] || 10;
    return count >= threshold && count % threshold === 0;
  }

  private triggerAlert(errorType: string): void {
    const count = this.errorCountByType[errorType];
    console.error(`ALERT: Error count for "${errorType}" has reached ${count}`);

    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        const axios = require('axios');
        axios.post(process.env.SLACK_WEBHOOK_URL, {
          text: `Error Alert - ${errorType}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${errorType} Error Alert*\nCount: ${count} errors\nTime: ${new Date().toISOString()}`
              }
            }
          ]
        });
      } catch (err) {
        logger.error('Failed to send error alert to Slack', { error: err instanceof Error ? err : new Error(String(err)) });
      }
    }
  }

  private getErrorType(error: AppError): string {
    if (error.name === 'ValidationError' || error.message.includes('validation')) {
      return 'validation';
    }
    if (error.name === 'UnauthorizedError' || error.message.includes('unauthorized')) {
      return 'authentication';
    }
    if (error.name === 'ForbiddenError' || error.message.includes('forbidden')) {
      return 'authorization';
    }
    if (error.status === 429 || error.message.includes('rate limit')) {
      return 'rateLimit';
    }
    if (error.code === 'P1001' || error.code === 'P1002' || error.message.includes('database')) {
      return 'database';
    }
    if (error.status === 500 || error.statusCode === 500) {
      return 'internal';
    }
    return 'general';
  }

  private getUserFriendlyMessage(error: AppError, statusCode: number): string {
    if (statusCode === 400) {
      return 'The request was invalid. Please check your input and try again.';
    }
    if (statusCode === 401) {
      return 'Authentication required. Please log in or provide valid credentials.';
    }
    if (statusCode === 403) {
      return 'You do not have permission to perform this action.';
    }
    if (statusCode === 404) {
      return 'The requested resource was not found.';
    }
    if (statusCode === 429) {
      return 'Too many requests. Please wait before trying again.';
    }
    if (statusCode === 500) {
      return 'An unexpected error occurred. Our team has been notified.';
    }
    return error.message || 'An unexpected error occurred.';
  }

  private getSuggestions(error: AppError, statusCode: number): string[] {
    const suggestions: string[] = [];

    if (statusCode === 400) {
      suggestions.push('Check the request body for invalid fields.');
      suggestions.push('Ensure all required fields are provided.');
      suggestions.push('Verify the data format matches the API requirements.');
    }
    if (statusCode === 401) {
      suggestions.push('Log in to obtain a valid authentication token.');
      suggestions.push('Check if your session has expired.');
      suggestions.push('Verify your credentials are correct.');
    }
    if (statusCode === 403) {
      suggestions.push('Contact an administrator if you believe you should have access.');
      suggestions.push('Check if your account has the required permissions.');
    }
    if (statusCode === 404) {
      suggestions.push('Verify the resource ID or endpoint is correct.');
      suggestions.push('Check if the resource has been deleted.');
    }
    if (statusCode === 429) {
      suggestions.push('Wait before making additional requests.');
      suggestions.push('Implement exponential backoff for retries.');
      suggestions.push('Consider using batch operations if available.');
    }

    return suggestions;
  }

  private sanitizeBody(body: unknown): unknown {
    if (!body) return body;
    
    const sensitiveFields = ['password', 'currentPassword', 'newPassword', 'token', 'secret', 'apiKey'];
    const sanitized = { ...body as Record<string, unknown> };
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  getErrorStats() {
    return {
      totalErrors: Object.values(this.errorCountByType).reduce((a, b) => a + b, 0),
      byType: this.errorCountByType,
      recentErrors: this.errorLog.slice(-10).reverse(),
      alertThresholds: this.alertThresholds
    };
  }

  resetStats(): void {
    this.errorCountByType = {};
  }
}

export const centralizedErrorHandler = new CentralizedErrorHandler();

export const errorHandler: ErrorRequestHandler = (error: AppError, req: Request, res: Response, next: NextFunction) => {
  const response = centralizedErrorHandler.handleError(error, req);
  
  res.status(response.statusCode).json(response);
};

export class ValidationError extends Error {
  status = 400;
  name = 'ValidationError';
  
  constructor(message: string, public details?: Record<string, unknown>) {
    super(message);
    this.details = details;
  }
}

export class AuthenticationError extends Error {
  status = 401;
  name = 'UnauthorizedError';
  
  constructor(message: string = 'Authentication required') {
    super(message);
  }
}

export class AuthorizationError extends Error {
  status = 403;
  name = 'ForbiddenError';
  
  constructor(message: string = 'Permission denied') {
    super(message);
  }
}

export class NotFoundError extends Error {
  status = 404;
  name = 'NotFoundError';
  
  constructor(resource: string) {
    super(`${resource} not found`);
  }
}

export class RateLimitError extends Error {
  status = 429;
  name = 'RateLimitError';
  details?: { retryAfter?: number };
  
  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message);
    if (retryAfter) {
      this.details = { retryAfter };
    }
  }
}

export class DatabaseError extends Error {
  status = 500;
  name = 'DatabaseError';
  code = 'DATABASE_ERROR';
  
  constructor(message: string = 'Database error occurred') {
    super(message);
  }
}

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const createError = (status: number, message: string, details?: Record<string, unknown>): AppError => {
  const error = new Error(message) as AppError;
  error.status = status;
  error.details = details;
  return error;
};

export const errorRecoveryStrategies: Record<string, () => Promise<void>> = {
  database: async () => {
    logger.info('Attempting database connection recovery');
  },
  redis: async () => {
    logger.info('Attempting Redis connection recovery');
  },
  external: async () => {
    logger.info('Attempting external service reconnection');
  }
};

export const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Attempt ${i + 1} failed, retrying...`, { errorMessage: lastError?.message });
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }
  
  throw lastError!;
};

export const getErrorStats = () => centralizedErrorHandler.getErrorStats();

export const getErrorLogs = (limit: number = 50): ErrorLogEntry[] => {
  return centralizedErrorHandler.getErrorStats().recentErrors.slice(0, limit);
};

export default centralizedErrorHandler;