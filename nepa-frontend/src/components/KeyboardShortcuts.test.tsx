import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeyboardShortcuts from './KeyboardShortcuts';

// Mock window.location
const mockLocation = {
  href: '',
  assign: jest.fn(),
  replace: jest.fn(),
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

describe('KeyboardShortcuts Component', () => {
  beforeEach(() => {
    mockLocation.href = '';
    jest.clearAllMocks();
  });

  test('renders help modal when triggered', () => {
    render(<KeyboardShortcuts />);
    
    // Press ? to open help
    fireEvent.keyDown(document, { key: '?' });
    
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });

  test('closes help modal on Escape key', async () => {
    render(<KeyboardShortcuts />);
    
    // Open help modal
    fireEvent.keyDown(document, { key: '?' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    
    // Press Escape to close
    fireEvent.keyDown(document, { key: 'Escape' });
    
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('closes help modal when clicking outside', async () => {
    render(<KeyboardShortcuts />);
    
    // Open help modal
    fireEvent.keyDown(document, { key: '?' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    
    // Click outside to close
    fireEvent.mouseDown(document.body);
    
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('navigates to dashboard with g+d shortcut', () => {
    render(<KeyboardShortcuts />);
    
    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'd' });
    
    expect(mockLocation.href).toBe('/dashboard');
  });

  test('navigates to settings with g+s shortcut', () => {
    render(<KeyboardShortcuts />);
    
    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 's' });
    
    expect(mockLocation.href).toBe('/settings');
  });

  test('focuses search input with / shortcut', () => {
    // Create a mock search input
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'search here';
    document.body.appendChild(searchInput);
    
    render(<KeyboardShortcuts />);
    
    fireEvent.keyDown(document, { key: '/' });
    
    expect(document.activeElement).toBe(searchInput);
    
    // Cleanup
    document.body.removeChild(searchInput);
  });

  test('triggers custom shortcuts', () => {
    const customAction = jest.fn();
    const customShortcuts = [
      {
        id: 'test-shortcut',
        keys: ['t'],
        description: 'Test shortcut',
        action: customAction,
        category: 'Test',
      },
    ];

    render(<KeyboardShortcuts shortcuts={customShortcuts} />);
    
    fireEvent.keyDown(document, { key: 't' });
    
    expect(customAction).toHaveBeenCalled();
  });

  test('displays shortcut categories', () => {
    render(<KeyboardShortcuts />);
    
    // Open help modal
    fireEvent.keyDown(document, { key: '?' });
    
    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  test('formats shortcut keys correctly', () => {
    render(<KeyboardShortcuts />);
    
    // Open help modal
    fireEvent.keyDown(document, { key: '?' });
    
    expect(screen.getByText('Esc')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + K')).toBeInTheDocument();
    expect(screen.getByText('Cmd + K')).toBeInTheDocument();
  });

  test('handles Ctrl+K shortcut', () => {
    render(<KeyboardShortcuts />);
    
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    
    // Should open help modal (same as ? shortcut)
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('handles Cmd+K shortcut', () => {
    render(<KeyboardShortcuts />);
    
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    
    // Should open help modal (same as ? shortcut)
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('does not trigger shortcuts when typing in input', () => {
    const customAction = jest.fn();
    const customShortcuts = [
      {
        id: 'test-shortcut',
        keys: ['t'],
        description: 'Test shortcut',
        action: customAction,
      },
    ];

    render(
      <div>
        <input type="text" data-testid="test-input" />
        <KeyboardShortcuts shortcuts={customShortcuts} />
      </div>
    );
    
    const input = screen.getByTestId('test-input');
    input.focus();
    
    fireEvent.keyDown(input, { key: 't' });
    
    expect(customAction).not.toHaveBeenCalled();
  });

  test('dispatches custom events for actions', () => {
    const newTransactionHandler = jest.fn();
    const refreshDataHandler = jest.fn();
    
    window.addEventListener('new-transaction', newTransactionHandler);
    window.addEventListener('refresh-data', refreshDataHandler);
    
    render(<KeyboardShortcuts />);
    
    // Trigger new transaction shortcut
    fireEvent.keyDown(document, { key: 'n' });
    fireEvent.keyDown(document, { key: 't' });
    expect(newTransactionHandler).toHaveBeenCalled();
    
    // Trigger refresh shortcut
    fireEvent.keyDown(document, { key: 'r' });
    expect(refreshDataHandler).toHaveBeenCalled();
    
    // Cleanup
    window.removeEventListener('new-transaction', newTransactionHandler);
    window.removeEventListener('refresh-data', refreshDataHandler);
  });

  test('has proper accessibility attributes', () => {
    render(<KeyboardShortcuts />);
    
    // Open help modal
    fireEvent.keyDown(document, { key: '?' });
    
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'shortcuts-title');
    
    expect(screen.getByText('Keyboard Shortcuts')).toHaveAttribute('id', 'shortcuts-title');
  });

  test('announces pressed keys for screen readers', () => {
    render(<KeyboardShortcuts />);
    
    fireEvent.keyDown(document, { key: 'a' });
    
    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toBeInTheDocument();
  });
});
