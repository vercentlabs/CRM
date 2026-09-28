 'use client';

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import LocationsTable from '@/components/locations/LocationsTable';
import CreateLocationForm from '@/components/locations/CreateLocationForm';
import EditLocationForm from '@/components/locations/EditLocationForm';
import UpdateMyLocation from '@/components/locations/UpdateMyLocation';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';

const SalesLocationsPage = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const { token, user } = useAuth();

  // Fetch sales locations from API
  const fetchLocations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get('/sales-locations');

      setLocations(response.data.locations || []);
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
      } else if (err.response?.status === 403) {
        setError('You do not have permission to view sales locations.');
      } else if (err.response?.status >= 500) {
        setError('Server error. Please try again later.');
      } else {
        setError('Failed to load sales locations. Please try again.');
      }
      console.error('Failed to fetch sales locations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch locations on component mount
  useEffect(() => {
    if (token) {
      fetchLocations();
    }
  }, [token, fetchLocations]);

  return (
    <ProtectedRoute allowedRoles={[ROLE_ADMIN, ROLE_MANAGER]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Sales Locations</h1>
              <p className="mt-2 text-gray-600">Manage office/store locations. Leads and executives are linked to locations.</p>
              {(user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) && (
                <div className="mt-4">
                  <a
                    href="/locations/executives"
                    className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    View Executives Live Location
                  </a>
                </div>
              )}
            </div>
            {user?.roleId === ROLE_ADMIN && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add Location
              </button>
            )}
          </div>

          {editingLocation ? (
            <EditLocationForm
              location={editingLocation}
              onSuccess={(updatedLocation) => {
                setLocations(prev => prev.map(loc => 
                  loc.id === updatedLocation.id ? updatedLocation : loc
                ));
                setEditingLocation(null);
              }}
              onCancel={() => setEditingLocation(null)}
            />
          ) : showCreateForm ? (
            <CreateLocationForm
              onSuccess={(newLocation) => {
                setLocations(prev => [newLocation, ...prev]);
                setShowCreateForm(false);
              }}
              onCancel={() => setShowCreateForm(false)}
            />
          ) : loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          ) : locations.length === 0 ? (
            <div className="border-4 border-dashed border-gray-200 rounded-lg h-64 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-500">No sales locations found. Add your first location to get started.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Show location update component only for sales users */}
              {user?.roleId === ROLE_SALES && (
                <div className="mb-6">
                  <UpdateMyLocation 
                    onSuccess={() => console.log('Location updated successfully')}
                  />
                </div>
              )}
              
              {/* Locations table - only show to Admin/Manager users */}
              {(user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) && (
                <LocationsTable 
                  locations={locations}
                  onEditLocation={(location) => setEditingLocation(location)}
                  onDeleteLocation={(location) => console.log('Delete location:', location)}
                />
              )}
              
              {/* Sales users get a simple message about their location updates */}
              {user?.roleId === ROLE_SALES && (
                <div className="bg-white shadow sm:rounded-lg p-6">
                  <div className="text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <h3 className="mt-2 text-lg font-medium text-gray-900">Location Tracking</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Your location is being tracked to help managers coordinate field activities.
                      Use the update location button above to ensure your location is current.
                    </p>
                    <div className="mt-4">
                      <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-green-400" fill="currentColor" viewBox="0 0 8 8">
                          <circle cx="4" cy="4" r="3" />
                        </svg>
                        Access Restricted: You can only update your own location
                      </div>
                    </div>
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

export default SalesLocationsPage;
