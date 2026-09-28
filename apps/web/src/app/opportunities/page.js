
'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import OpportunityList from '@/components/opportunities/OpportunityList';
import OpportunityDrawer from '@/components/opportunities/OpportunityDrawer';
import OpportunitiesPageHeader from '@/components/opportunities/OpportunitiesPageHeader';

const OpportunitiesPage = () => {
  const [opportunities, setOpportunities] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState(null);
  const { token, user } = useAuth();

  // Fetch leads for the form dropdown
  const fetchLeads = async () => {
    try {
      const response = await api.get('/leads');
      setLeads(response.data.leads || []);
    } catch (err) {
      console.error('Error fetching leads:', err);
    }
  };

  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await api.get('/opportunities');
        
        // Handle error responses
        if (response.status >= 400) {
          const errorMessage = response.data?.message || 'Failed to fetch opportunities';
          setError(errorMessage);
          throw new Error(errorMessage);
        }
        
        // Filter opportunities based on user role
        const allOpportunities = response.data.opportunities || [];
        const filteredOpportunities = user?.roleId === ROLE_SALES
          ? allOpportunities.filter(opp => opp.assigned_to === user.id)
          : allOpportunities;

        setOpportunities(filteredOpportunities);
      } catch (err) {
        console.error('Failed to fetch opportunities:', err);
        if (!error) {
          setError('Failed to load opportunities. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchOpportunities();
      fetchLeads();
    }
  }, [token, error, user?.id, user?.roleId]);

  // Handle opening the form for creating a new opportunity
  const handleAddOpportunity = () => {
    setEditingOpportunity(null);
    setShowForm(true);
  };

  // Handle opening the form for editing an opportunity
  const handleEditOpportunity = (opportunity) => {
    setEditingOpportunity(opportunity);
    setShowForm(true);
  };

  // Handle closing the form
  const handleCloseForm = () => {
    setShowForm(false);
    setEditingOpportunity(null);
  };

  // Handle successful form submission
  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingOpportunity(null);
    // Refetch opportunities
    const fetchOpportunities = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await api.get('/opportunities');

        // Handle error responses
        if (response.status >= 400) {
          const errorMessage = response.data?.message || 'Failed to fetch opportunities';
          setError(errorMessage);
          throw new Error(errorMessage);
        }
        // Filter opportunities based on user role
        const allOpportunities = response.data.opportunities || [];
        const filteredOpportunities = user?.roleId === ROLE_SALES
          ? allOpportunities.filter(opp => opp.assigned_to === user.id)
          : allOpportunities;

        setOpportunities(filteredOpportunities);
      } catch (err) {
        console.error('Failed to fetch opportunities:', err);
        if (!error) {
          setError('Failed to load opportunities. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchOpportunities();
  };
  return (
    <ProtectedRoute allowedRoles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          {/* Page Header with Gradient Background */}
          <OpportunitiesPageHeader
            count={opportunities.length}
            onExport={(user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) ? async () => {
              try {
                const response = await api.get('/reports/export-opportunities-csv', {
                  headers: { 'Accept': 'text/csv' },
                  responseType: 'blob'
                });

                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `opportunities-export-${new Date().toISOString().slice(0, 10)}.csv`);
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
              } catch (err) {
                console.error('Error exporting opportunities:', err);
                alert('Failed to export opportunities. Please try again.');
              }
            } : null}
            onRefresh={() => {
              setError(null);
              if (token) {
                fetchOpportunities();
                fetchLeads();
              }
            }}
            onAddOpportunity={handleAddOpportunity}
          />

          <div className="bg-white shadow overflow-hidden sm:rounded-md rounded-lg">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading opportunities...</p>
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
                        Error loading opportunities
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
                              fetchOpportunities();
                              fetchLeads();
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
            ) : (
              <OpportunityList
                opportunities={opportunities}
                onEdit={handleEditOpportunity}
              />
            )}
          </div>

          {/* Form Drawer */}
          {showForm && (
            <OpportunityDrawer
              opportunity={editingOpportunity}
              leads={leads}
              onSuccess={async (formData) => {
                try {
                  setLoading(true);
                  setError(null);

                  const endpoint = editingOpportunity ? `/opportunities/${editingOpportunity.id}` : '/opportunities';
                  const method = editingOpportunity ? 'PUT' : 'POST';

                  const response = await api({
                    method,
                    url: endpoint,
                    data: formData
                  });

                  // Call success callback
                  handleFormSuccess();
                } catch (err) {
                  setError(err.response?.data?.message || `Failed to ${editingOpportunity ? 'update' : 'create'} opportunity`);
                  console.error(`Error ${editingOpportunity ? 'updating' : 'creating'} opportunity:`, err);
                } finally {
                  setLoading(false);
                }
              }}
              onCancel={handleCloseForm}
              isLoading={loading}
            />
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default OpportunitiesPage;
