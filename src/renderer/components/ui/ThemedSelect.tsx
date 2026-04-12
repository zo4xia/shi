import { ChevronDownIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useRef, useState } from 'react';

interface ThemedSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  label?: string;
}

const ThemedSelect: React.FC<ThemedSelectProps> = ({
  id,
  value,
  onChange,
  options,
  className = '',
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find the selected option label
  const selectedOption = options.find(option => option.value === value);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle option selection
  const handleOptionClick = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const buttonClasses = [
    'flex items-center justify-between w-full rounded-lg px-4 py-2.5 text-sm',
    'bg-claude-surface dark:bg-claude-darkSurface',
    'border border-claude-border dark:border-claude-darkBorder',
    'text-claude-text dark:text-claude-darkText',
    'focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/40',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center space-x-3">
        {label && (
          <label htmlFor={id} className="text-sm font-medium dark:text-claude-darkText text-claude-text whitespace-nowrap">
            {label}
          </label>
        )}
        <div className="flex-1">
          <button
            id={id}
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={buttonClasses}
            aria-haspopup="listbox"
          >
            <span>{selectedOption?.label || value}</span>
            <ChevronDownIcon className="w-4 h-4 ml-2" />
          </button>

          {isOpen && (
            <div className="absolute z-10 w-full mt-1 overflow-auto rounded-md popover-enter shadow-popover max-h-60 focus:outline-none">
              <ul
                className="py-1 overflow-auto text-sm dark:bg-claude-darkSurface bg-claude-surface border dark:border-claude-darkBorder border-claude-border rounded-lg"
                role="listbox"
                aria-labelledby={id}
              >
                {options.map((option) => {
                  const isSelected = option.value === value;
                  const itemClasses = [
                    'cursor-pointer select-none relative py-1.5 pl-3 pr-9',
                    'hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover',
                    isSelected ? 'bg-claude-surfaceHover dark:bg-claude-darkSurfaceHover' : '',
                  ].filter(Boolean).join(' ');

                  const textClasses = [
                    'block truncate',
                    'text-claude-text dark:text-claude-darkText',
                    isSelected ? 'font-medium' : 'font-normal',
                  ].filter(Boolean).join(' ');

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`${itemClasses} w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-claude-accent/40`}
                      onClick={() => handleOptionClick(option.value)}
                    >
                      <span className={textClasses}>
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ThemedSelect;
