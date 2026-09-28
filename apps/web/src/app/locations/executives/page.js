'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';

/**
 * ExecutivesLocation page - Page to view live locations of executives
 */
const ExecutivesLocationPage = () => {
  const [executives, setExecutives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(2); // Default 2 minutes
  const { token } = useAuth();
  const intervalRef = useRef(null);

  // Fetch executives locations from API
  const fetchExecutivesLocations = useCallback(async () => {
    try {
      const response = await axios.get('/sales-locations/executives');

      if (response.data.success) {
        setExecutives(response.data.executives || []);
      } else {
        setError(response.data.message || 'Failed to fetch executives locations');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
      } else if (err.response?.status === 403) {
        setError('You do not have permission to view executives locations.');
      } else if (err.response?.status >= 500) {
        setError('Server error. Please try again later.');
      } else {
        setError(err.response?.data?.message || 'Failed to fetch executives locations. Please try again.');
      }
      console.error('Failed to fetch executives locations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchExecutivesLocations();
  }, [token, fetchExecutivesLocations]);

  // Set up auto-refresh interval
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      // Convert minutes to milliseconds
      const intervalMs = refreshInterval * 60 * 1000;

      // Set up the interval
      intervalRef.current = setInterval(() => {
        fetchExecutivesLocations();
      }, intervalMs);

      // Clean up interval on component unmount or when settings change
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    } else {
      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [autoRefresh, refreshInterval, token, fetchExecutivesLocations]);

  // Format last update time
  const formatLastUpdate = (dateString) => {
    if (!dateString) return 'Never';

    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // Difference in seconds

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  };

  // Toggle between list and future map view
  const [viewMode, setViewMode] = useState('list');
  
  // Check if location data is stale
  const isLocationStale = (dateString) => {
    if (!dateString) return true;
    
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // Difference in seconds
    
    // Consider data stale if older than 15 minutes
    return diff > 900;
  };
  
  // Get freshness status and styling
  const getLocationFreshness = (dateString) => {
    if (!dateString) {
      return {
        status: 'No Data',
        className: 'text-gray-400',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      };
    }
    
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // Difference in seconds
    
    if (diff < 300) { // Less than 5 minutes
      return {
        status: 'Live',
        className: 'text-green-500',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      };
    } else if (diff < 900) { // 5-15 minutes
      return {
        status: 'Recent',
        className: 'text-yellow-500',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      };
    } else { // More than 15 minutes
      return {
        status: 'Stale',
        className: 'text-red-500',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      };
    }
  };

  // Format date for display
  const formatDateTime = (dateString) => {
    if (!dateString) return 'Never';
    
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Sales users should be redirected to main locations page
  if (user?.roleId === ROLE_SALES) {
    return (
      <ProtectedRoute allowedRoles={[ROLE_SALES]}>
        <AppLayout>
          <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
            <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700">
                    You don&apos;t have permission to view this page. Sales users can only update their own location.
                  </p>
                  <div className="mt-4">
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-green-400" fill="currentColor" viewBox="0 0 8 8">
                        <circle cx="4" cy="4" r="3" />
                      </svg>
                      Access Control: This is the correct behavior for Sales users
                    </div>
                  </div>
                  <div className="mt-4">
                    <a
                      href="/locations"
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      Go to My Location Page
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AppLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={[ROLE_ADMIN, ROLE_MANAGER]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Executives Live Location</h1>
              <p className="mt-2 text-gray-600">View real-time location of sales executives in the field</p>
            </div>
            <div className="flex items-center">
              <input
                id="auto-refresh"
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="auto-refresh" className="ml-2 block text-sm text-gray-700">
                Auto-refresh
              </label>

              {autoRefresh && (
                <div className="ml-4 flex items-center">
                  <label htmlFor="refresh-interval" className="mr-2 block text-sm text-gray-700">
                    Every
                  </label>
                  <select
                    id="refresh-interval"
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    className="block w-20 py-1 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option value={1}>1 min</option>
                    <option value={2}>2 min</option>
                    <option value={5}>5 min</option>
                    <option value={10}>10 min</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* View mode toggle */}
              <div className="mb-6 bg-white shadow sm:rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    {executives.length} executives with location data
                    {executives.some(e => isLocationStale(e.lastLocationUpdate)) && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Some data may be stale
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">View:</span>
                    <div className="inline-flex rounded-md shadow-sm">
                      <button
                        onClick={() => setViewMode('list')}
                        className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
                          viewMode === 'list'
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700 z-10'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        List View
                      </button>
                      <button
                        onClick={() => setViewMode('map')}
                        className={`px-4 py-2 text-sm font-medium rounded-r-md border ${
                          viewMode === 'map'
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700 z-10'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                        disabled
                      >
                        Map View
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* List view */}
              {viewMode === 'list' && (
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                  <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Executive Locations
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                      Detailed list of executives and their current locations
                    </p>
                  </div>
                  <ul className="divide-y divide-gray-200">
                    {executives.length > 0 ? (
                      executives.map((executive) => (
                        <li key={executive.id}>
                          <div className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <div className="shrink-0 h-12 w-12">
                                  <div className="h-12 w-12 rounded-full bg-indigo-500 flex items-center justify-center">
                                    <span className="text-white font-medium text-lg">
                                      {executive.name ? executive.name.charAt(0).toUpperCase() : 'E'}
                                    </span>
                                  </div>
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">
                                    {executive.name || 'Unknown Executive'}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {executive.email || 'No email'}
                                  </div>
                                </div>
                              </div>
                              <div className="ml-4 shrink-0">
                                <div className="text-sm text-gray-500">
                                  {executive.latitude && executive.longitude ? (
                                    <div className="flex items-center">
                                      {getLocationFreshness(executive.lastLocationUpdate).icon}
                                      <div>
                                        <div className="flex items-center">
                                          <span className={`text-xs font-medium ${getLocationFreshness(executive.lastLocationUpdate).className}`}>
                                            {getLocationFreshness(executive.lastLocationUpdate).status}
                                          </span>
                                          {isLocationStale(executive.lastLocationUpdate) && (
                                            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                              Stale
                                            </span>
                                          )}
                                        </div>
                                        <div className="font-mono text-xs mt-1">
                                          {executive.latitude.toFixed(6)}, {executive.longitude.toFixed(6)}
                                        </div>
                                        <div className="text-xs text-gray-400">
                                          Last updated: {formatLastUpdate(executive.lastLocationUpdate)}
                                        </div>
                                        <div className="text-xs text-gray-400">
                                          {formatDateTime(executive.lastLocationUpdate)}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                      </svg>
                                      <span className="text-gray-400">No location data</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))
                    ) : (
                      <li>
                        <div className="px-4 py-12 sm:px-6">
                          <div className="text-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No location data</h3>
                            <p className="mt-1 text-sm text-gray-500">No executives have shared their location yet.</p>
                          </div>
                        </div>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Map view placeholder (for future implementation) */}
              {viewMode === 'map' && (
                <div className="bg-white shadow sm:rounded-lg p-8">
                  <div className="text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">Map View Coming Soon</h3>
                    <p className="mt-1 text-sm text-gray-500">We&apos;re working on adding a map view for better visualization.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default ExecutivesLocationPage;
