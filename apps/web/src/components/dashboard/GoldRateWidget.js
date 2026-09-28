/**
 * Refined GoldRateWidget component for displaying current gold rates
 * Enterprise design with reduced visual dominance
 */
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

// Gold icon
const GoldIcon = () => (
  <svg className="h-4 w-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
  </svg>
);

const GoldRateWidget = () => {
  const [goldRates, setGoldRates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  useAuth();

  // Fetch gold rates
  const fetchGoldRates = async () => {
    try {
      setLoading(true);
      const response = await api.get('/gold/gold-rate');
      // API instance handles HTTP errors through interceptors
      const data = response.data;
      setGoldRates(data);
      setLastUpdated(new Date());
      // Clear any previous refresh errors on successful fetch
      setRefreshError(null);
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch gold rates:', err);
    } finally {
      setLoading(false);
    }
  };

  // Refresh gold rates (admin only)
  const refreshGoldRates = async () => {
    try {
      setRefreshing(true);
      setRefreshError(null);

      await api.post('/gold/refresh');
      // API instance handles HTTP errors through interceptors

      // If refresh was successful, fetch the updated rates
      await fetchGoldRates();
    } catch (err) {
      console.error('Failed to refresh gold rates:', err);
      if (!refreshError) {
        setRefreshError('Failed to refresh gold rates. Please check your connection and try again.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchGoldRates();

    // Set up interval to refresh rates every 5 minutes
    const intervalId = setInterval(fetchGoldRates, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  // Format timestamp to readable format
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-100 p-3 sm:p-5">
        <div className="animate-pulse">
          <div className="h-4 sm:h-5 bg-gray-200 rounded w-1/3 mb-3 sm:mb-4"></div>
          <div className="space-y-2 sm:space-y-3">
            <div className="h-3 sm:h-4 bg-gray-200 rounded"></div>
            <div className="h-3 sm:h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-3 sm:h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-100 p-3 sm:p-5">
        <div className="flex items-center">
          <div className="shrink-0">
            <svg className="h-5 w-5 sm:h-6 sm:w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-2 sm:ml-3">
            <h3 className="text-xs sm:text-sm font-medium text-gray-800">Error Loading Gold Rates</h3>
            <div className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-500">
              <p>{error}</p>
            </div>
            <div className="mt-2 sm:mt-4">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  fetchGoldRates();
                }}
                className="bg-indigo-50 px-2.5 sm:px-4 py-1.5 sm:py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-indigo-700 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-100 relative h-full flex flex-col">
      {refreshing && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 mb-3 sm:mb-4 bg-indigo-100 rounded-full">
              <svg className="animate-spin h-6 w-6 sm:h-8 sm:w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <p className="text-xs sm:text-sm font-medium text-gray-900">Refreshing gold rates...</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1">This may take a moment</p>
          </div>
        </div>
      )}

      <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <GoldIcon />
            <h3 className="ml-2 text-xs sm:text-sm font-medium text-gray-700">
              Gold Rates
            </h3>
          </div>
          <div className="flex items-center">
            <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-green-50 text-green-600 mr-1.5 sm:mr-2">
              Live
            </span>
            <button
              type="button"
              onClick={refreshGoldRates}
              disabled={refreshing}
              className="p-1 text-gray-400 hover:text-indigo-600 focus:outline-none transition-colors duration-150"
              title="Refresh rates"
            >
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {refreshError && (
        <div className="px-3 sm:px-5 py-2 sm:py-3 bg-red-50 border-b border-red-100">
          <div className="flex">
            <div className="shrink-0">
              <svg className="h-4 w-4 sm:h-5 sm:w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-2 sm:ml-3">
              <h3 className="text-xs sm:text-sm font-medium text-red-800">
                Error refreshing gold rates
              </h3>
              <div className="mt-1 text-xs sm:text-sm text-red-700">
                <p>{refreshError}</p>
              </div>
              <div className="mt-1 sm:mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRefreshError(null);
                    refreshGoldRates();
                  }}
                  className="text-xs sm:text-sm text-red-700 underline hover:text-red-600"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-3 sm:px-5 py-3 sm:py-4 flex-grow">
        <div className="space-y-2 sm:space-y-3">
          {goldRates?.rates && Object.entries(goldRates.rates).slice(0, 3).map(([key, value]) => {
            // Parse weight and purity from key (e.g., "24k_1oz" -> weight: "1oz", purity: "24k")
            const parts = key.split('_');
            const purity = parts[0] || '';
            const weight = parts.slice(1).join('_') || '';

            // Determine if price went up or down (mock data for demo)
            const priceChange = Math.random() > 0.5 ? 'up' : 'down';
            const changeIcon = priceChange === 'up' ? (
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg>
            );

            return (
              <div key={key} className="flex items-center justify-between py-1.5 sm:py-2 border-b border-gray-50 last:border-0">
                <div>
                  <div className="flex items-center">
                    <span className="text-xs sm:text-sm font-medium text-gray-900 capitalize">
                      {weight.replace(/_/g, ' ')}
                    </span>
                    <span className="ml-1.5 sm:ml-2 inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-yellow-50 text-yellow-700">
                      {purity.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center">
                  <span className="text-xs sm:text-sm font-semibold text-gray-900">
                    ${typeof value === 'number' ? value.toFixed(2) : value}
                  </span>
                  <span className="ml-1.5 sm:ml-2">
                    {changeIcon}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-auto pt-2 sm:pt-3 border-t border-gray-50">
          <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-400">
            <div>
              Source: <span className="font-medium text-gray-500">{goldRates?.source || 'Market Data'}</span>
            </div>
            {lastUpdated && (
              <div className="flex items-center">
                <svg className="shrink-0 mr-0.5 sm:mr-1 h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <span className="font-medium text-gray-500 hidden xs:inline sm:inline">{formatTimestamp(lastUpdated)}</span>
                <span className="font-medium text-gray-500 inline xs:hidden sm:hidden">{formatTimestamp(lastUpdated).split(',')[0]}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoldRateWidget;
