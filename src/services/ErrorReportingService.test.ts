import ErrorReportingService from './ErrorReportingService';

declare const global: any;

describe('ErrorReportingService', () => {
  const originalFetch = global.fetch;
  const originalNavigator = global.navigator;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    Object.defineProperty(global, 'navigator', {
      value: { onLine: false, userAgent: 'jest-agent' },
      configurable: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
    jest.clearAllMocks();
  });

  it('should report an error and track it in stats', async () => {
    const service = new ErrorReportingService({ enabled: true, samplingRate: 1, includeStackTrace: false, includeUserContext: false, debounceMs: 0 });
    const errorId = await service.reportError('Test failure', {
      severity: 'high',
      category: 'logic',
      context: { module: 'test' },
    });

    expect(errorId).toMatch(/^err_/);
    expect(global.fetch).not.toHaveBeenCalled();

    const stats = service.getErrorStats();
    expect(stats.totalErrors).toBe(1);
    expect(stats.errorsByCategory.logic).toBe(1);
    expect(stats.errorsBySeverity.high).toBe(1);
    expect(stats.queuedErrors).toBe(1);
  });

  it('should clear queued errors and reset stats', async () => {
    const service = new ErrorReportingService({ enabled: true, samplingRate: 1, includeStackTrace: false, includeUserContext: false, debounceMs: 0 });
    await service.reportError('Tracked failure', { category: 'network', severity: 'medium' });

    service.clearErrors();

    const stats = service.getErrorStats();
    expect(stats.totalErrors).toBe(0);
    expect(stats.queuedErrors).toBe(0);
    expect(stats.errorsByCategory).toEqual({});
    expect(stats.errorsBySeverity).toEqual({});
  });
});
