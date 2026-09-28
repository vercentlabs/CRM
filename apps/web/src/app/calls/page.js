'use client';

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import CallsTable from '@/components/calls/CallsTable';

const CallsPage = () => {
  const { token } = useAuth();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch calls from API
  useEffect(() => {
    const fetchCalls = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await api.get('/calls');

        setCalls(response.data.calls || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch calls');
        console.error('Error fetching calls:', err);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchCalls();
    }
  }, [token]);
  return (
    <ProtectedRoute roles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          {/* Page Header with Gradient Background */}
          <div className="mb-8">
            <div className="bg-linear-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-lg overflow-hidden">
              <div className="px-6 py-8 sm:px-8 sm:py-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div className="mb-6 sm:mb-0">
                    <h1 className="text-3xl sm:text-4xl font-bold text-white">
                      Calls
                    </h1>
                    <p className="mt-2 text-indigo-100 text-base sm:text-lg">
                      View and manage call logs with your leads
                    </p>
                    <div className="mt-3 flex items-center">
                      <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-white/20 text-white backdrop-blur-sm">
                        <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                        {calls.length} Total Calls
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {/* Refresh Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        if (token) {
                          api.get('/calls')
                            .then(response => setCalls(response.data.calls || []))
                            .catch(err => {
                              setError(err.response?.data?.message || 'Failed to fetch calls');
                              console.error('Error fetching calls:', err);
                            });
                        }
                      }}
                      className="inline-flex items-center px-4 py-2.5 border border-white/30 rounded-xl text-sm font-medium text-white bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white focus:ring-offset-indigo-600 transition-all duration-200 backdrop-blur-sm"
                    >
                      <svg className="mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh
                    </button>

                    {/* Export Button */}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const response = await api.get('/reports/export-calls-csv', {
                            headers: { 'Accept': 'text/csv' },
                            responseType: 'blob'
                          });

                          const url = window.URL.createObjectURL(new Blob([response.data]));
                          const link = document.createElement('a');
                          link.href = url;
                          link.setAttribute('download', `calls-export-${new Date().toISOString().slice(0, 10)}.csv`);
                          document.body.appendChild(link);
                          link.click();
                          link.remove();
                          window.URL.revokeObjectURL(url);
                        } catch (err) {
                          console.error('Error exporting calls:', err);
                          alert('Failed to export calls. Please try again.');
                        }
                      }}
                      className="inline-flex items-center px-4 py-2.5 border border-white/30 rounded-xl text-sm font-medium text-white bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white focus:ring-offset-indigo-600 transition-all duration-200 backdrop-blur-sm"
                    >
                      <svg className="mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Calls content */}
          <div className="mt-8 bg-white shadow rounded-lg overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="text-center">
                  <div className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full text-indigo-600" role="status"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading calls...</p>
                </div>
              </div>
            ) : error ? (
              <div className="px-4 py-5 sm:p-6">
                <div className="bg-red-50 border-l-4 border-red-400 p-4">
                  <div className="flex">
                    <div className="shrink-0">
                      <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        Error loading calls
                      </h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                      </div>
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            if (token) {
                              api.get('/calls')
                                .then(response => setCalls(response.data.calls || []))
                                .catch(err => {
                                  setError(err.response?.data?.message || 'Failed to fetch calls');
                                  console.error('Error fetching calls:', err);
                                });
                            }
                          }}
                          className="bg-red-50 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : calls.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-500 mb-4">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">No calls logged</h3>
                <div className="mt-2 max-w-xl text-sm text-gray-500">
                  Call logs will appear here once you start making calls to your leads.
                </div>
              </div>
            ) : (
              <CallsTable
                calls={calls}
                onViewLead={(lead) => window.location.href = `/leads/${lead.id}`}
              />
            )}
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default CallsPage;
