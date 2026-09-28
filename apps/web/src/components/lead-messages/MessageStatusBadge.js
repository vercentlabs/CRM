import React from 'react';

/**
 * MessageStatusBadge component - Displays message status with appropriate styling
 * @param {Object} props - Component props
 * @param {string} props.status - Message status
 * @param {string} props.className - Additional CSS classes
 */
const MessageStatusBadge = ({ status, className = '' }) => {
  const getStatusDisplay = (status) => {
    switch (status) {
      case 'Sent':
        return { label: 'Sent', color: 'bg-green-100 text-green-800', icon: (
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        )};
      case 'Delivered':
        return { label: 'Delivered', color: 'bg-blue-100 text-blue-800', icon: (
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )};
      case 'Opened':
        return { label: 'Opened', color: 'bg-indigo-100 text-indigo-800', icon: (
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )};
      case 'Clicked':
        return { label: 'Clicked', color: 'bg-purple-100 text-purple-800', icon: (
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
        )};
      case 'Failed':
        return { label: 'Failed', color: 'bg-red-100 text-red-800', icon: (
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )};
      default:
        return { label: status || 'Unknown', color: 'bg-gray-100 text-gray-800', icon: null };
    }
  };

  const statusDisplay = getStatusDisplay(status);

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusDisplay.color} ${className}`}>
      {statusDisplay.icon && <span className="mr-1">{statusDisplay.icon}</span>}
      {statusDisplay.label}
    </span>
  );
};

export default MessageStatusBadge;
