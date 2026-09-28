
import React, { useState } from 'react';
import Select from '@/components/common/Select';

/**
 * NotesFilterBar component - Filter and search bar for notes
 * @param {Object} props - Component props
 * @param {string} props.searchQuery - Current search query
 * @param {Function} props.onSearchChange - Function to call when search query changes
 * @param {string} props.dateFilter - Current date filter
 * @param {Function} props.onDateFilterChange - Function to call when date filter changes
 * @param {string} props.authorFilter - Current author filter
 * @param {Function} props.onAuthorFilterChange - Function to call when author filter changes
 * @param {string} props.tagFilter - Current tag filter
 * @param {Function} props.onTagFilterChange - Function to call when tag filter changes
 * @param {Array} props.authors - List of available authors
 * @param {Array} props.tags - List of available tags
 */
const NotesFilterBar = ({
  searchQuery = '',
  onSearchChange,
  dateFilter = 'all',
  onDateFilterChange,
  authorFilter = 'all',
  onAuthorFilterChange,
  tagFilter = 'all',
  onTagFilterChange,
  authors = [],
  tags = []
}) => {
  const [showFilters, setShowFilters] = useState(false);

  const dateFilterOptions = [
    { value: 'all', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'custom', label: 'Custom Range' }
  ];

  const handleSearchChange = (e) => {
    onSearchChange(e.target.value);
  };

  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };

  const clearFilters = () => {
    onSearchChange('');
    onDateFilterChange('all');
    onAuthorFilterChange('all');
    onTagFilterChange('all');
  };

  const hasActiveFilters = searchQuery || dateFilter !== 'all' || authorFilter !== 'all' || tagFilter !== 'all';

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      {/* Header with search and toggle */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center flex-1">
          <svg className="h-5 w-5 text-gray-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-sm font-medium text-gray-700">Filter Notes</span>
          {hasActiveFilters && (
            <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
              {[searchQuery ? 1 : 0, dateFilter !== 'all' ? 1 : 0, authorFilter !== 'all' ? 1 : 0, tagFilter !== 'all' ? 1 : 0].reduce((a, b) => a + b, 0)} Active
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={toggleFilters}
          className="sm:hidden p-2 text-gray-500 hover:text-gray-700"
        >
          <svg
            className={`h-5 w-5 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Expandable Filters */}
      <form className={`${showFilters ? 'block' : 'hidden sm:block'} p-4`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {/* Date Filter */}
          <div className="flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Date
            </label>
            <Select
              id="dateFilter"
              name="dateFilter"
              value={dateFilter}
              onChange={(e) => onDateFilterChange(e.target.value)}
              options={dateFilterOptions}
              className="w-full"
            />
          </div>

          {/* Author Filter */}
          <div className="flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Author
            </label>
            <Select
              id="authorFilter"
              name="authorFilter"
              value={authorFilter}
              onChange={(e) => onAuthorFilterChange(e.target.value)}
              options={[
                { value: "all", label: "All Authors" },
                ...authors.map((author) => ({
                  value: author.id,
                  label: author.name
                }))
              ]}
              className="w-full"
            />
          </div>

          {/* Tag Filter */}
          <div className="flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tags
            </label>
            <Select
              id="tagFilter"
              name="tagFilter"
              value={tagFilter}
              onChange={(e) => onTagFilterChange(e.target.value)}
              options={[
                { value: "all", label: "All Tags" },
                ...tags.map((tag) => ({
                  value: tag,
                  label: tag
                }))
              ]}
              className="w-full"
            />
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200"
          >
            Clear Filters
          </button>
        </div>
      </form>
    </div>
  );
};

export default NotesFilterBar;
