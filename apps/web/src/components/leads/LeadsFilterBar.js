
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER } from '@/lib/constants';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import Select from '@/components/common/Select';

// Debounce hook
const useDebounce = (callback, delay) => {
  const [debounceTimer, setDebounceTimer] = useState(null);

  return useCallback((...args) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const newTimer = setTimeout(() => {
      callback(...args);
    }, delay);

    setDebounceTimer(newTimer);
  }, [callback, delay, debounceTimer]);
};

/**
 * LeadsFilterBar component - Filters for the leads table
 * @param {Object} props - Component props
 * @param {Object} props.filters - Current filter values
 * @param {Function} props.onFiltersChange - Function to call when filters are applied
 * @param {string} props.viewMode - Current view mode ('table' or 'kanban')
 * @param {Function} props.onViewModeChange - Function to call when view mode changes
 */
const LeadsFilterBar = ({ filters, onFiltersChange, viewMode = 'kanban', onViewModeChange }) => {
  const { user } = useAuth();

  // Filter state - use props.filters as initial state
  const [localFilters, setLocalFilters] = useState({
    status: filters?.status || '',
    assignedTo: filters?.assignedTo || '',
    dateFrom: filters?.dateFrom || '',
    dateTo: filters?.dateTo || ''
  });

  // State for sales executives list (for assigned to dropdown)
  const [salesExecutives, setSalesExecutives] = useState([]);
  const [loadingSalesExecutives, setLoadingSalesExecutives] = useState(false);

  // Fetch sales executives for assigned to dropdown (admin/manager only)
  useEffect(() => {
    const fetchSalesExecutives = async () => {
      try {
        setLoadingSalesExecutives(true);
        const response = await api.get('/users');
        const data = extractData(response);
        setSalesExecutives(data.users || []);
      } catch (error) {
        console.error('Failed to fetch sales executives:', error);
      } finally {
        setLoadingSalesExecutives(false);
      }
    };

    if (user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) {
      fetchSalesExecutives();
    }
  }, [user]);

  // Lead status options
  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'New', label: 'New' },
    { value: 'Contacted', label: 'Contacted' },
    { value: 'Qualified', label: 'Qualified' },
    { value: 'Converted', label: 'Converted' },
    { value: 'Lost', label: 'Lost' }
  ];

  // Debounced filter application
  const debouncedApplyFilters = useDebounce((cleanFilters) => {
    onFiltersChange(cleanFilters);
  }, 500);

  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLocalFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();

    // Create a clean filters object with only non-empty values
    const cleanFilters = Object.entries(localFilters).reduce((acc, [key, value]) => {
      if (value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {});

    // Apply filters immediately
    onFiltersChange(cleanFilters);
  };

  // Reset filters
  const handleReset = () => {
    setLocalFilters({
      status: '',
      assignedTo: '',
      dateFrom: '',
      dateTo: ''
    });

    // Call onFiltersChange with empty object to reset
    onFiltersChange({});
  };

  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      {/* Header with search and toggle */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center flex-1">
          <svg className="h-5 w-5 text-gray-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-sm font-medium text-gray-700">Filter Leads</span>
          {Object.values(localFilters).some(v => v !== '') && (
            <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
              {Object.values(localFilters).filter(v => v !== '').length} Active
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsFilterExpanded(!isFilterExpanded)}
          className="sm:hidden p-2 text-gray-500 hover:text-gray-700"
        >
          <svg
            className={`h-5 w-5 transition-transform duration-200 ${isFilterExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className={`${isFilterExpanded ? 'block' : 'hidden sm:block'} p-4`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Status filter */}
          <div className="flex flex-col">
            <label htmlFor="status" className="block text-sm font-medium text-black mb-1.5">
              Status
            </label>
            <Select
              id="status"
              name="status"
              value={localFilters.status}
              onChange={handleInputChange}
              placeholder="All Statuses"
              options={statusOptions}
              className="w-full"
            />
          </div>

          {/* Assigned To filter (admin/manager only) */}
          {(user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) && (
            <div className="flex flex-col">
              <label htmlFor="assignedTo" className="block text-sm font-medium text-black mb-1.5">
                Assigned To
              </label>
              <Select
                id="assignedTo"
                name="assignedTo"
                value={localFilters.assignedTo}
                onChange={handleInputChange}
                disabled={loadingSalesExecutives}
                placeholder="All Sales Executives"
                options={[
                  { value: "", label: "All Sales Executives" },
                  ...salesExecutives.map(executive => ({
                    value: executive.id,
                    label: executive.full_name
                  }))
                ]}
                className="w-full"
              />
            </div>
          )}

          {/* Date From filter */}
          <div className="flex flex-col">
            <label htmlFor="dateFrom" className="block text-sm font-medium text-black mb-1.5">
              Date From
            </label>
            <input
              type="date"
              id="dateFrom"
              name="dateFrom"
              value={localFilters.dateFrom}
              onChange={handleInputChange}
              max={localFilters.dateTo || new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Date To filter */}
          <div className="flex flex-col">
            <label htmlFor="dateTo" className="block text-sm font-medium text-black mb-1.5">
              Date To
            </label>
            <input
              type="date"
              id="dateTo"
              name="dateTo"
              value={localFilters.dateTo}
              onChange={handleInputChange}
              min={localFilters.dateFrom}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mt-6 pt-4 border-t border-gray-200">
          {/* View mode toggle */}
          {onViewModeChange && (
            <div className="inline-flex rounded-lg shadow-sm w-full sm:w-auto overflow-hidden" role="group">
              <button
                type="button"
                onClick={() => onViewModeChange('kanban')}
                className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium border transition-all duration-200 ${
                  viewMode === 'kanban'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Kanban
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('table')}
                className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium border transition-all duration-200 ${
                  viewMode === 'table'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Table
              </button>
            </div>
          )}
          <div className="flex w-full sm:w-auto space-x-3">
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 sm:flex-none px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200"
            >
              Reset
            </button>
            <button
              type="submit"
              className="flex-1 sm:flex-none inline-flex justify-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default LeadsFilterBar;
