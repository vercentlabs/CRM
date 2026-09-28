
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import LeadsTable from '@/components/leads/LeadsTable';
import LeadsKanban from '@/components/leads/LeadsKanban';
import LeadsPageHeader from '@/components/leads/LeadsPageHeader';
import LeadsFilterBar from '@/components/leads/LeadsFilterBar';
import CreateLeadDrawer from '@/components/leads/CreateLeadDrawer';
import AssignLeadModal from '@/components/leads/AssignLeadModal';
import EditLeadDrawer from '@/components/leads/EditLeadDrawer';
import LeadDetailsDrawer from '@/components/leads/LeadDetailsDrawer';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { extractData } from '@/lib/response';
import { useAuth } from '@/context/AuthContext';

const LeadsPage = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreatingLead, setIsCreatingLead] = useState(false);
  const [createLeadError, setCreateLeadError] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showLeadDetails, setShowLeadDetails] = useState(false);
  const [isUpdatingLead, setIsUpdatingLead] = useState(false);
  const [viewMode, setViewMode] = useState('kanban');
  const { token, user } = useAuth();

  // State for filters
  const [filters, setFilters] = useState({});

  // State for pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0
  });

  // Export leads to CSV
  const exportLeadsToCSV = async () => {
    // Check if user has permission to export leads
    if (user?.roleId !== ROLE_ADMIN && user?.roleId !== ROLE_MANAGER) {
      alert('You do not have permission to export leads.');
      return;
    }
    
    try {
      // Build query string from current filters
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
      });

      const response = await api.get(`/reports/export-leads-csv?${queryParams.toString()}`, {
        headers: {
          'Accept': 'text/csv'
        },
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leads-export-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting leads:', err);
      alert('Failed to export leads. Please try again.');
    }
  };

  // Fetch leads from API
  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query string from filters and pagination
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        queryParams.append(key, value);
      });

      // Add pagination parameters
      queryParams.append('page', pagination.page);
      queryParams.append('limit', pagination.limit);

      const response = await api.get(`/leads?${queryParams.toString()}`);

      const data = extractData(response);
      setLeads(data.leads || []);

      // Update pagination info from response
      if (data.pagination) {
        setPagination(prev => ({
          ...prev,
          total: data.pagination.total
        }));
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
      } else if (err.response?.status === 403) {
        setError('You do not have permission to view leads.');
      } else if (err.response?.status >= 500) {
        setError('Server error. Please try again later.');
      } else {
        setError('Failed to load leads. Please try again.');
      }
      console.error('Failed to fetch leads:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit]);

  // Reset pagination when filters change
  useEffect(() => {
    setPagination(prev => ({
      ...prev,
      page: 1
    }));
  }, [filters]);

  // Fetch leads on component mount and when filters or pagination change
  useEffect(() => {
    if (token) {
      fetchLeads();
    }
  }, [token, filters, pagination.page, fetchLeads]);

  // Handle lead status change (for Kanban drag and drop)
  const handleStatusChange = async (lead, newStatus) => {
    try {
      await api.put(`/leads/${lead.id}`, { status: newStatus });
      // Refresh leads list
      await fetchLeads();
    } catch (err) {
      console.error('Failed to update lead status:', err);
      alert('Failed to update lead status. Please try again.');
    }
  };

  // Handle lead creation
  const handleCreateLead = async (leadData) => {
    // Check if user has permission to create leads
    if (user?.roleId !== ROLE_ADMIN && user?.roleId !== ROLE_MANAGER && user?.roleId !== ROLE_SALES) {
      setCreateLeadError('You do not have permission to create leads.');
      return;
    }
    
    try {
      setIsCreatingLead(true);
      setCreateLeadError(null);

      const response = await api.post('/leads', leadData);

      // Close the form
      setShowCreateForm(false);

      // Show lead details drawer for the newly created lead
      // Use the response data directly to avoid timing issues with fetchLeads
      if (response.data?.lead) {
        setSelectedLead(response.data.lead);
        setShowLeadDetails(true);
      }

      // Refresh leads list in background
      await fetchLeads();

      return response.data;
    } catch (err) {
      if (err.response?.status === 400) {
        // Validation errors from backend
        setCreateLeadError(err.response.data.message || 'Invalid lead data. Please check your inputs.');
      } else if (err.response?.status === 401) {
        setCreateLeadError('Your session has expired. Please log in again.');
      } else if (err.response?.status === 403) {
        setCreateLeadError('You do not have permission to create leads.');
      } else if (err.response?.status >= 500) {
        setCreateLeadError('Server error. Please try again later.');
      } else {
        setCreateLeadError('Failed to create lead. Please try again.');
      }
      console.error('Failed to create lead:', err);
      throw err;
    } finally {
      setIsCreatingLead(false);
    }
  };

  // Handle lead update from details drawer
  const handleUpdateLead = async (updateData) => {
    if (!selectedLead) return;

    try {
      setIsUpdatingLead(true);

      const response = await api.put(`/leads/${selectedLead.id}`, updateData);

      // Refresh leads list
      await fetchLeads();

      // Update selected lead with new data
      setSelectedLead(prev => ({
        ...prev,
        ...updateData
      }));

      // Close drawer if lead is now complete
      const isComplete = updateData.assigned_to && updateData.next_call_at;
      if (isComplete) {
        setShowLeadDetails(false);
      }

      return response.data;
    } catch (err) {
      console.error('Failed to update lead:', err);
      throw err;
    } finally {
      setIsUpdatingLead(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          {/* Page Header with Gradient Background */}
          <LeadsPageHeader
            count={leads.length}
            onExport={(user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) ? exportLeadsToCSV : null}
            onRefresh={fetchLeads}
            onUpload={null}
            onAddLead={() => setShowCreateForm(true)}
          />

          <div className="bg-white shadow overflow-hidden sm:rounded-md rounded-lg">
            {showCreateForm ? (
              <CreateLeadDrawer
                onSubmit={handleCreateLead}
                onCancel={() => setShowCreateForm(false)}
                isLoading={isCreatingLead}
              />
            ) : loading ? (
              <div className="px-4 py-8 sm:p-6 lg:p-8">
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-indigo-600"></div>
                </div>
              </div>
            ) : error ? (
              <div className="px-4 py-5 sm:p-6">
                <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r">
                  <div className="flex">
                    <div className="shrink-0">
                      <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-sm font-medium text-red-800">
                        Error loading leads
                      </h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                      </div>
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => fetchLeads()}
                          className="w-full sm:w-auto bg-red-50 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center py-10 sm:py-12">
                <svg className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No leads</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by adding a new lead.</p>
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="inline-flex items-center w-full sm:w-auto justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-black bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Add Lead
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <LeadsFilterBar
                  filters={filters}
                  onFiltersChange={setFilters}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                />
                {viewMode === 'kanban' ? (
                  <LeadsKanban 
                  leads={leads}
                  onViewLead={(lead) => {
                    // TODO: Implement view lead functionality
                  }}
                  onAssignLead={(lead) => {
                    setSelectedLead(lead);
                    setShowAssignModal(true);
                  }}
                  onEditLead={(lead) => {
                    // Check if user has permission to edit this lead
                    if (user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) {
                      setSelectedLead(lead);
                      setShowEditModal(true);
                    } else if (user?.roleId === ROLE_SALES) {
                      if (lead.assignedTo?.id === user?.id) {
                        setSelectedLead(lead);
                        setShowEditModal(true);
                      } else {
                        alert('You are not allowed to edit this lead');
                      }
                    }
                  }}
                  onDeleteLead={(lead) => {
                    // TODO: Implement delete lead functionality
                  }}
                  onStatusChange={handleStatusChange}
                  onCreateLead={() => {
                    setShowCreateForm(true);
                  }}
                />
                ) : (
                  <LeadsTable
                    leads={leads}
                    onViewLead={(lead) => {
                      setSelectedLead(lead);
                      setShowLeadDetails(true);
                    }}
                    onAssignLead={(lead) => {
                      setSelectedLead(lead);
                      setShowAssignModal(true);
                    }}
                    onEditLead={(lead) => {
                      // Check if user has permission to edit this lead
                      if (user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) {
                        setSelectedLead(lead);
                        setShowEditModal(true);
                      } else if (user?.roleId === ROLE_SALES) {
                        if (lead.assigned_to === user?.id) {
                          setSelectedLead(lead);
                          setShowEditModal(true);
                        } else {
                          alert('You are not allowed to edit this lead');
                        }
                      }
                    }}
                    onDeleteLead={(lead) => {
                      // TODO: Implement delete lead functionality
                    }}
                  />
                )}

                {/* Pagination Controls */}
                {pagination.total > pagination.limit && (
                  <div className="bg-white px-3 py-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 gap-3 sm:gap-0">
                    <div className="flex-1 flex justify-between w-full sm:hidden order-2">
                      <button
                        onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                        disabled={pagination.page === 1}
                        className="flex-1 mr-2 relative inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPagination(prev => ({ ...prev, page: Math.min(Math.ceil(pagination.total / pagination.limit), prev.page + 1) }))}
                        disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                        className="flex-1 ml-2 relative inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between w-full order-1 sm:order-none">
                      <div>
                        <p className="text-sm text-gray-700">
                          Showing <span className="font-medium">{(pagination.page - 1) * pagination.limit + 1}</span> to{' '}
                          <span className="font-medium">
                            {Math.min(pagination.page * pagination.limit, pagination.total)}
                          </span>{' '}
                          of <span className="font-medium">{pagination.total}</span> results
                        </p>
                      </div>
                      <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                          <button
                            onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                            disabled={pagination.page === 1}
                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="sr-only">Previous</span>
                            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>

                          {/* Page numbers */}
                          {Array.from({ length: Math.min(5, Math.ceil(pagination.total / pagination.limit)) }, (_, i) => {
                            // Show pages around current page
                            let pageNum;
                            const totalPages = Math.ceil(pagination.total / pagination.limit);

                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (pagination.page <= 3) {
                              pageNum = i + 1;
                            } else if (pagination.page >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = pagination.page - 2 + i;
                            }

                            return (
                              <button
                                key={pageNum}
                                onClick={() => setPagination(prev => ({ ...prev, page: pageNum }))}
                                className={`relative inline-flex items-center px-3 py-2 sm:px-4 sm:py-2 border text-sm font-medium ${
                                  pageNum === pagination.page
                                    ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}

                          <button
                            onClick={() => setPagination(prev => ({ ...prev, page: Math.min(Math.ceil(pagination.total / pagination.limit), prev.page + 1) }))}
                            disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="sr-only">Next</span>
                            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Assign Lead Modal */}
          {showAssignModal && selectedLead && (
            <AssignLeadModal
              lead={selectedLead}
              onClose={() => {
                setShowAssignModal(false);
                setSelectedLead(null);
              }}
              onSuccess={() => {
                // Refresh leads list after successful assignment
                fetchLeads();
              }}
            />
          )}

          {/* Edit Lead Drawer */}
          {showEditModal && selectedLead && (
            <EditLeadDrawer
              lead={selectedLead}
              onCancel={() => {
                setShowEditModal(false);
                setSelectedLead(null);
              }}
              onSuccess={() => {
                // Refresh leads list after successful edit
                fetchLeads();
              }}
            />
          )}

          {/* Lead Details Drawer - Progressive Lead Completion */}
          {showLeadDetails && selectedLead && (
            <LeadDetailsDrawer
              lead={selectedLead}
              onClose={() => {
                setShowLeadDetails(false);
                setSelectedLead(null);
              }}
              onUpdate={handleUpdateLead}
              isLoading={isUpdatingLead}
            />
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default LeadsPage;
