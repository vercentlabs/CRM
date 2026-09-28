'use client';

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import CreateFollowupDrawer from '@/components/followups/CreateFollowupDrawer';
import FollowupsTable from '@/components/followups/FollowupsTable';
import FollowupsPageHeader from '@/components/followups/FollowupsPageHeader';

const FollowUpsPage = () => {
  const { token, user } = useAuth();
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);

  // Fetch follow-ups from API
  const fetchFollowUps = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get('/followups');

      // Filter follow-ups based on user role
      const allFollowups = response.data.followups || [];
      const filteredFollowups = user?.roleId === ROLE_SALES 
        ? allFollowups.filter(followup => followup.assignedTo?.id === user.id)
        : allFollowups;

      setFollowups(filteredFollowups);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch follow-ups');
      console.error('Error fetching follow-ups:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (token) {
      fetchFollowUps();
    }
  }, [token, fetchFollowUps]);

  // Handle follow-up form submission
  const handleCreateFollowup = async (formData) => {
    try {
      setFormLoading(true);
      setFormError(null);

      await api.post(`/leads/${formData.leadId}/followups`, {
        followup_type: formData.followupType,
        followup_date: formData.followupDate,
        notes: formData.notes
      });

      // Refresh follow-ups list
      await fetchFollowUps();
      setShowCreateForm(false);
      setSelectedLead(null);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create follow-up');
      console.error('Error creating follow-up:', err);
    } finally {
      setFormLoading(false);
    }
  };

  // Handle opening the create form for a specific lead
  const handleOpenCreateForm = (lead) => {
    setSelectedLead(lead);
    setShowCreateForm(true);
    setFormError(null);
  };

  // Handle closing the create form
  const handleCloseCreateForm = () => {
    setShowCreateForm(false);
    setSelectedLead(null);
    setFormError(null);
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'Not scheduled';

    const date = new Date(dateString);
    const today = new Date();

    // If it's today, show time only
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    // Otherwise show date in a readable format
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  };

  return (
    <ProtectedRoute roles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <FollowupsPageHeader
            count={followups.length}
            onRefresh={fetchFollowUps}
          />

          {/* Create Follow-up Drawer */}
          {showCreateForm && selectedLead && (
            <CreateFollowupDrawer
              lead={selectedLead}
              onSubmit={async (formData) => {
                try {
                  setFormLoading(true);
                  setFormError(null);

                  await api.put(`/leads/${formData.id}`, {
                    status: formData.status,
                    next_call_at: formData.next_call_at,
                    notes: formData.notes
                  });

                  // Refresh follow-ups list
                  await fetchFollowUps();
                  setShowCreateForm(false);
                  setSelectedLead(null);
                } catch (err) {
                  setFormError(err.response?.data?.message || 'Failed to update lead');
                  console.error('Error updating lead:', err);
                  throw err;
                } finally {
                  setFormLoading(false);
                }
              }}
              onCancel={() => {
                setShowCreateForm(false);
                setSelectedLead(null);
                setFormError(null);
              }}
              isLoading={formLoading}
            />
          )}

          <div className="mt-8 bg-white shadow rounded-lg overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="text-center">
                  <div className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full text-indigo-600" role="status"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading follow-ups...</p>
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
                        Error loading follow-ups
                      </h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                      </div>
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={fetchFollowUps}
                          className="bg-red-50 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : followups.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No follow-ups scheduled</p>
              </div>
            ) : (
              <FollowupsTable
                followups={followups}
                onViewLead={(lead) => window.location.href = `/leads/${lead.id}`}
                onEditLead={(lead) => {
                  setSelectedLead(lead);
                  setShowCreateForm(true);
                  setFormError(null);
                }}
                onRefreshFollowups={fetchFollowUps}
              />
            )}
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default FollowUpsPage;
