import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';

/**
 * CallsTable component - Reusable table for displaying call logs
 * @param {Object} props - Component props
 * @param {Array} props.calls - Array of call objects
 * @param {Function} props.onViewLead - Function to call when View Lead button is clicked
 * @param {Function} props.onEditCall - Function to call when Edit button is clicked
 * @param {Function} props.onDeleteCall - Function to call when Delete button is clicked
 * @param {boolean} props.showActions - Whether to show action buttons
 */
const CallsTable = ({
  calls = [],
  onViewLead,
  onEditCall,
  onDeleteCall,
  showActions = true
}) => {
  const { user } = useAuth();

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

  // Helper function to format duration in minutes and seconds
  const formatDuration = (seconds) => {
    if (!seconds) return 'Not recorded';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  // Helper function to get call outcome display
  const getCallOutcomeDisplay = (outcome) => {
    switch (outcome) {
      case 'Connected':
        return { label: 'Connected', color: 'bg-green-100 text-green-800' };
      case 'No Answer':
        return { label: 'No Answer', color: 'bg-yellow-100 text-yellow-800' };
      case 'Busy':
        return { label: 'Busy', color: 'bg-orange-100 text-orange-800' };
      case 'Left Voicemail':
        return { label: 'Left Voicemail', color: 'bg-blue-100 text-blue-800' };
      default:
        return { label: outcome || 'Unknown', color: 'bg-gray-100 text-gray-800' };
    }
  };

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Lead
            </th>
            {user?.roleId !== ROLE_SALES && (
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
            )}
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Start Time
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Duration
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Outcome
            </th>
            {showActions && (
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {calls.length > 0 ? (
            calls.map((call) => (
              <tr key={call.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center">
                        <span className="text-white font-medium">
                          {call.lead?.name?.charAt(0).toUpperCase() || '?'}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {call.lead?.name || 'Unknown Lead'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {call.lead?.email || 'No email'}
                      </div>
                    </div>
                  </div>
                </td>
                {user?.roleId !== ROLE_SALES && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {call.user?.name || call.user || 'Unknown'}
                  </td>
                )}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    call.lead?.status === 'New' ? 'bg-green-100 text-green-800' :
                    call.lead?.status === 'Contacted' ? 'bg-blue-100 text-blue-800' :
                    call.lead?.status === 'Qualified' ? 'bg-yellow-100 text-yellow-800' :
                    call.lead?.status === 'Converted' ? 'bg-purple-100 text-purple-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {call.lead?.status || 'Unknown'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(call.startTime)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDuration(call.duration)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getCallOutcomeDisplay(call.outcome).color}`}>
                    {getCallOutcomeDisplay(call.outcome).label}
                  </span>
                </td>
                {showActions && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      {onViewLead && (
                        <button
                          onClick={() => onViewLead(call.lead)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="View Lead"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}

                      {onEditCall && (
                        // Admin and Manager can edit any call
                        // Sales can only edit their own calls
                        (user?.roleId === ROLE_ADMIN ||
                         user?.roleId === ROLE_MANAGER ||
                         (user?.roleId === ROLE_SALES && call.user?.id === user?.id)) && (
                          <button
                            onClick={() => onEditCall(call)}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Edit Call"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                          </button>
                        )
                      )}

                      {onDeleteCall && (user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) && (
                        <button
                          onClick={() => onDeleteCall(call)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Call"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={user?.roleId === ROLE_SALES ? (showActions ? 6 : 5) : (showActions ? 7 : 6)} className="px-6 py-4 text-center text-sm text-gray-500">
                No calls to display
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default CallsTable;
