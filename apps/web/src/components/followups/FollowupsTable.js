import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import axios from 'axios';
import LeadStatusBadge from '@/components/leads/LeadStatusBadge';
import InitiateCallButton from '@/components/calls/InitiateCallButton';

/**
 * FollowupsTable component - Reusable table for displaying follow-ups
 * @param {Object} props - Component props
 * @param {Array} props.followups - Array of follow-up objects
 * @param {Function} props.onViewLead - Function to call when View button is clicked
 * @param {Function} props.onEditLead - Function to call when Edit button is clicked
 * @param {Function} props.onDeleteFollowup - Function to call when Delete button is clicked
 * @param {boolean} props.showActions - Whether to show action buttons
 */
const FollowupsTable = ({
  followups = [],
  onViewLead,
  onEditLead,
  onDeleteFollowup,
  showActions = true,
  onRefreshFollowups
}) => {
  const { user, token } = useAuth();
  const [completingIds, setCompletingIds] = useState(new Set());
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

  // Handle completing a follow-up
  const handleCompleteFollowup = async (followupId, followup) => {
    try {
      // Add ID to loading set
      setCompletingIds(prev => new Set(prev).add(followupId));

      // Check if follow-up is overdue (not completed within 1 hour)
      const followupDate = new Date(followup.followup_date || followup.scheduled_at || followup.date);
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const isOverdue = followupDate < oneHourAgo;

      // If overdue, update to overdue status
      if (isOverdue) {
        await axios.patch(`/followups/${followupId}/overdue`, {});
      } else {
        await axios.patch(`/followups/${followupId}/complete`, {});
      }

      // Call refresh function if provided
      if (onRefreshFollowups) {
        onRefreshFollowups();
      }
    } catch (err) {
      console.error('Error completing follow-up:', err);
      // Could add toast notification here
    } finally {
      // Remove ID from loading set
      setCompletingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(followupId);
        return newSet;
      });
    }
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

  // Helper function to get follow-up type display
  const getFollowupTypeDisplay = (type) => {
    switch (type) {
      case 'call':
        return { label: 'Phone Call', color: 'bg-blue-100 text-blue-800' };
      case 'email':
        return { label: 'Email', color: 'bg-green-100 text-green-800' };
      case 'meeting':
        return { label: 'Meeting', color: 'bg-purple-100 text-purple-800' };
      case 'task':
        return { label: 'Task', color: 'bg-yellow-100 text-yellow-800' };
      default:
        return { label: type || 'Other', color: 'bg-gray-100 text-gray-800' };
    }
  };

  // Helper function to get lead status display
  const getLeadStatusDisplay = (status) => {
    switch (status) {
      case 'New':
        return 'bg-green-100 text-green-800';
      case 'Contacted':
        return 'bg-blue-100 text-blue-800';
      case 'Qualified':
        return 'bg-yellow-100 text-yellow-800';
      case 'Converted':
        return 'bg-purple-100 text-purple-800';
      case 'Lost':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Lead Name
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Follow-up Type
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            {user?.roleId !== ROLE_SALES && (
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assigned To
              </th>
            )}
            {showActions && (
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {followups.length > 0 ? (
            followups.map((followup) => (
              <tr key={followup.id} className={`hover:bg-gray-50 ${
                  new Date(followup.date) < new Date() && followup.status === 'Pending' 
                    ? 'bg-red-50' 
                    : ''
                }`}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="shrink-0 h-10 w-10">
                      <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center">
                        <span className="text-white font-medium">
                          {followup.lead?.name?.charAt(0).toUpperCase() || '?'}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {followup.lead?.name || 'Unknown Lead'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {followup.lead?.email || 'No email'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getFollowupTypeDisplay(followup.type || followup.followup_type).color}`}>
                    {getFollowupTypeDisplay(followup.type || followup.followup_type).label}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {(() => {
                    const followupDate = new Date(followup.followup_date || followup.scheduled_at || followup.date);
                    const now = new Date();
                    const isOverdue = followupDate < now && (followup.status === 'Pending' || !followup.completed);

                    return (
                      <span className={isOverdue ? "text-red-600 font-medium" : "text-gray-500"}>
                        {formatDate(followup.followup_date || followup.scheduled_at || followup.date)}
                        {isOverdue && (
                          <span className="ml-1 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                            Overdue
                          </span>
                        )}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getLeadStatusDisplay(followup.lead?.status)}`}>
                    {followup.lead?.status || 'Unknown'}
                  </span>
                </td>
                {user?.roleId !== ROLE_SALES && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {followup.assignedTo?.name || followup.assignedTo || followup.assigned_to || followup.user_name || 'Unassigned'}
                  </td>
                )}
                {showActions && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      {onViewLead && (
                        <button
                          onClick={() => onViewLead(followup.lead || { id: followup.lead_id })}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="View Lead"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3,10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}

                      {onEditLead && (
                        // Admin and Manager can edit any lead
                        // Sales can only edit their assigned leads
                        (user?.roleId === ROLE_ADMIN ||
                         user?.roleId === ROLE_MANAGER ||
                         (user?.roleId === ROLE_SALES && (followup.assignedTo?.id === user?.id || followup.assigned_to === user?.id))) && (
                          <button
                            onClick={() => onEditLead(followup.lead || { id: followup.lead_id })}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Edit Lead"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                          </button>
                        )
                      )}

                      {onDeleteFollowup && (user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) && (
                        <button
                          onClick={() => onDeleteFollowup(followup)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Follow-up"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}

                      {(!followup.completed || followup.status === 'Pending') && user?.roleId === ROLE_SALES && (followup.assignedTo?.id === user?.id || followup.assigned_to === user?.id) && (
                        <button
                          onClick={() => handleCompleteFollowup(followup.id, followup)}
                          disabled={completingIds.has(followup.id)}
                          className="text-green-600 hover:text-green-900 disabled:opacity-50"
                          title="Complete Follow-up"
                        >
                          {completingIds.has(followup.id) ? (
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={user?.roleId === ROLE_SALES ? (showActions ? 5 : 4) : (showActions ? 6 : 5)} className="px-6 py-4 text-center text-sm text-gray-500">
                No follow-ups to display
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default FollowupsTable;
