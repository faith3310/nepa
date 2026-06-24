import React, { useEffect, useRef } from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorProvider, useError } from './ErrorContext';

const mockReportError = jest.fn(async () => 'err_mock');
const mockClearErrors = jest.fn();

jest.mock('../services/ErrorReportingService', () => ({
  getErrorReportingService: () => ({
    reportError: mockReportError,
    clearErrors: mockClearErrors,
  }),
}));

afterEach(() => {
  mockReportError.mockClear();
  mockClearErrors.mockClear();
});

type ErrorInput = {
  message: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
};

function TestConsumer({ error }: { error: ErrorInput }) {
  const { state, addError, clearErrors } = useError();
  const hasAddedError = useRef(false);

  useEffect(() => {
    if (!hasAddedError.current) {
      addError(error);
      hasAddedError.current = true;
    }
  }, [addError, error]);

  return (
    <div>
      <div data-testid="error-count">{state.errors.length}</div>
      <button type="button" onClick={clearErrors}>Clear</button>
    </div>
  );
}

describe('ErrorContext', () => {
  it('adds an error and reports it via ErrorReportingService', async () => {
    render(
      <ErrorProvider>
        <TestConsumer error={{ message: 'Sample error', severity: 'high' }} />
      </ErrorProvider>
    );

    expect(await screen.findByTestId('error-count')).toHaveProperty('textContent', '1');
    expect(mockReportError).toHaveBeenCalledWith('Sample error', expect.objectContaining({ severity: 'high' }));
  });

  it('calls clearErrors on the error reporting service when clearing errors', async () => {
    render(
      <ErrorProvider>
        <TestConsumer error={{ message: 'Another error', severity: 'low' }} />
      </ErrorProvider>
    );

    const clearButton = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearButton);

    expect(mockClearErrors).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('error-count')).toHaveProperty('textContent', '0');
  });
});
