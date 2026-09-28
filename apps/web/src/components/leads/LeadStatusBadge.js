import React from 'react';

/**
 * LeadStatusBadge component - Displays a colored badge based on lead status
 * @param {Object} props - Component props
 * @param {string} props.status - The status of the lead
 * @param {string} props.className - Additional CSS classes
 */
const LeadStatusBadge = ({ status, className = '' }) => {
  // Map status to styling
  const getStatusConfig = (status) => {
    const normalizedStatus = status?.toLowerCase().trim();

    switch (normalizedStatus) {
      case 'new':
        return {
          bgClass: 'bg-green-100',
          textClass: 'text-green-800',
          label: 'New',
          icon: (
            <svg className="mr-1.5 h-2 w-2 text-green-400" fill="currentColor" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="3" />
            </svg>
          )
        };
      case 'contacted':
        return {
          bgClass: 'bg-blue-100',
          textClass: 'text-blue-800',
          label: 'Contacted',
          icon: (
            <svg className="mr-1.5 h-2 w-2 text-blue-400" fill="currentColor" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="3" />
            </svg>
          )
        };
      case 'qualified':
        return {
          bgClass: 'bg-purple-100',
          textClass: 'text-purple-800',
          label: 'Qualified',
          icon: (
            <svg className="mr-1.5 h-2 w-2 text-purple-400" fill="currentColor" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="3" />
            </svg>
          )
        };
      case 'converted':
        return {
          bgClass: 'bg-yellow-100',
          textClass: 'text-yellow-800',
          label: 'Converted',
          icon: (
            <svg className="mr-1.5 h-2 w-2 text-yellow-400" fill="currentColor" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="3" />
            </svg>
          )
        };
      case 'lost':
        return {
          bgClass: 'bg-red-100',
          textClass: 'text-red-800',
          label: 'Lost',
          icon: (
            <svg className="mr-1.5 h-2 w-2 text-red-400" fill="currentColor" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="3" />
            </svg>
          )
        };
      default:
        return {
          bgClass: 'bg-gray-100',
          textClass: 'text-gray-800',
          label: status || 'Unknown',
          icon: (
            <svg className="mr-1.5 h-2 w-2 text-gray-400" fill="currentColor" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="3" />
            </svg>
          )
        };
    }
  };

  const { bgClass, textClass, label, icon } = getStatusConfig(status);

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bgClass} ${textClass} ${className}`}>
      {icon}
      {label}
    </span>
  );
};

export default LeadStatusBadge;
