import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER } from '@/lib/constants';

/**
 * LeadsPipelineControls component - Control panel for leads pipeline view
 * @param {Object} props - Component props
 * @param {Object} props.filters - Current filter values
 * @param {Function} props.onFiltersChange - Callback when filters change
 * @param {string} props.viewMode - Current view mode ('kanban' or 'table')
 * @param {Function} props.onViewModeChange - Callback when view mode changes
 */
const LeadsPipelineControls = ({
  filters = {},
  onFiltersChange,
  viewMode = 'kanban',
  onViewModeChange
}) => {
  const { user } = useAuth();
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);

  // Define status options
  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'New', label: 'New' },
    { value: 'Contacted', label: 'Contacted' },
    { value: 'Qualified', label: 'Qualified' },
    { value: 'Converted', label: 'Converted' },
    { value: 'Lost', label: 'Lost' }
  ];

  // Define value range options
  const valueRangeOptions = [
    { value: '', label: 'All Values' },
    { value: '0-1000', label: 'Under $1,000' },
    { value: '1000-5000', label: '$1,000 - $5,000' },
    { value: '5000-10000', label: '$5,000 - $10,000' },
    { value: '10000-50000', label: '$10,000 - $50,000' },
    { value: '50000+', label: '$50,000+' }
  ];

  // Handle search input change
  const handleSearchChange = (e) => {
    setLocalFilters(prev => ({
      ...prev,
      search: e.target.value
    }));
  };

  // Handle search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    onFiltersChange(localFilters);
  };

  // Handle filter change
  const handleFilterChange = (key, value) => {
    setLocalFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Apply filters
  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsFilterPanelOpen(false);
  };

  // Reset filters
  const handleResetFilters = () => {
    const resetFilters = {
      search: localFilters.search || '',
      status: '',
      assignedTo: '',
      valueRange: '',
      dateFrom: '',
      dateTo: ''
    };
    setLocalFilters(resetFilters);
    onFiltersChange(resetFilters);
    setIsFilterPanelOpen(false);
  };

  return (
    <div className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-3 py-2 sm:px-4 sm:py-3 lg:px-5 lg:py-3">
        {/* Top Row: Search and View Toggle */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center justify-between">
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="flex-1 w-full sm:max-w-lg">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {/* <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg> */}
              </div>
              <input
                type="text"
                value={localFilters.search || ''}
                onChange={handleSearchChange}
                className="block w-full pl-10 pr-3 py-1.5 sm:py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-xs sm:text-sm"
                placeholder="Search by name, email, phone, or company..."
              />
              <button
                type="submit"
                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
              >
                <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </form>

          {/* View Mode Toggle and Filter Button */}
          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => onViewModeChange && onViewModeChange('kanban')}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-l-lg border ${
                  viewMode === 'kanban'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 inline mr-1 sm:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Kanban
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange && onViewModeChange('table')}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-r-lg border ${
                  viewMode === 'table'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 inline mr-1 sm:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                Table
              </button>
            </div>

            {/* Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              className={`inline-flex items-center px-3 py-1.5 sm:px-4 sm:py-2 border rounded-md shadow-sm text-xs sm:text-sm font-medium ${
                isFilterPanelOpen || Object.keys(filters).some(key => key !== 'search' && filters[key])
                  ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {isFilterPanelOpen && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {/* Status Filter */}
              <div>
                <label htmlFor="status" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status"
                  value={localFilters.status || ''}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="block w-full px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-xs sm:text-sm"
                >
                  {statusOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assigned To Filter */}
              {(user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) && (
                <div>
                  <label htmlFor="assignedTo" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    Assigned To
                  </label>
                  <select
                    id="assignedTo"
                    value={localFilters.assignedTo || ''}
                    onChange={(e) => handleFilterChange('assignedTo', e.target.value)}
                    className="block w-full px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-xs sm:text-sm"
                  >
                    <option value="">All Users</option>
                    {/* This would be populated with actual users */}
                    <option value="1">User 1</option>
                    <option value="2">User 2</option>
                  </select>
                </div>
              )}

              {/* Value Range Filter */}
              <div>
                <label htmlFor="valueRange" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Deal Value
                </label>
                <select
                  id="valueRange"
                  value={localFilters.valueRange || ''}
                  onChange={(e) => handleFilterChange('valueRange', e.target.value)}
                  className="block w-full px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-xs sm:text-sm"
                >
                  {valueRangeOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range Filter */}
              <div>
                <label htmlFor="dateFrom" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Date Range
                </label>
                <div className="flex space-x-2">
                  <input
                    type="date"
                    id="dateFrom"
                    value={localFilters.dateFrom || ''}
                    onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                    className="flex-1 block w-full px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-xs sm:text-sm"
                  />
                  <input
                    type="date"
                    id="dateTo"
                    value={localFilters.dateTo || ''}
                    onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                    className="flex-1 block w-full px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-xs sm:text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Filter Actions */}
            <div className="mt-3 flex justify-end space-x-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center px-3 py-1.5 sm:px-4 sm:py-2 border border-gray-300 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleApplyFilters}
                className="inline-flex items-center px-3 py-1.5 sm:px-4 sm:py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadsPipelineControls;
