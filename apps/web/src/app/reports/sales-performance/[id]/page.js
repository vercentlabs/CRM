'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import axios from '@/lib/axios';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { formatNumber, formatPercentage, formatDate } from '@/lib/formatters';

const SalesPerformanceDetail = () => {
  const params = useParams();
  const userId = params.id;
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('30'); // Default to last 30 days

  // Fetch sales performance data
  useEffect(() => {
    const fetchReportData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Build query parameters
        const queryParams = new URLSearchParams();
        queryParams.append('days', dateRange);
        queryParams.append('userId', userId);

        const response = await axios.get(`/reports/sales-performance?${queryParams.toString()}`);

        if (response.data.data && response.data.data.length > 0) {
          setReportData(response.data.data[0]);
        } else {
          setError('No performance data found for this user');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch sales performance data');
        console.error('Error fetching sales performance data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchReportData();
    }
  }, [userId, dateRange]);

  return (
    <ProtectedRoute roles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          {/* Page Header with Gradient Background */}
          <div className="mb-4 sm:mb-6">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg overflow-hidden">
              <div className="px-3 py-3 sm:px-5 sm:py-5 md:px-6 md:py-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="mb-2 sm:mb-0">
                    <Link href="/reports/sales-performance" className="text-indigo-200 hover:text-white mb-2 inline-block text-xs sm:text-sm md:text-base">
                      ← Back to Sales Performance
                    </Link>
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                      Sales Performance Details
                    </h1>
                    <p className="mt-1 sm:mt-1.5 text-indigo-100 text-xs sm:text-sm md:text-base">
                      Detailed performance metrics for sales executive
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 w-full sm:w-auto">
                    <div className="flex items-center">
                      <label htmlFor="dateRange" className="mr-2 block text-[11px] sm:text-xs font-medium text-white">
                        Date Range:
                      </label>
                      <select
                        id="dateRange"
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                        className="block w-full pl-3 pr-10 py-1.5 sm:py-2 text-[11px] sm:text-xs border-white/30 focus:outline-none focus:ring-2 focus:ring-white rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all duration-200 backdrop-blur-sm"
                      >
                        <option value="7" className="text-gray-900">Last 7 days</option>
                        <option value="30" className="text-gray-900">Last 30 days</option>
                        <option value="90" className="text-gray-900">Last 90 days</option>
                        <option value="365" className="text-gray-900">Last year</option>
                      </select>
                    </div>
                  </div>
                </div>
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
              <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r">
                <div className="flex">
                  <div className="shrink-0">
                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{error}</p>
                    </div>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="w-full sm:w-auto bg-red-50 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : reportData ? (
            <>
              {/* User Info Card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="shrink-0 flex flex-col items-center sm:items-start">
                    <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                      <span className="text-white font-medium text-xl sm:text-2xl">
                        {reportData.name?.charAt(0).toUpperCase() || '?'}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{reportData.name || 'Unknown User'}</h2>
                    <p className="text-xs sm:text-sm text-gray-500">{reportData.email || 'No email'}</p>
                  </div>
                  <div className="flex-shrink-0 flex justify-center sm:justify-end">
                    <span className={`inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
                      reportData.conversionRate >= 20 ? 'bg-green-100 text-green-800' :
                      reportData.conversionRate >= 10 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {reportData.conversionRate >= 20 ? 'Excellent' :
                       reportData.conversionRate >= 10 ? 'Good' :
                       'Needs Improvement'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 sm:p-3 sm:p-4 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-xs sm:text-sm font-medium text-gray-600">Total Leads</p>
                      <p className="text-base sm:text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                        {formatNumber(reportData.totalLeads)}
                      </p>
                    </div>
                    <div className="p-1.5 sm:p-2 sm:p-3 bg-blue-50 rounded-lg">
                      <svg className="h-4 w-4 sm:h-5 sm:w-5 sm:h-6 sm:w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-xs sm:text-sm font-medium text-gray-600">Converted Leads</p>
                      <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                        {formatNumber(reportData.convertedLeads)}
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
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-xs sm:text-sm font-medium text-gray-600">Conversion Rate</p>
                      <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                        {formatPercentage(reportData.conversionRate)}
                      </p>
                    </div>
                    <div className="p-2 sm:p-3 bg-indigo-50 rounded-lg">
                      <svg className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-xs sm:text-sm font-medium text-gray-600">Date Range</p>
                      <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                        Last {dateRange} days
                      </p>
                    </div>
                    <div className="p-2 sm:p-3 bg-purple-50 rounded-lg">
                      <svg className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Conversion Rate Visualization */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Conversion Rate</h3>
                <div className="w-full bg-gray-200 rounded-full h-8">
                  <div
                    className={`h-8 rounded-full transition-all duration-300 ${
                      reportData.conversionRate >= 20 ? 'bg-green-500' :
                      reportData.conversionRate >= 10 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(reportData.conversionRate, 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  {reportData.conversionRate >= 20 ? 'Excellent performance - consistently converting leads effectively' :
                    reportData.conversionRate >= 10 ? 'Good performance - meeting conversion targets' :
                    'Needs improvement - focus on follow-up and closing techniques'}
                </p>
              </div>

              {/* Performance Insights */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4">Performance Insights</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-blue-50 rounded-xl p-3 sm:p-4">
                    <div className="flex items-start">
                      <svg className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="ml-3 flex-1 min-w-0">
                        <h4 className="text-xs sm:text-sm font-medium text-gray-900">Lead Volume</h4>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1">
                          {reportData.totalLeads >= 50 ? 'High volume - good prospect acquisition' :
                           reportData.totalLeads >= 20 ? 'Moderate volume - steady pipeline' :
                           'Low volume - increase lead generation efforts'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-xl p-3 sm:p-4">
                    <div className="flex items-start">
                      <svg className="h-5 w-5 text-green-600 mt-0.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="ml-3 flex-1 min-w-0">
                        <h4 className="text-xs sm:text-sm font-medium text-gray-900">Conversion Efficiency</h4>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1">
                          {reportData.convertedLeads >= 10 ? 'Strong conversion numbers - maintain approach' :
                           reportData.convertedLeads >= 5 ? 'Moderate conversions - optimize sales process' :
                           'Few conversions - review sales techniques'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-purple-50 rounded-xl p-3 sm:p-4">
                    <div className="flex items-start">
                      <svg className="h-5 w-5 text-purple-600 mt-0.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <div className="ml-3 flex-1 min-w-0">
                        <h4 className="text-xs sm:text-sm font-medium text-gray-900">Performance Trend</h4>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1">
                          {reportData.conversionRate >= 20 ? 'Trending upward - excellent momentum' :
                           reportData.conversionRate >= 10 ? 'Stable performance - consistent results' :
                           'Declining trend - requires attention and support'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-50 rounded-xl p-3 sm:p-4">
                    <div className="flex items-start">
                      <svg className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div className="ml-3 flex-1 min-w-0">
                        <h4 className="text-xs sm:text-sm font-medium text-gray-900">Recommendation</h4>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1">
                          {reportData.conversionRate >= 20 ? 'Share best practices with team members' :
                           reportData.conversionRate >= 10 ? 'Continue current strategy, minor optimizations' :
                           'Consider training or mentorship program'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance History */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Summary</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Total Leads Handled</span>
                    <span className="text-sm font-medium text-gray-900">{formatNumber(reportData.totalLeads)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Successfully Converted</span>
                    <span className="text-sm font-medium text-gray-900">{formatNumber(reportData.convertedLeads)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Conversion Rate</span>
                    <span className={`text-sm font-medium ${
                      reportData.conversionRate >= 20 ? 'text-green-600' :
                      reportData.conversionRate >= 10 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>{formatPercentage(reportData.conversionRate)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Analysis Period</span>
                    <span className="text-sm font-medium text-gray-900">Last {dateRange} days</span>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default SalesPerformanceDetail;
