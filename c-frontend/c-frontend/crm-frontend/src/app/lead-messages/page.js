
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { useLeadMessages } from '@/context/LeadMessageContext';
import LeadMessageList from '@/components/lead-messages/LeadMessageList';
import LeadMessageForm from '@/components/lead-messages/LeadMessageForm';

const LeadMessagesPage = () => {
  const { messages, loading, error, fetchMessages, sendMessage } = useLeadMessages();
  const [showForm, setShowForm] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleNewMessage = useCallback(() => {
    setShowForm(true);
  }, []);

  const handleSendMessage = useCallback(async (data) => {
    await sendMessage(data);
    setShowForm(false);
  }, []);

  const handleViewLead = useCallback((lead) => {
    setSelectedLead(lead);
  }, []);

  return (
    <ProtectedRoute roles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <div className="sm:flex sm:items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Lead Messages</h1>
              <p className="mt-2 text-sm text-gray-700">
                View and manage messages sent to your leads
              </p>
            </div>
            <button
              type="button"
              onClick={handleNewMessage}
              className="mt-3 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              New Message
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 bg-white shadow rounded-lg">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <LeadMessageList
                messages={messages}
                onViewLead={handleViewLead}
              />
            )}
          </div>

          {showForm && (
            <LeadMessageForm
              isOpen={showForm}
              onClose={() => setShowForm(false)}
              onSend={handleSendMessage}
              selectedLead={selectedLead}
            />
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default LeadMessagesPage;
