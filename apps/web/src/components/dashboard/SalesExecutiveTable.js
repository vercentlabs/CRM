
'use client';

import React, { useState, useEffect } from 'react';
import axios from '../../lib/axios';

const SalesExecutiveTable = () => {
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: 'conversions', direction: 'desc' });
  const [executives, setExecutives] = useState([]);
  const rowsPerPage = 10;

  // Fetch sales performance data from backend
  useEffect(() => {
    const fetchSalesPerformance = async () => {
      try {
        const response = await axios.get('/reports/sales-performance');

        // Handle response data - it might be wrapped in an object or be an array directly
        let data = response.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          data = data.data || data.salesPerformance || data.executives || [];
        }

        // Ensure data is an array
        if (!Array.isArray(data)) {
          console.error('Unexpected response format:', response.data);
          setExecutives([]);
          return;
        }

        // Transform backend data to match component structure
        const transformedData = data.map(user => ({
          id: user.id,
          name: user.name,
          email: user.email,
          leadsAssigned: user.totalLeads,
          leadsContacted: 0, // Backend doesn't provide this metric anymore
          conversions: user.convertedLeads,
          avatar: user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'NA'
        }));

        setExecutives(transformedData);
      } catch (error) {
        console.error('Error fetching sales performance:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSalesPerformance();
  }, []);

  // Mock data removed - using real data from backend API

  const getAvatarColor = (name) => {
    const colors = ['bg-blue-100', 'bg-purple-100', 'bg-green-100', 'bg-yellow-100', 'bg-pink-100'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const getAvatarTextColor = (name) => {
    const colors = ['text-blue-600', 'text-purple-600', 'text-green-600', 'text-yellow-600', 'text-pink-600'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const getConversionPercentage = (executive) => {
    return executive.leadsAssigned > 0 
      ? ((executive.conversions / executive.leadsAssigned) * 100).toFixed(1)
      : '0.0';
  };

  const sortExecutives = (executives) => {
    return [...executives].sort((a, b) => {
      if (sortConfig.key === 'conversionPercentage') {
        const aPercent = parseFloat(getConversionPercentage(a));
        const bPercent = parseFloat(getConversionPercentage(b));
        return sortConfig.direction === 'asc' ? aPercent - bPercent : bPercent - aPercent;
      }
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? (
      <svg className="h-4 w-4 inline ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="h-4 w-4 inline ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const totalPages = Math.ceil(executives.length / rowsPerPage);
  const sortedExecutives = sortExecutives(executives);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentExecutives = sortedExecutives.slice(startIndex, endIndex);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Leads by Sales Executive</h3>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                      onClick={() => handleSort('name')}>
                    Executive Name {getSortIcon('name')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                      onClick={() => handleSort('leadsAssigned')}>
                    Leads Assigned {getSortIcon('leadsAssigned')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                      onClick={() => handleSort('leadsContacted')}>
                    Leads Contacted {getSortIcon('leadsContacted')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                      onClick={() => handleSort('conversions')}>
                    Conversions {getSortIcon('conversions')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                      onClick={() => handleSort('conversionPercentage')}>
                    Conversion % {getSortIcon('conversionPercentage')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentExecutives.map((executive) => (
                  <tr key={executive.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{executive.name}</div>
                      <div className="text-sm text-gray-500">{executive.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {executive.leadsAssigned}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {executive.leadsContacted}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {executive.conversions}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-1 mr-2">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${getConversionPercentage(executive)}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {getConversionPercentage(executive)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
              <span className="font-medium">{Math.min(endIndex, executives.length)}</span> of{' '}
              <span className="font-medium">{executives.length}</span> results
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 text-gray-900 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <span className="hidden sm:inline">Previous</span>
                <svg className="h-5 w-5 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="hidden sm:flex gap-2">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`px-3 py-1 text-sm border rounded-md ${
                      currentPage === page
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'text-gray-900 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 text-gray-900 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <span className="hidden sm:inline">Next</span>
                <svg className="h-5 w-5 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SalesExecutiveTable;
