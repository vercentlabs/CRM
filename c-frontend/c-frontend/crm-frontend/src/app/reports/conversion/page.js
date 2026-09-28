'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import ConversionReportPageHeader from '@/components/reports/ConversionReportPageHeader';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import { formatNumber, formatPercentage } from '@/lib/formatters';
import api from '@/lib/api';

const ConversionReport = () => {
  const { token } = useAuth();
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'chart'
  const [dateRange, setDateRange] = useState('30'); // Default to last 30 days
  const [selectedUser, setSelectedUser] = useState(''); // Default to all users
  const [users, setUsers] = useState([]); // List of users for filter

  // Fetch users for filter
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await api.get('/users?role=2,3'); // Get Managers and Sales users

        setUsers(response.data.data || []);
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    };

    if (token) {
      fetchUsers();
    }
  }, [token]);

  // Fetch conversion report data
  useEffect(() => {
    const fetchReportData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Build query parameters
        const queryParams = new URLSearchParams();
        queryParams.append('days', dateRange);
        if (selectedUser) {
          queryParams.append('userId', selectedUser);
        }

        const response = await api.get(`/reports/conversion-report?${queryParams.toString()}`);

        // Transform the object response into an array of stages
        const funnelStages = [
          { status: 'New', label: 'New Leads', count: response.data.New || 0 },
          { status: 'Contacted', label: 'Contacted', count: response.data.Contacted || 0 },
          { status: 'Qualified', label: 'Qualified', count: response.data.Qualified || 0 },
          { status: 'Converted', label: 'Converted', count: response.data.Converted || 0 }
        ];

        setReportData(funnelStages);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch conversion report data');
        console.error('Error fetching conversion report data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchReportData();
    }
  }, [token, dateRange, selectedUser]);

  // Calculate total leads
  const calculateTotalLeads = () => {
    return reportData.reduce((sum, stage) => sum + stage.count, 0);
  };

  // Calculate conversion rate between stages
  const calculateConversionRate = (currentStage, previousStage) => {
    if (!previousStage || previousStage.count === 0) return 0;
    return ((currentStage.count / previousStage.count) * 100).toFixed(1);
  };

  // Get color for funnel stage
  const getStageColor = (index, totalStages) => {
    // Create gradient from blue to green
    const percentage = index / (totalStages - 1);
    const r = Math.round(59 + (16 - 59) * percentage); // 59 to 16
    const g = Math.round(130 + (185 - 130) * percentage); // 130 to 185
    const b = Math.round(246 + (129 - 246) * percentage); // 246 to 129

    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <ProtectedRoute roles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <ConversionReportPageHeader
            onRefresh={() => window.location.reload()}
            onPrint={() => window.print()}
          />

          {/* Filters */}
          <div className="mb-4 sm:mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <div className="flex-1">
                <label htmlFor="dateRange" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Date Range
                </label>
                <select
                  id="dateRange"
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-xs sm:text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
                >
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="365">Last year</option>
                </select>
              </div>

              <div className="flex-1">
                <label htmlFor="userFilter" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  User
                </label>
                <select
                  id="userFilter"
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-xs sm:text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
                >
                  <option value="">All Users</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label htmlFor="viewMode" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  View Mode
                </label>
                <select
                  id="viewMode"
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-xs sm:text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
                >
                  <option value="table">Table View</option>
                  <option value="chart">Funnel Chart</option>
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-500">Loading report data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-500 text-lg mb-2">Error</div>
              <p className="text-gray-500">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="mt-4 sm:mt-6 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-xs sm:text-sm font-medium text-gray-600">Total Leads</p>
                      <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{formatNumber(calculateTotalLeads())}</p>
                    </div>
                    <div className="p-2 sm:p-3 bg-blue-50 rounded-lg">
                      <svg className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-xs sm:text-sm font-medium text-gray-600">Converted</p>
                      <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                        {formatNumber(reportData.length > 0 ? reportData[reportData.length - 1].count : 0)}
                      </p>
                    </div>
                    <div className="p-2 sm:p-3 bg-green-50 rounded-lg">
                      <svg className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 hover:shadow-md transition-shadow duration-200">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="shrink-0">
                        <svg className="h-6 w-6 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Overall Conversion</dt>
                          <dd className="text-lg font-medium text-gray-900">
                            {reportData.length > 1 ? 
                              calculateConversionRate(
                                reportData[reportData.length - 1], 
                                reportData[0]
                              ) : 0}%
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 hover:shadow-md transition-shadow duration-200">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="shrink-0">
                        <svg className="h-6 w-6 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Funnel Stages</dt>
                          <dd className="text-lg font-medium text-gray-900">{reportData.length}</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Table or Chart View */}
              {viewMode === 'table' ? (
                <div className="mt-4 sm:mt-6 bg-white shadow-sm overflow-hidden sm:rounded-xl border border-gray-200">
                  <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Conversion Funnel Details</h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                      Lead count and conversion rates at each stage of the funnel
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Stage
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Lead Count
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Percentage
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Conversion Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {reportData.map((stage, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {stage.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {stage.count}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {calculateTotalLeads() > 0 ? ((stage.count / calculateTotalLeads()) * 100).toFixed(1) : 0}%
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                index === 0 ? 'bg-gray-100 text-gray-800' :
                                calculateConversionRate(stage, reportData[index - 1]) >= 70 ? 'bg-green-100 text-green-800' :
                                calculateConversionRate(stage, reportData[index - 1]) >= 40 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {index === 0 ? 'Start' : `${calculateConversionRate(stage, reportData[index - 1])}%`}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="mt-4 sm:mt-6 bg-white shadow-sm overflow-hidden sm:rounded-xl border border-gray-200">
                  <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Conversion Funnel Visualization</h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                      Visual representation of lead movement through the conversion funnel
                    </p>
                  </div>
                  <div className="p-6">
                    <div className="space-y-2">
                      {reportData.map((stage, index) => {
                        const maxWidth = 100; // Maximum width in percentage
                        const width = calculateTotalLeads() > 0 ? (stage.count / reportData[0].count) * maxWidth : 0;
                        const color = getStageColor(index, reportData.length);

                        return (
                          <div key={index} className="relative">
                            <div className="flex items-center mb-1">
                              <div className="text-sm font-medium text-gray-700 w-32">{stage.name}</div>
                              <div className="text-sm text-gray-500 ml-4">{stage.count} leads</div>
                              {index > 0 && (
                                <div className="text-sm text-gray-500 ml-4">
                                  ({calculateConversionRate(stage, reportData[index - 1])}% from previous)
                                </div>
                              )}
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-10 relative">
                              <div
                                className="h-10 rounded-full flex items-center justify-center text-white text-sm font-medium"
                                style={{
                                  width: `${width}%`,
                                  backgroundColor: color,
                                  transition: 'width 1s ease-in-out'
                                }}
                              >
                                {width > 10 && `${((stage.count / calculateTotalLeads()) * 100).toFixed(1)}%`}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Recommendations */}
              <div className="mt-4 sm:mt-6 bg-blue-50 border-l-4 border-blue-400 p-4">
                <div className="flex">
                  <div className="shrink-0">
                    <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">Conversion Optimization Tips</h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Focus on stages with conversion rates below 40% as they may need process improvement</li>
                        <li>Analyze the drop-off between consecutive stages to identify specific bottlenecks</li>
                        <li>Consider A/B testing different approaches at low-conversion stages</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default ConversionReport;
