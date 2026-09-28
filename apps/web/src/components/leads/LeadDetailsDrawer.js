import React, { useState, useEffect } from 'react';
import LeadStatusBadge from './LeadStatusBadge';
import api from '@/lib/api';
import { extractData } from '@/lib/response';

/**
 * LeadDetailsDrawer component - Shows lead details with completeness indicator
 * @param {Object} props - Component props
 * @param {Object} props.lead - The lead object to display
 * @param {Function} props.onClose - Function to call when drawer is closed
 * @param {Function} props.onUpdate - Function to call when lead is updated
 * @param {boolean} props.isLoading - Whether update is in progress
 */
const LeadDetailsDrawer = ({ lead, onClose }) => {
  const [salesExecutives, setSalesExecutives] = useState([]);
  const [loadingSalesExecutives, setLoadingSalesExecutives] = useState(false);
  
  // Check if lead is complete (has assigned_to and next_call_at)
  const isLeadComplete = lead?.assigned_to && lead?.next_call_at;

  // Fetch sales executives to get their names
  useEffect(() => {
    const fetchSalesExecutives = async () => {
      try {
        setLoadingSalesExecutives(true);
        const response = await api.get('/users');
        const data = extractData(response);
        setSalesExecutives(data.users || []);
      } catch (error) {
        console.error('Failed to fetch sales executives:', error);
      } finally {
        setLoadingSalesExecutives(false);
      }
    };

    if (lead?.assigned_to) {
      fetchSalesExecutives();
    }
  }, [lead?.assigned_to]);

  // Find the assigned user's name
  const assignedUserName = salesExecutives.find(user => user.id === lead?.assigned_to)?.name || 
                           salesExecutives.find(user => user.id === lead?.assigned_to)?.full_name;

  // Read-only drawer; no form submission logic

  return (
    <div className="fixed inset-0 overflow-hidden z-50">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
          <div className="w-screen max-w-2xl">
            <div className="h-full flex flex-col bg-white shadow-xl">
              {/* Header */}
              <div className="flex-1 py-6 overflow-y-auto px-4 sm:px-6">
                <div className="flex items-start justify-between">
                  <h2 className="text-lg font-medium text-gray-900">
                    Lead Details
                  </h2>
                  <button
                    type="button"
                    className="ml-3 flex-shrink-0 bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close panel</span>
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Completeness Banner */}
                {!isLeadComplete && (
                  <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">
                          Lead Incomplete
                        </h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p>This lead is not fully assigned. Please complete the following fields:</p>
                          <ul className="list-disc list-inside mt-1">
                            {!lead?.assigned_to && <li>Assign to a sales representative</li>}
                            {!lead?.next_call_at && <li>Set next call date</li>}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lead Information */}
                <div className="mt-6 space-y-6">
                  {/* Basic Information */}
                  <div className="bg-gray-50 px-4 py-5 sm:px-6 sm:py-6 rounded-lg">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      Basic Information
                    </h3>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Full Name</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {lead?.name || lead?.full_name || (lead?.firstName && lead?.lastName ? `${lead.firstName} ${lead.lastName}` : 'Not provided')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Mobile Number</dt>
                        <dd className="mt-1 text-sm text-gray-900">{lead?.mobile_number}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Email</dt>
                        <dd className="mt-1 text-sm text-gray-900">{lead?.email || 'Not provided'}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Alternate Number</dt>
                        <dd className="mt-1 text-sm text-gray-900">{lead?.alternate_number || 'Not provided'}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Source</dt>
                        <dd className="mt-1 text-sm text-gray-900">{lead?.source || 'Not provided'}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Status</dt>
                        <dd className="mt-1">
                          <LeadStatusBadge status={lead?.status} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Assigned To</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {lead?.assigned_to_name || assignedUserName || lead?.assigned_to ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                              {lead.assigned_to_name || assignedUserName || `User ID: ${lead.assigned_to}`}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              Not assigned
                            </span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Next Call Date</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {lead?.next_call_at ? new Date(lead.next_call_at).toLocaleString() : 'Not scheduled'}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-sm font-medium text-gray-500">Age</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {lead?.age || 'Not provided'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Occupation</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {lead?.occupation || 'Not provided'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Monthly Income</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {lead?.monthly_income ? `₹${lead.monthly_income.toLocaleString()}` : 'Not provided'}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Address</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {lead?.address || 'Not provided'}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Notes</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {lead?.notes || 'Not provided'}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Is Aware of Digital Gold</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {lead?.is_aware_of_digital_gold ? 'Yes' : 'No'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Created At</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {new Date(lead?.created_at).toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Updated At</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {new Date(lead?.updated_at).toLocaleString()}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Close Button */}
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadDetailsDrawer;
