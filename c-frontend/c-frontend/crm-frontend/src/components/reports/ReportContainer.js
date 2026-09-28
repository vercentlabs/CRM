import React from 'react';

/**
 * Reusable ReportContainer component for handling loading and error states
 * @param {Object} props
 * @param {boolean} props.loading - Whether the report is in loading state
 * @param {string} props.error - Error message to display
 * @param {Function} props.onRetry - Function to call when retry button is clicked
 * @param {React.ReactNode} props.children - Content to render when not loading or in error state
 * @param {string} props.title - Report title to display
 * @param {string} props.description - Report description to display
 * @param {React.ReactNode} props.headerActions - Actions to display in the header
 */
const ReportContainer = ({ 
  loading = false, 
  error = null, 
  onRetry = () => {},
  children,
  title = '',
  description = '',
  headerActions = null
}) => {
  // If loading, show loading state
  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
            <p className="mt-2 text-sm text-gray-700">{description}</p>
          </div>
          {headerActions && (
            <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
              {headerActions}
            </div>
          )}
        </div>

        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500">Loading report data...</p>
          </div>
        </div>
      </div>
    );
  }

  // If error, show error state
  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
            <p className="mt-2 text-sm text-gray-700">{description}</p>
          </div>
          {headerActions && (
            <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
              {headerActions}
            </div>
          )}
        </div>

        <div className="text-center py-12">
          <div className="text-red-500 text-lg mb-2">Error</div>
          <p className="text-gray-500">{error}</p>
          <button
            onClick={onRetry}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Otherwise render children
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
          <p className="mt-2 text-sm text-gray-700">{description}</p>
        </div>
        {headerActions && (
          <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
            {headerActions}
          </div>
        )}
      </div>

      {children}
    </div>
  );
};

export default ReportContainer;
