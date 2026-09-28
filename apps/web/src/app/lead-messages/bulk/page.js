
'use client';

import React, { useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import BulkMessageForm from '@/components/lead-messages/BulkMessageForm';

const BulkLeadMessagesPage = () => {
  useAuth();
  const [successMessage, setSuccessMessage] = useState(null);

  const handleSuccess = () => {
    setSuccessMessage('Messages sent successfully!');
    // Clear success message after 5 seconds
    setTimeout(() => {
      setSuccessMessage(null);
    }, 5000);
  };

  return (
    <ProtectedRoute roles={[ROLE_ADMIN, ROLE_MANAGER]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <div className="sm:flex sm:items-center">
            <div className="sm:flex-auto">
              <h1 className="text-2xl font-semibold text-gray-900">Bulk Lead Messages</h1>
              <p className="mt-2 text-sm text-gray-700">
                Send messages to multiple leads at once for campaigns and announcements.
              </p>
            </div>
          </div>

          {successMessage && (
            <div className="mt-4 rounded-md bg-green-50 p-4">
              <div className="flex">
                <div className="shrink-0">
                  <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800">{successMessage}</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:p-6">
              <BulkMessageForm onSuccess={handleSuccess} />
            </div>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default BulkLeadMessagesPage;
