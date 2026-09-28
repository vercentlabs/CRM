import React, { useState } from 'react';
import LeadStatusBadge from './LeadStatusBadge';
import InitiateCallButton from '@/components/calls/InitiateCallButton';
import ActiveCall from '@/components/calls/ActiveCall';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';

/**
 * LeadsTable component - Reusable table for displaying leads
 * @param {Object} props - Component props
 * @param {Array} props.leads - Array of lead objects
 * @param {Function} props.onViewLead - Function to call when View button is clicked
 * @param {Function} props.onEditLead - Function to call when Edit button is clicked
 * @param {boolean} props.showActions - Whether to show action buttons
 */
const LeadsTable = ({
  leads = [],
  onViewLead,
  onEditLead,
  showActions = true
}) => {
  const { user } = useAuth();
  const [activeCallId, setActiveCallId] = useState(null);

  // Handle when a call is started
  const handleCallStarted = (callId) => {
    setActiveCallId(callId);
  };

  // Handle when a call is ended
  const handleCallEnded = () => {
    setActiveCallId(null);
  };

  // Helper function to get lead name
  const getLeadName = (lead) => {
    // Priority 1: name (aliased field from database)
    if (lead.name && typeof lead.name === 'string' && lead.name.trim()) {
      return lead.name.trim();
    }
    // Priority 2: full_name (database field)
    if (lead.full_name && typeof lead.full_name === 'string' && lead.full_name.trim()) {
      return lead.full_name.trim();
    }
    // Priority 3: firstName + lastName (legacy fields)
    if (lead.firstName?.trim() && lead.lastName?.trim()) {
      return `${lead.firstName.trim()} ${lead.lastName.trim()}`;
    }
    // Priority 4: email username (before @)
    if (lead.email && typeof lead.email === 'string' && lead.email.includes('@')) {
      return lead.email.split('@')[0];
    }
    // Priority 5: mobile_number (last resort before Lead)
    if (lead.mobile_number && typeof lead.mobile_number === 'string' && lead.mobile_number.trim()) {
      return lead.mobile_number.trim();
    }
    // Final fallback - never "Unknown"
    return 'Lead';
  };

  // Helper function to format date
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

  // If there's an active call, show simplified table with active call component
  if (activeCallId) {
    return (
      <>
        <div className="overflow-hidden shadow-lg rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Company
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Next Call
                </th>
                {user?.roleId !== ROLE_SALES && (
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-indigo-700 uppercase tracking-wider">
                    Assigned To
                  </th>
                )}
                {showActions && (
                  <th scope="col" className="relative px-6 py-4">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                <td colSpan={user?.roleId === ROLE_SALES ? (showActions ? 5 : 4) : (showActions ? 6 : 5)} className="px-6 py-8 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="relative">
                      <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
                      <div className="relative bg-green-100 rounded-full p-4 mb-3">
                        <svg className="h-8 w-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-900">Call in progress...</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ActiveCall
          callId={activeCallId}
          onCallEnded={handleCallEnded}
        />
      </>
    );
  }

  // Normal table display when no active call
  return (
    <>
      {/* Mobile view - compact table layout */}
      <div className="sm:hidden overflow-hidden shadow-lg rounded-xl border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                  Mobile
                </th>
                <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leads.length > 0 ? (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    {/* Name cell */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="text-xs font-medium text-gray-900 truncate">
                        {getLeadName(lead)}
                      </div>
                    </td>

                    {/* Mobile number cell */}
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-500">
                      {lead.mobile_number || '-'}
                    </td>

                    {/* Actions cell */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {showActions && (
                        <div className="flex items-center space-x-1">
                          <InitiateCallButton
                            leadId={lead.id}
                            onCallStarted={handleCallStarted}
                            iconOnly={true}
                          />
                          {onViewLead && (
                            <button
                              onClick={() => onViewLead(lead)}
                              className="inline-flex items-center justify-center p-1.5 rounded-md bg-indigo-100 hover:bg-indigo-200 text-indigo-600"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                          {onEditLead && (
                            <button
                              onClick={() => onEditLead(lead)}
                              className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-600"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={showActions ? 3 : 3} className="px-3 py-8 text-center text-sm text-gray-500">
                    No leads to display
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Desktop view - full table */}
      <div className="hidden sm:block overflow-hidden shadow-lg rounded-xl border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Mobile
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Next Call
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leads.length > 0 ? (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                            <span className="text-white font-semibold">
                              {getLeadName(lead).charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {getLeadName(lead)}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {lead.email || 'No email'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {lead.mobile_number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(lead.next_call_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {showActions && (
                        <div className="flex items-center space-x-2">
                          <InitiateCallButton
                            leadId={lead.id}
                            onCallStarted={handleCallStarted}
                            iconOnly={true}
                          />
                          {onViewLead && (
                            <button
                              onClick={() => onViewLead(lead)}
                              className="inline-flex items-center justify-center p-2 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-600"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                          {onEditLead && (
                            <button
                              onClick={() => onEditLead(lead)}
                              className="inline-flex items-center justify-center p-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-600"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={showActions ? 5 : 4} className="px-6 py-8 text-center text-sm text-gray-500">
                    No leads to display
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default LeadsTable;
