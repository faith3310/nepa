import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Shortcut {
  id: string;
  keys: string[];
  description: string;
  action: () => void;
  enabled?: boolean;
  category?: string;
}

interface KeyboardShortcutsProps {
  shortcuts?: Shortcut[];
  showHelp?: boolean;
  onHelpToggle?: (show: boolean) => void;
}

const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({
  shortcuts = [],
  showHelp = false,
  onHelpToggle,
}) => {
  const [isHelpVisible, setIsHelpVisible] = useState(showHelp);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [customShortcuts, setCustomShortcuts] = useState<Shortcut[]>([]);

  const defaultShortcuts: Shortcut[] = [
    {
      id: 'help',
      keys: ['?', 'shift+/'],
      description: 'Show keyboard shortcuts help',
      action: () => setIsHelpVisible(prev => !prev),
      category: 'Navigation',
    },
    {
      id: 'escape',
      keys: ['Escape'],
      description: 'Close modal or cancel action',
      action: () => {
        setIsHelpVisible(false);
        // Dispatch custom event for other components to handle
        window.dispatchEvent(new CustomEvent('escape-pressed'));
      },
      category: 'Navigation',
    },
    {
      id: 'dashboard',
      keys: ['g', 'd'],
      description: 'Go to dashboard',
      action: () => {
        window.location.href = '/dashboard';
      },
      category: 'Navigation',
    },
    {
      id: 'settings',
      keys: ['g', 's'],
      description: 'Go to settings',
      action: () => {
        window.location.href = '/settings';
      },
      category: 'Navigation',
    },
    {
      id: 'search',
      keys: ['/', 'ctrl+k', 'meta+k'],
      description: 'Focus search input',
      action: () => {
        const searchInput = document.querySelector('input[type="search"], input[placeholder*="search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      },
      category: 'Search',
    },
    {
      id: 'new-transaction',
      keys: ['n', 't'],
      description: 'New transaction',
      action: () => {
        window.dispatchEvent(new CustomEvent('new-transaction'));
      },
      category: 'Actions',
    },
    {
      id: 'refresh',
      keys: ['r', 'ctrl+r', 'meta+r'],
      description: 'Refresh data',
      action: () => {
        window.dispatchEvent(new CustomEvent('refresh-data'));
      },
      category: 'Actions',
    },
  ];

  const allShortcuts = [...defaultShortcuts, ...shortcuts, ...customShortcuts];

  const normalizeKey = (key: string): string => {
    return key.toLowerCase().replace('meta', 'cmd');
  };

  const keysMatch = (pressedKeys: Set<string>, shortcutKeys: string[]): boolean => {
    const normalizedPressed = Array.from(pressedKeys).map(normalizeKey);
    const normalizedShortcut = shortcutKeys.map(normalizeKey);
    
    return normalizedShortcut.some(shortcut => {
      const keys = shortcut.split('+');
      return keys.every(key => normalizedPressed.includes(key));
    });
  };

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in input fields
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
      return;
    }

    const key = event.key.toLowerCase();
    const modifiers = [];
    
    if (event.ctrlKey) modifiers.push('ctrl');
    if (event.metaKey) modifiers.push('meta');
    if (event.shiftKey) modifiers.push('shift');
    if (event.altKey) modifiers.push('alt');

    const fullKey = [...modifiers, key].join('+');
    setPressedKeys(prev => new Set(prev).add(fullKey));

    // Check for matching shortcuts
    const matchingShortcut = allShortcuts.find(shortcut => 
      shortcut.enabled !== false && keysMatch(new Set([fullKey]), shortcut.keys)
    );

    if (matchingShortcut) {
      event.preventDefault();
      matchingShortcut.action();
    }
  }, [allShortcuts]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const modifiers = [];
    
    if (event.ctrlKey) modifiers.push('ctrl');
    if (event.metaKey) modifiers.push('meta');
    if (event.shiftKey) modifiers.push('shift');
    if (event.altKey) modifiers.push('alt');

    const fullKey = [...modifiers, key].join('+');
    setPressedKeys(prev => {
      const newSet = new Set(prev);
      newSet.delete(fullKey);
      return newSet;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  useEffect(() => {
    if (onHelpToggle) {
      onHelpToggle(isHelpVisible);
    }
  }, [isHelpVisible, onHelpToggle]);

  const formatKeys = (keys: string[]): string => {
    return keys.map(key => 
      key.split('+').map(k => {
        switch (k) {
          case 'ctrl': return 'Ctrl';
          case 'meta': case 'cmd': return 'Cmd';
          case 'shift': return 'Shift';
          case 'alt': return 'Alt';
          case 'escape': return 'Esc';
          default: return k.toUpperCase();
        }
      }).join(' + ')
    ).join(' or ');
  };

  const groupedShortcuts = allShortcuts.reduce((acc, shortcut) => {
    const category = shortcut.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(shortcut);
    return acc;
  }, {} as Record<string, Shortcut[]>);

  const addCustomShortcut = (shortcut: Omit<Shortcut, 'id'>) => {
    const newShortcut: Shortcut = {
      ...shortcut,
      id: `custom-${Date.now()}`,
    };
    setCustomShortcuts(prev => [...prev, newShortcut]);
  };

  const removeCustomShortcut = (id: string) => {
    setCustomShortcuts(prev => prev.filter(s => s.id !== id));
  };

  const HelpModal = () => {
    if (!isHelpVisible) return null;

    return createPortal(
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={() => setIsHelpVisible(false)}
      >
        <div 
          className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 id="shortcuts-title" className="text-2xl font-bold text-gray-900">
                Keyboard Shortcuts
              </h2>
              <button
                onClick={() => setIsHelpVisible(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close help"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
                <div key={category}>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">{category}</h3>
                  <div className="space-y-2">
                    {categoryShortcuts.map(shortcut => (
                      <div key={shortcut.id} className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-gray-700">{shortcut.description}</span>
                        <div className="flex items-center space-x-2">
                          <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded">
                            {formatKeys(shortcut.keys)}
                          </kbd>
                          {shortcut.id.startsWith('custom-') && (
                            <button
                              onClick={() => removeCustomShortcut(shortcut.id)}
                              className="text-red-500 hover:text-red-700 text-sm"
                              aria-label="Remove custom shortcut"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Press <kbd className="px-2 py-1 text-xs bg-gray-100 border border-gray-300 rounded">Esc</kbd> to close this help
              </p>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <>
      <HelpModal />
      <div className="sr-only" aria-live="polite">
        {pressedKeys.size > 0 && `Keys pressed: ${Array.from(pressedKeys).join(', ')}`}
      </div>
    </>
  );
};

export default KeyboardShortcuts;
