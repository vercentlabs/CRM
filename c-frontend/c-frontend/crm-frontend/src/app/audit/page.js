'use client';

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN } from '@/lib/constants';
import AuditTable from '@/components/audit/AuditTable';
import AuditFilters from '@/components/audit/AuditFilters';

/**
 * Audit Logs page - View system audit logs
 * Only accessible to admin users
 */
const AuditLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({
    action: '',
    userId: '',
    dateFrom: '',
    dateTo: '',
    page: 1,
    limit: 20
  });
  
  // State for pagination
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    hasNext: false,
    hasPrev: false
  });

  // Fetch audit logs
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();

      // Add filters to query params
      queryParams.set('page', filter.page);
      queryParams.set('limit', filter.limit);
      if (filter.action) queryParams.set('action', filter.action);
      if (filter.userId) queryParams.set('user_id', filter.userId);
      if (filter.dateFrom) queryParams.set('start_date', filter.dateFrom);
      if (filter.dateTo) queryParams.set('end_date', filter.dateTo);

      const response = await api.get(`/audit?${queryParams.toString()}`);

      const { audit_logs, pagination } = response.data || {};
      setLogs(audit_logs || []);
      if (pagination) {
        setPagination({
          currentPage: pagination.page,
          totalPages: pagination.totalPages,
          totalItems: pagination.totalItems,
          hasNext: pagination.hasNextPage,
          hasPrev: pagination.hasPrevPage
        });
      }
      
      setError(null);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setError(
        err.response?.data?.message || 
        'Failed to load audit logs. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Initial fetch and when filters change
  useEffect(() => {
    fetchLogs();
  }, [filter, fetchLogs]);

  // Handle filter change
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilter(prev => ({
      ...prev,
      [name]: value,
      page: name === 'page' ? value : 1 // Reset to page 1 when changing other filters
    }));
  };
  
  // Handle page navigation
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    setFilter(prev => ({
      ...prev,
      page: newPage
    }));
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Get action type badge styling
  const getActionBadge = (action) => {
    switch (action?.toLowerCase()) {
      case 'create':
        return 'bg-green-100 text-green-800';
      case 'update':
        return 'bg-blue-100 text-blue-800';
      case 'delete':
        return 'bg-red-100 text-red-800';
      case 'login':
        return 'bg-indigo-100 text-indigo-800';
      case 'logout':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <ProtectedRoute allowedRoles={[ROLE_ADMIN]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Audit Logs</h1>
            <p className="mt-2 text-gray-600">View system activity and audit logs</p>
          </div>

          {/* Filters */}
          <AuditFilters 
            filters={{
              userId: filter.userId,
              action: filter.action,
              dateFrom: filter.dateFrom,
              dateTo: filter.dateTo
            }}
            onFiltersChange={(newFilters) => {
              setFilter(prev => ({
                ...prev,
                ...newFilters,
                page: 1 // Reset to page 1 when changing filters
              }));
            }}
            onApplyFilters={fetchLogs}
          />

          {/* Error display */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Audit Table */}
          <AuditTable 
            logs={logs}
            pagination={{
              ...pagination,
              limit: filter.limit
            }}
            onPageChange={handlePageChange}
            loading={loading}
          />
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default AuditLogsPage;
