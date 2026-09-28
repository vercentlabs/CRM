import React, { useState, useRef, useEffect } from 'react';

/**
 * Custom Select component - A dropdown that renders within its parent container
 * @param {Object} props - Component props
 * @param {string} props.id - Select ID
 * @param {string} props.name - Select name
 * @param {string} props.value - Selected value
 * @param {Function} props.onChange - Change handler
 * @param {Array} props.options - Array of options {value, label}
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.disabled - Whether select is disabled
 * @param {string} props.placeholder - Placeholder text
 */
const Select = ({ 
  id, 
  name, 
  value, 
  onChange, 
  options = [], 
  className = '', 
  disabled = false,
  placeholder = 'Select an option',
  style = {}
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  // Debug logging
  console.log('Select component props:', { id, name, value, options, isOpen });

  return (
    <div ref={selectRef} className={`relative ${className}`}>
      {/* Select Button */}
      <button
        type="button"
        id={id}
        name={name}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`block w-full rounded-lg px-3 text-gray-900 focus:outline-none sm:text-sm text-[14px] text-left flex justify-between items-center ${className}`}
        style={style}
      >
        <span className={selectedOption ? '' : 'text-gray-400'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Options */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-[9999] mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto"
        >
          {console.log('Rendering dropdown options:', options)}
          {console.log('Options length:', options.length)}
          {console.log('First option:', options[0])}
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">No options available</div>
          )}
          {options.map((option, index) => {
            console.log(`Rendering option ${index}:`, option);
            return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange({ target: { name, value: option.value } });
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                option.value === value
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-900 hover:bg-gray-100'
              }`}
            >
              {option.label}
            </button>
            );
          })}
        </div>
      )}

      {/* Hidden input for form submission */}
      <input type="hidden" name={name} value={value} />
    </div>
  );
};

export default Select;
