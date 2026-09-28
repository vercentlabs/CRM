'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import CreateCustomerDrawer from '@/components/customers/CreateCustomerDrawer';
import CustomersPageHeader from '@/components/customers/CustomersPageHeader';

const CustomersPage = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [createCustomerError, setCreateCustomerError] = useState(null);
  const { token, user } = useAuth();

  const fetchCustomers = useCallback(async () => {
    if (!token) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get('/customers');
      const data = response.data;
      setCustomers(data.customers || []);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
      setError('Failed to load customers. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleRefresh = () => {
    fetchCustomers();
  };

  const handleExport = async () => {
    if (user?.roleId !== ROLE_ADMIN && user?.roleId !== ROLE_MANAGER) {
      alert('You do not have permission to export customers.');
      return;
    }

    try {
      const response = await api.get('/reports/export-customers-csv', {
        headers: { 'Accept': 'text/csv' },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `customers-export-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting customers:', err);
      alert('Failed to export customers. Please try again.');
    }
  };

  const handleCreateCustomer = async (customerData) => {
    if (user?.roleId !== ROLE_ADMIN && user?.roleId !== ROLE_MANAGER && user?.roleId !== ROLE_SALES) {
      setCreateCustomerError('You do not have permission to create customers.');
      return;
    }

    try {
      setIsCreatingCustomer(true);
      setCreateCustomerError(null);

      const response = await api.post('/customers', customerData);

      setShowCreateForm(false);
      await fetchCustomers();

      return response.data;
    } catch (err) {
      if (err.response?.status === 400) {
        setCreateCustomerError(err.response.data.message || 'Invalid customer data. Please check your inputs.');
      } else if (err.response?.status === 401) {
        setCreateCustomerError('Your session has expired. Please log in again.');
      } else if (err.response?.status === 403) {
        setCreateCustomerError('You do not have permission to create customers.');
      } else if (err.response?.status >= 500) {
        setCreateCustomerError('Server error. Please try again later.');
      } else {
        setCreateCustomerError('Failed to create customer. Please try again.');
      }
      console.error('Failed to create customer:', err);
      throw err;
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <CustomersPageHeader
            count={customers.length}
            onRefresh={handleRefresh}
            onExport={handleExport}
            onAddCustomer={() => setShowCreateForm(true)}
          />

          {/* Create Customer Drawer */}
          {showCreateForm && (
            <CreateCustomerDrawer
              onSubmit={handleCreateCustomer}
              onCancel={() => setShowCreateForm(false)}
              isLoading={isCreatingCustomer}
            />
          )}

          <div className="mt-8 bg-white shadow overflow-hidden sm:rounded-lg">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading customers...</p>
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
                        Error loading customers
                      </h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                      </div>
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={handleRefresh}
                          className="bg-red-50 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : customers.length === 0 ? (
              <div className="px-4 py-5 sm:p-6">
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">No customers found</h3>
                  <div className="mt-2 max-w-xl text-sm text-gray-500">
                    Get started by adding your first customer or importing existing customer data.
                  </div>
                  <div className="mt-6">
                    <button
                      type="button"
                      className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Add Customer
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-5 sm:p-6">
                <div className="text-center">
                  <h1 className="text-2xl font-semibold text-gray-900">Customers</h1>
                  <p className="mt-2 text-gray-600">Your customer management interface will appear here.</p>
                  <div className="mt-4 text-sm text-gray-500">Found {customers.length} customers</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default CustomersPage;
