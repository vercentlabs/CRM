import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';

/**
 * UpdateMyLocation component - Button to update user's GPS location
 * @param {Object} props - Component props
 * @param {Function} props.onSuccess - Function to call when location is successfully updated
 */
const UpdateMyLocation = ({ onSuccess }) => {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5); // Default 5 minutes
  const intervalRef = useRef(null);
  const lastUpdateRef = useRef(null);

  // Extract location update logic to reuse for manual and auto updates
  const updateLocation = useCallback(async () => {
    // Check if user has permission to update location
    if (user?.roleId !== ROLE_ADMIN && user?.roleId !== ROLE_MANAGER && user?.roleId !== ROLE_SALES) {
      setError({
        title: 'Permission Denied',
        message: 'You do not have permission to update location.',
        type: 'permission'
      });
      return false;
    }
    
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      setError({
        title: 'Browser Not Supported',
        message: 'Your browser does not support geolocation. Please try with a modern browser like Chrome, Firefox, or Safari.',
        type: 'unsupported'
      });
      return false;
    }

    try {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          // Success callback
          async (position) => {
            try {
              const { latitude, longitude } = position.coords;
              
              // Send location to API
              const response = await api.post('/sales-locations/update-location', {
                latitude,
                longitude
              });
              
              const data = extractData(response);
              setSuccess('Location updated successfully');
              lastUpdateRef.current = new Date();
              if (onSuccess) onSuccess(data);
              resolve(true);
            } catch (err) {
              if (err.response?.status === 401) {
                setError('Your session has expired. Please log in again.');
              } else if (err.response?.status === 403) {
                setError('You do not have permission to update location.');
              } else if (err.response?.status >= 500) {
                setError('Server error. Please try again later.');
              } else {
                setError(err.response?.data?.message || 'Failed to update location. Please try again.');
              }
              console.error('Failed to update location:', err);
              resolve(false);
            }
          },
          // Error callback
          (err) => {
            switch(err.code) {
              case err.PERMISSION_DENIED:
                setError({
                  title: 'Location Access Denied',
                  message: 'Please enable location access in your browser settings to update your location.',
                  type: 'permission',
                  action: {
                    text: 'Learn How to Enable Location',
                    url: 'https://support.google.com/chrome/answer/142065?hl=en'
                  }
                });
                break;
              case err.POSITION_UNAVAILABLE:
                setError({
                  title: 'Location Unavailable',
                  message: 'Your device could not determine your current location. Please check your GPS or network connection.',
                  type: 'unavailable'
                });
                break;
              case err.TIMEOUT:
                setError({
                  title: 'Location Request Timed Out',
                  message: 'The request to get your location took too long. Please try again.',
                  type: 'timeout'
                });
                break;
              default:
                setError({
                  title: 'Location Error',
                  message: 'An unexpected error occurred while getting your location. Please try again.',
                  type: 'unknown'
                });
                break;
            }
            resolve(false);
          }
        );
      });
    } catch (err) {
      setError('Failed to get location');
      return false;
    }
  }, [user, onSuccess]);

  // Handle updating location
  const handleUpdateLocation = async () => {
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    
    await updateLocation();
    setLoading(false);
  };

  // Set up auto-refresh interval
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      // Convert minutes to milliseconds
      const intervalMs = refreshInterval * 60 * 1000;
      
      // Set up the interval
      intervalRef.current = setInterval(async () => {
        // Don't show loading spinner for automatic updates
        await updateLocation();
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
  }, [autoRefresh, refreshInterval, token, updateLocation]);
  
  // Format last update time
  const formatLastUpdate = () => {
    if (!lastUpdateRef.current) return 'Never';
    
    const now = new Date();
    const diff = Math.floor((now - lastUpdateRef.current) / 1000); // Difference in seconds
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  };

  // Only render for sales users
  if (user?.roleId !== ROLE_SALES) {
    return null;
  }

  return (
    <div className="bg-white shadow sm:rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg leading-6 font-medium text-gray-900">Update My Location</h3>
          <p className="mt-1 text-sm text-gray-500">
            Update your current GPS location to track field presence
          </p>
          {lastUpdateRef.current && (
            <p className="mt-1 text-xs text-gray-400">
              Last updated: {formatLastUpdate()}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <button
            onClick={handleUpdateLocation}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Updating...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                Update Location
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                {error.title || 'Location Error'}
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error.message || 'An error occurred while updating your location.'}</p>
                {error.action && (
                  <div className="mt-3">
                    <div className="flex">
                      <div className="ml-3">
                        <p className="text-sm text-red-700">
                          <a 
                            href={error.action.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="underline font-medium"
                          >
                            {error.action.text}
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {error.type && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowErrorDetails(!showErrorDetails)}
                      className="text-sm text-red-700 underline font-medium"
                    >
                      {showErrorDetails ? 'Hide' : 'Show'} Technical Details
                    </button>
                    {showErrorDetails && (
                      <div className="mt-2 text-xs text-red-600 font-mono bg-red-100 p-2 rounded">
                        Error Type: {error.type}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="mt-4 bg-green-50 border-l-4 border-green-500 p-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-green-700">{success}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Auto-refresh controls */}
      <div className="mt-4 border-t pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <input
              id="auto-refresh"
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="auto-refresh" className="ml-2 block text-sm text-gray-700">
              Auto-refresh location
            </label>
          </div>
          
          {autoRefresh && (
            <div className="flex items-center">
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
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpdateMyLocation;