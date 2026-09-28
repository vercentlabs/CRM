'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import { formatNumber, formatDate, formatDuration } from '@/lib/formatters';

const LeadAgingReport = () => {
  const { token } = useAuth();
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('30'); // Default to last 30 days
  const [selectedUser, setSelectedUser] = useState(''); // Default to all users
  const [users, setUsers] = useState([]); // List of users for filter

  // Fetch users for filter
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get('/users?role=2,3');

        setUsers(response.data.data || []);
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    };

    if (token) {
      fetchUsers();
    }
  }, [token]);

  // Fetch lead aging data
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

        const response = await axios.get(`/reports/lead-aging?${queryParams.toString()}`);

        setReportData(response.data.data || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch lead aging data');
        console.error('Error fetching lead aging data:', err);
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
    return reportData.reduce((sum, bucket) => sum + bucket.count, 0);
  };

  // Get color for age bucket
  const getBucketColor = (maxDays) => {
    if (maxDays <= 7) return 'bg-green-100 text-green-800';
    if (maxDays <= 30) return 'bg-yellow-100 text-yellow-800';
    if (maxDays <= 60) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <ProtectedRoute roles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <div className="sm:flex sm:items-center">
            <div className="sm:flex-auto">
              <h1 className="text-2xl font-semibold text-gray-900">Lead Aging Report</h1>
              <p className="mt-2 text-sm text-gray-700">
                Track how long leads remain in your pipeline to identify potential issues.
              </p>
            </div>
            <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
              <div className="flex space-x-3">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <svg className="mr-2 -ml-1 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Report
                </button>
                <div className="flex items-center">
                  <label htmlFor="dateRange" className="mr-2 block text-sm font-medium text-gray-700">
                    Date Range:
                  </label>
                  <select
                    id="dateRange"
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="365">Last year</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <label htmlFor="userFilter" className="mr-2 block text-sm font-medium text-gray-700">
                    User:
                  </label>
                  <select
                    id="userFilter"
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  >
                    <option value="">All Users</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
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
              {/* Summary card */}
              <div className="mt-8 bg-white overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-center">
                    <div className="shrink-0 bg-indigo-500 rounded-md p-3">
                      <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Total Leads in Pipeline</dt>
                        <dd className="text-lg font-medium text-gray-900">{formatNumber(calculateTotalLeads())}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              {/* Age buckets */}
              <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {reportData.map((bucket, index) => (
                  <div key={index} className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                      <div className="flex items-center">
                        <div className="shrink-0">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${getBucketColor(bucket.maxDays)}`}>
                            <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">
                              {bucket.minDays === 0 ? `0-${formatDuration(bucket.maxDays)}` : `${formatDuration(bucket.minDays)}-${formatDuration(bucket.maxDays)}`}
                            </dt>
                            <dd className="text-lg font-medium text-gray-900">{formatNumber(bucket.count)}</dd>
                          </dl>
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700">Percentage</span>
                          <span className="text-xs font-medium text-gray-700">
                            {calculateTotalLeads() > 0 ? formatPercentage((bucket.count / calculateTotalLeads()) * 100) : '0%'}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              bucket.maxDays <= 7 ? 'bg-green-500' :
                              bucket.maxDays <= 30 ? 'bg-yellow-500' :
                              bucket.maxDays <= 60 ? 'bg-orange-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${calculateTotalLeads() > 0 ? (bucket.count / calculateTotalLeads()) * 100 : 0}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Detailed table */}
              <div className="mt-8 bg-white shadow overflow-hidden sm:rounded-md">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Lead Details by Age</h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">
                        Detailed breakdown of leads in each age bucket
                      </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Age Range
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Lead Count
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Percentage
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {reportData.map((bucket, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {bucket.minDays === 0 ? `0-${formatDuration(bucket.maxDays)}` : `${formatDuration(bucket.minDays)}-${formatDuration(bucket.maxDays)}`}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatNumber(bucket.count)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {calculateTotalLeads() > 0 ? formatPercentage((bucket.count / calculateTotalLeads()) * 100) : '0%'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getBucketColor(bucket.maxDays)}`}>
                              {bucket.maxDays <= 7 ? 'Fresh' :
                               bucket.maxDays <= 30 ? 'Warm' :
                               bucket.maxDays <= 60 ? 'Stale' : 'Critical'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recommendations */}
              <div className="mt-8 bg-blue-50 border-l-4 border-blue-400 p-4">
                <div className="flex">
                  <div className="shrink-0">
                    <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">Recommendations</h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Focus on leads older than 30 days as they may need additional follow-up</li>
                        <li>Consider automated follow-up sequences for leads in the 60+ day range</li>
                        <li>Analyze conversion rates by lead age to optimize follow-up timing</li>
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

export default LeadAgingReport;
