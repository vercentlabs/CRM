import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER } from '@/lib/constants';

/**
 * BulkMessageForm component - Form to send bulk messages to multiple leads
 * @param {Object} props - Component props
 * @param {Function} props.onSuccess - Function to call when messages are sent successfully
 * @param {Function} props.onCancel - Function to call when form is cancelled
 */
const BulkMessageForm = ({ onSuccess, onCancel }) => {
  const { token, user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [messageType, setMessageType] = useState('Email');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadingLeads, setLoadingLeads] = useState(true);

  // Fetch leads from API
  useEffect(() => {
    const fetchLeads = async () => {
      try {
        setLoadingLeads(true);
        const response = await api.get('/leads');
        const data = extractData(response);
        setLeads(data.leads || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch leads');
        console.error('Error fetching leads:', err);
      } finally {
        setLoadingLeads(false);
      }
    };

    if (token) {
      fetchLeads();
    }
  }, [token]);

  // Handle lead selection
  const handleLeadSelection = (leadId) => {
    if (selectedLeads.includes(leadId)) {
      setSelectedLeads(selectedLeads.filter(id => id !== leadId));
    } else {
      setSelectedLeads([...selectedLeads, leadId]);
    }
  };

  // Handle select all leads
  const handleSelectAll = () => {
    if (selectedLeads.length === leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leads.map(lead => lead.id));
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedLeads.length === 0 || !content.trim()) {
      setError('Please select at least one lead and enter message content');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const messageData = {
        lead_ids: selectedLeads,
        type: messageType,
        content: content.trim()
      };

      // Add subject for Email messages
      if (messageType === 'Email' && subject.trim()) {
        messageData.subject = subject.trim();
      }

      const response = await api.post('/messages/bulk', messageData);
      extractData(response); // Just to validate the response

      // Reset form
      setSelectedLeads([]);
      setMessageType('Email');
      setSubject('');
      setContent('');

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send messages');
      console.error('Error sending messages:', err);
    } finally {
      setLoading(false);
    }
  };

  // Check if user has permission
  const hasPermission = user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER;

  if (!hasPermission) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">Access Denied</h3>
        <p className="mt-1 text-sm text-gray-500">Only administrators and managers can send bulk messages.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <div className="flex justify-between items-center">
          <label className="block text-sm font-medium text-gray-700">
            Select Leads <span className="text-red-500">*</span>
          </label>
          <div className="text-sm">
            <span className="text-gray-500">Selected: </span>
            <span className="font-medium text-indigo-600">{selectedLeads.length}</span>
            <span className="text-gray-500"> of </span>
            <span className="font-medium">{leads.length}</span>
          </div>
        </div>
        <div className="mt-1 border border-gray-300 rounded-md">
          <div className="px-4 py-3 border-b border-gray-300 bg-gray-50">
            <div className="flex items-center">
              <input
                id="select-all"
                name="select-all"
                type="checkbox"
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                checked={selectedLeads.length === leads.length && leads.length > 0}
                onChange={handleSelectAll}
              />
              <label htmlFor="select-all" className="ml-2 block text-sm text-gray-900">
                Select All Leads
              </label>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loadingLeads ? (
              <div className="flex justify-center items-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : leads.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {leads.map((lead) => (
                  <div key={lead.id} className="px-4 py-3 flex items-center">
                    <input
                      id={`lead-${lead.id}`}
                      name={`lead-${lead.id}`}
                      type="checkbox"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      checked={selectedLeads.includes(lead.id)}
                      onChange={() => handleLeadSelection(lead.id)}
                    />
                    <label htmlFor={`lead-${lead.id}`} className="ml-3 flex-1 flex justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {lead.name || lead.firstName && lead.lastName ? `${lead.firstName} ${lead.lastName}` : 'Unknown Lead'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {lead.email || lead.phone || 'No contact info'}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {lead.status}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-center text-sm text-gray-500">
                No leads available
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="messageType" className="block text-sm font-medium text-gray-700">
          Message Type
        </label>
        <select
          id="messageType"
          value={messageType}
          onChange={(e) => setMessageType(e.target.value)}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
        >
          <option value="Email">Email</option>
          <option value="SMS">SMS</option>
          <option value="WhatsApp">WhatsApp</option>
        </select>
      </div>

      {messageType === 'Email' && (
        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-gray-700">
            Subject
          </label>
          <input
            type="text"
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject (optional)"
            className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
          />
        </div>
      )}

      <div>
        <label htmlFor="content" className="block text-sm font-medium text-gray-700">
          Message Content <span className="text-red-500">*</span>
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="Enter your message here..."
          className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
          required
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="shrink-0">
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

      <div className="flex justify-end space-x-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading || selectedLeads.length === 0}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Sending Messages...
            </>
          ) : (
            `Send to ${selectedLeads.length} Lead${selectedLeads.length !== 1 ? 's' : ''}`
          )}
        </button>
      </div>
    </form>
  );
};

export default BulkMessageForm;
