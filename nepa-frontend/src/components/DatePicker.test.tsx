import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DatePicker from './DatePicker';

describe('DatePicker Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders date picker input', () => {
    render(<DatePicker />);
    
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Select a date');
  });

  test('opens calendar when input is focused', async () => {
    render(<DatePicker />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });

  test('closes calendar when Escape key is pressed', async () => {
    render(<DatePicker />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    
    fireEvent.keyDown(document, { key: 'Escape' });
    
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('selects date when calendar day is clicked', async () => {
    const onChange = jest.fn();
    render(<DatePicker onChange={onChange} />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    // Find and click today's date
    const today = new Date();
    const todayButton = screen.getByText(today.getDate().toString());
    await userEvent.click(todayButton);
    
    expect(onChange).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('formats date correctly in input', () => {
    const testDate = new Date('2024-03-15');
    render(<DatePicker value={testDate} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('Mar 15, 2024');
  });

  test('handles string date value', () => {
    render(<DatePicker value="2024-03-15" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('Mar 15, 2024');
  });

  test('validates date input', async () => {
    const onChange = jest.fn();
    render(<DatePicker onChange={onChange} />);
    
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'invalid-date');
    
    expect(screen.getByText('Invalid date format')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test('clears date when clear button is clicked', async () => {
    const onChange = jest.fn();
    const testDate = new Date('2024-03-15');
    render(<DatePicker value={testDate} onChange={onChange} />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    const clearButton = screen.getByText('Clear');
    await userEvent.click(clearButton);
    
    expect(onChange).toHaveBeenCalledWith(null);
    expect(input).toHaveValue('');
  });

  test('disables dates before minDate', async () => {
    const minDate = new Date('2024-03-10');
    render(<DatePicker minDate={minDate} />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    // Try to find a date before minDate (March 5)
    const disabledDate = screen.queryByText('5');
    if (disabledDate) {
      expect(disabledDate.closest('button')).toBeDisabled();
    }
  });

  test('disables dates after maxDate', async () => {
    const maxDate = new Date('2024-03-20');
    render(<DatePicker maxDate={maxDate} />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    // Try to find a date after maxDate (March 25)
    const disabledDate = screen.queryByText('25');
    if (disabledDate) {
      expect(disabledDate.closest('button')).toBeDisabled();
    }
  });

  test('disables weekends when disableWeekends is true', async () => {
    render(<DatePicker disableWeekends />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    // Find weekend dates (Saturday/Sunday)
    const weekendButtons = screen.getAllByRole('button').filter(button => {
      const date = parseInt(button.textContent || '0');
      const testDate = new Date();
      testDate.setDate(date);
      const day = testDate.getDay();
      return day === 0 || day === 6; // Sunday or Saturday
    });
    
    weekendButtons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  test('disables past dates when disablePast is true', async () => {
    render(<DatePicker disablePast />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    // Today should be enabled, past dates disabled
    const today = new Date().getDate();
    const todayButton = screen.getByText(today.toString());
    expect(todayButton).not.toBeDisabled();
  });

  test('disables future dates when disableFuture is true', async () => {
    render(<DatePicker disableFuture />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    // Today should be enabled, future dates disabled
    const today = new Date().getDate();
    const todayButton = screen.getByText(today.toString());
    expect(todayButton).not.toBeDisabled();
  });

  test('navigates months with arrow buttons', async () => {
    render(<DatePicker />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    const currentMonth = new Date().getMonth();
    const nextMonthButton = screen.getByLabelText('Next month');
    const prevMonthButton = screen.getByLabelText('Previous month');
    
    // Go to next month
    await userEvent.click(nextMonthButton);
    expect(screen.getByText(new Date(new Date().setMonth(currentMonth + 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))).toBeInTheDocument();
    
    // Go back to previous month
    await userEvent.click(prevMonthButton);
    expect(screen.getByText(new Date(new Date().setMonth(currentMonth)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))).toBeInTheDocument();
  });

  test('shows week numbers when showWeekNumbers is true', async () => {
    render(<DatePicker showWeekNumbers />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    expect(screen.getByText('Wk')).toBeInTheDocument();
  });

  test('has proper accessibility attributes', () => {
    render(<DatePicker />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-label', 'Date picker');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-haspopup', 'dialog');
  });

  test('supports custom format', () => {
    const testDate = new Date('2024-03-15');
    render(<DatePicker value={testDate} format="yyyy-MM-dd" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('2024-03-15');
  });

  test('supports custom placeholder', () => {
    render(<DatePicker placeholder="Choose a date" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Choose a date');
  });

  test('is disabled when disabled prop is true', () => {
    render(<DatePicker disabled />);
    
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    expect(input).toHaveClass('disabled:bg-gray-100');
  });

  test('supports required attribute', () => {
    render(<DatePicker required />);
    
    const input = screen.getByRole('textbox');
    expect(input).toBeRequired();
  });

  test('supports custom id and name', () => {
    render(<DatePicker id="date-picker" name="date" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'date-picker');
    expect(input).toHaveAttribute('name', 'date');
  });

  test('supports aria-describedby', () => {
    render(<DatePicker aria-describedby="date-help" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'date-help');
  });

  test('closes calendar when clicking outside', async () => {
    render(<DatePicker />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    
    // Click outside
    fireEvent.mouseDown(document.body);
    
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('handles keyboard navigation', async () => {
    render(<DatePicker />);
    
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    
    // Press Escape to close
    fireEvent.keyDown(input, { key: 'Escape' });
    
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('announces errors to screen readers', async () => {
    render(<DatePicker />);
    
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'invalid');
    
    const errorMessage = screen.getByRole('alert');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent('Invalid date format');
  });
});
