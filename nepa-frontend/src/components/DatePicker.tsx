import React, { useState, useRef, useEffect, useCallback } from 'react';
import { format, parseISO, isValid, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth, isSameDay, isToday, isWeekend } from 'date-fns';

interface DatePickerProps {
  value?: Date | string | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  minDate?: Date | string;
  maxDate?: Date | string;
  disabled?: boolean;
  locale?: string;
  format?: string;
  showWeekNumbers?: boolean;
  disableWeekends?: boolean;
  disablePast?: boolean;
  disableFuture?: boolean;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select a date',
  minDate,
  maxDate,
  disabled = false,
  locale = 'en-US',
  format: displayFormat = 'MMM dd, yyyy',
  showWeekNumbers = false,
  disableWeekends = false,
  disablePast = false,
  disableFuture = false,
  className = '',
  id,
  name,
  required = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    value ? (typeof value === 'string' ? parseISO(value) : value) : null
  );
  const [inputValue, setInputValue] = useState(
    value ? format(typeof value === 'string' ? parseISO(value) : value, displayFormat) : ''
  );
  const [error, setError] = useState<string>('');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const parseDate = useCallback((dateString: string): Date | null => {
    try {
      const parsed = new Date(dateString);
      return isValid(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, []);

  const formatDate = useCallback((date: Date): string => {
    try {
      return format(date, displayFormat);
    } catch {
      return date.toISOString().split('T')[0];
    }
  }, [displayFormat]);

  const isDateDisabled = useCallback((date: Date): boolean => {
    if (disableWeekends && isWeekend(date)) return true;
    if (disablePast && isToday(date)) return false;
    if (disablePast && date < new Date()) return true;
    if (disableFuture && date > new Date()) return true;
    
    if (minDate) {
      const min = typeof minDate === 'string' ? parseISO(minDate) : minDate;
      if (date < min) return true;
    }
    
    if (maxDate) {
      const max = typeof maxDate === 'string' ? parseISO(maxDate) : maxDate;
      if (date > max) return true;
    }
    
    return false;
  }, [disableWeekends, disablePast, disableFuture, minDate, maxDate]);

  const handleDateSelect = useCallback((date: Date) => {
    if (isDateDisabled(date)) return;
    
    setSelectedDate(date);
    setInputValue(formatDate(date));
    setIsOpen(false);
    setError('');
    
    if (onChange) {
      onChange(date);
    }
  }, [isDateDisabled, formatDate, onChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    if (!value) {
      setSelectedDate(null);
      setError('');
      if (onChange) onChange(null);
      return;
    }
    
    const parsed = parseDate(value);
    if (parsed && isValid(parsed)) {
      if (isDateDisabled(parsed)) {
        setError('Date is not allowed');
        return;
      }
      setSelectedDate(parsed);
      setError('');
      if (onChange) onChange(parsed);
    } else {
      setError('Invalid date format');
    }
  }, [parseDate, isDateDisabled, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(!isOpen);
    } else if (e.key === 'ArrowDown' && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
    }
  }, [isOpen]);

  const handleMonthChange = useCallback((direction: 'prev' | 'next') => {
    setCurrentMonth(prev => 
      direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)
    );
  }, []);

  const getWeekNumber = useCallback((date: Date): number => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }, []);

  const renderCalendar = useCallback(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const startDay = getDay(monthStart);
    const calendarDays = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < startDay; i++) {
      calendarDays.push(null);
    }
    
    // Add all days of the month
    calendarDays.push(...monthDays);
    
    // Group days into weeks
    const weeks = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }
    
    return weeks;
  }, [currentMonth]);

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus management
  useEffect(() => {
    if (isOpen && calendarRef.current) {
      const firstFocusable = calendarRef.current.querySelector('button:not(:disabled)') as HTMLElement;
      firstFocusable?.focus();
    }
  }, [isOpen]);

  // Update selected date when value prop changes
  useEffect(() => {
    if (value) {
      const date = typeof value === 'string' ? parseISO(value) : value;
      setSelectedDate(date);
      setInputValue(formatDate(date));
    } else {
      setSelectedDate(null);
      setInputValue('');
    }
  }, [value, formatDate]);

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name}
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        placeholder={placeholder}
        required={required}
        aria-label={ariaLabel || 'Date picker'}
        aria-describedby={ariaDescribedBy}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`
          w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          disabled:bg-gray-100 disabled:text-gray-500
          ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}
        `}
      />
      
      {error && (
        <div className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </div>
      )}

      {isOpen && !disabled && (
        <div
          ref={calendarRef}
          className="absolute z-50 mt-1 bg-white border border-gray-300 rounded-md shadow-lg"
          role="dialog"
          aria-label="Calendar"
        >
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => handleMonthChange('prev')}
                className="p-1 hover:bg-gray-100 rounded"
                aria-label="Previous month"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <h2 className="text-lg font-semibold">
                {format(currentMonth, 'MMMM yyyy')}
              </h2>
              
              <button
                type="button"
                onClick={() => handleMonthChange('next')}
                className="p-1 hover:bg-gray-100 rounded"
                aria-label="Next month"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Week day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {showWeekNumbers && (
                <div className="text-center text-xs font-medium text-gray-500 p-2">
                  Wk
                </div>
              )}
              {weekDays.map(day => (
                <div key={day} className="text-center text-xs font-medium text-gray-500 p-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="space-y-1">
              {renderCalendar().map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 gap-1">
                  {showWeekNumbers && (
                    <div className="text-center text-xs text-gray-400 p-2">
                      {week[0] ? getWeekNumber(week[0]) : ''}
                    </div>
                  )}
                  {week.map((day, dayIndex) => (
                    <div key={dayIndex} className="aspect-square">
                      {day && (
                        <button
                          type="button"
                          onClick={() => handleDateSelect(day)}
                          disabled={isDateDisabled(day)}
                          className={`
                            w-full h-full p-1 text-sm rounded
                            ${isSameMonth(day, currentMonth) ? 'text-gray-900' : 'text-gray-400'}
                            ${isSameDay(day, selectedDate || new Date(0)) ? 'bg-blue-500 text-white' : ''}
                            ${isToday(day) && !isSameDay(day, selectedDate || new Date(0)) ? 'bg-blue-100' : ''}
                            ${isDateDisabled(day) ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100'}
                          `}
                          aria-label={format(day, 'EEEE, MMMM d, yyyy')}
                          aria-selected={isSameDay(day, selectedDate || new Date(0))}
                          aria-disabled={isDateDisabled(day)}
                        >
                          {format(day, 'd')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between">
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(null);
                  setInputValue('');
                  setError('');
                  setIsOpen(false);
                  if (onChange) onChange(null);
                }}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Clear
              </button>
              
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;
