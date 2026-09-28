import React from 'react';

/**
 * Reusable ReportTable component for displaying tabular data
 * @param {Object} props
 * @param {Array} props.columns - Array of column objects with id, label, and optional formatter
 * @param {Array} props.data - Array of data objects
 * @param {boolean} props.loading - Whether the table is in loading state
 * @param {string} props.emptyMessage - Message to display when no data is available
 * @param {string} props.className - Additional CSS classes for the table container
 */
const ReportTable = ({ 
  columns = [], 
  data = [], 
  loading = false, 
  emptyMessage = 'No data available',
  className = ''
}) => {
  // If loading, show loading state
  if (loading) {
    return (
      <div className={`flex justify-center items-center py-12 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-500">Loading data...</p>
        </div>
      </div>
    );
  }

  // If no data, show empty state
  if (data.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v1a1 1 0 001 1h4a1 1 0 001-1v-1m3-2V8a2 2 0 00-2-2H8a2 2 0 00-2 2v6m3-2h6" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No data</h3>
        <p className="mt-1 text-sm text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-gray-50">
              {columns.map((column) => (
                <td
                  key={column.id}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                >
                  {column.formatter 
                    ? column.formatter(row[column.id], row) 
                    : row[column.id]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ReportTable;
