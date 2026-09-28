import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';

/**
 * OpportunityList component - Display a list of opportunities
 * @param {Object} props - Component props
 * @param {Array} props.opportunities - List of opportunities to display
 * @param {Function} props.onEdit - Function to call when editing an opportunity
 * @param {Function} props.onDelete - Function to call when deleting an opportunity
 */
const OpportunityList = ({ opportunities, onEdit, onDelete }) => {
  const { user } = useAuth();
  const [expandedRows, setExpandedRows] = useState([]);

  // Toggle row expansion
  const toggleRow = (id) => {
    setExpandedRows(prev => 
      prev.includes(id) 
        ? prev.filter(rowId => rowId !== id)
        : [...prev, id]
    );
  };

  // Get stage color
  const getStageColor = (stage) => {
    switch (stage) {
      case 'Prospecting':
        return 'bg-gray-100 text-gray-800';
      case 'Qualification':
        return 'bg-blue-100 text-blue-800';
      case 'Needs Analysis':
        return 'bg-indigo-100 text-indigo-800';
      case 'Value Proposition':
        return 'bg-purple-100 text-purple-800';
      case 'Proposal':
        return 'bg-yellow-100 text-yellow-800';
      case 'Negotiation':
        return 'bg-orange-100 text-orange-800';
      case 'Closed Won':
        return 'bg-green-100 text-green-800';
      case 'Closed Lost':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount || 0);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';

    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Check if user can edit/delete
  const canEdit = (opportunity) => {
    return (
      user?.roleId === ROLE_ADMIN ||
      user?.roleId === ROLE_MANAGER ||
      (user?.roleId === ROLE_SALES && opportunity.assigned_to === user.id)
    );
  };

  if (opportunities.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 mb-4">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3 className="text-lg leading-6 font-medium text-gray-900">No opportunities found</h3>
        <div className="mt-2 max-w-xl text-sm text-gray-500 mx-auto text-center">
          Get started by creating your first opportunity.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                Title
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                Lead
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                Value
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                Stage
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                Probability
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                Expected Close
              </th>
              <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {opportunities.map((opportunity) => (
              <React.Fragment key={opportunity.id}>
                <tr className="hover:bg-gray-50">
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                    <button
                      onClick={() => toggleRow(opportunity.id)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      {opportunity.title}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {opportunity.lead_name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {formatCurrency(opportunity.value)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStageColor(opportunity.stage)}`}>
                      {opportunity.stage}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {opportunity.probability ? `${opportunity.probability}%` : 'Not set'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {formatDate(opportunity.expected_close_date)}
                  </td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    {canEdit(opportunity) && (
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => onEdit(opportunity)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          Edit
                        </button>
                        {onDelete && (
                          <button
                            onClick={() => onDelete(opportunity)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                {expandedRows.includes(opportunity.id) && (
                  <tr>
                    <td colSpan="7" className="px-6 py-4 bg-gray-50">
                      <div className="text-sm text-gray-700">
                        <p className="font-medium mb-2">Description:</p>
                        <p className="mb-4">
                          {opportunity.description || 'No description provided'}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="font-medium">Assigned To:</p>
                            <p>{opportunity.assigned_to_name || 'Unassigned'}</p>
                          </div>
                          <div>
                            <p className="font-medium">Created:</p>
                            <p>{formatDate(opportunity.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OpportunityList;
