"use client";

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import FollowupsTable from '@/components/followups/FollowupsTable';
import OverdueFollowupsPageHeader from '@/components/followups/OverdueFollowupsPageHeader';
import CreateFollowupDrawer from '@/components/followups/CreateFollowupDrawer';

const OverdueFollowupsPage = () => {
  const { token } = useAuth();
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState(null);

  // Fetch overdue follow-ups from API
  const fetchOverdueFollowups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get('/followups/overdue');

      console.log('Overdue followups response:', response.data);
      console.log('Followups array:', response.data.followups);

      setFollowups(response.data.followups || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch overdue follow-ups');
      console.error('Error fetching overdue follow-ups:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchOverdueFollowups();
    }
  }, [token, fetchOverdueFollowups]);

  // Handle opening the drawer for a specific lead
  const handleOpenDrawer = (lead) => {
    setSelectedLead(lead);
    setShowDrawer(true);
    setDrawerError(null);
  };

  // Handle closing the drawer
  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setSelectedLead(null);
    setDrawerError(null);
  };

  // Handle lead update
  const handleUpdateLead = async (formData) => {
    try {
      setDrawerLoading(true);
      setDrawerError(null);

      await api.put(`/leads/${formData.id}`, {
        status: formData.status,
        next_call_at: formData.next_call_at,
        notes: formData.notes
      });

      // Refresh follow-ups list
      await fetchOverdueFollowups();
      setShowDrawer(false);
      setSelectedLead(null);
    } catch (err) {
      setDrawerError(err.response?.data?.message || 'Failed to update lead');
      console.error('Error updating lead:', err);
      throw err;
    } finally {
      setDrawerLoading(false);
    }
  };

  return (
    <ProtectedRoute roles={[ROLE_ADMIN, ROLE_MANAGER]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <OverdueFollowupsPageHeader
            count={followups.length}
            onRefresh={fetchOverdueFollowups}
          />

          {/* Overdue follow-ups content */}
          <div className="mt-8 bg-white shadow rounded-lg overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="text-center">
                  <div className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full text-indigo-600" role="status"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading overdue follow-ups...</p>
                </div>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <div className="text-red-500 text-lg mb-2">Error</div>
                <p className="text-gray-500">{error}</p>
                <button
                  onClick={fetchOverdueFollowups}
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Try Again
                </button>
              </div>
            ) : followups.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-500 mb-4">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">No overdue follow-ups</h3>
                <div className="mt-2 max-w-xl text-sm text-gray-500 mx-auto text-center">
                  Great job! All follow-ups are up to date.
                </div>
              </div>
            ) : (
              <FollowupsTable
                followups={followups}
                onViewLead={(lead) => window.location.href = `/leads/${lead.id || lead}`}
                onRefreshFollowups={fetchOverdueFollowups}
                onEditLead={handleOpenDrawer}
                showActions={true}
              />
            )}
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default OverdueFollowupsPage;
