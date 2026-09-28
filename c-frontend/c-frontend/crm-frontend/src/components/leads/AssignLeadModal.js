import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import { ROLE_ADMIN, ROLE_MANAGER } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';

/**
 * AssignLeadModal component - Modal for assigning a lead to a sales user
 * @param {Object} props - Component props
 * @param {Object} props.lead - The lead to assign
 * @param {Function} props.onClose - Function to close the modal
 * @param {Function} props.onSuccess - Function to call on successful assignment
 */
const AssignLeadModal = ({ lead, onClose, onSuccess }) => {
  const [salesUsers, setSalesUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingUsers, setIsFetchingUsers] = useState(true);
  const [error, setError] = useState(null);
  const { token, user } = useAuth();

  // Fetch sales users on component mount
  useEffect(() => {
    const fetchSalesUsers = async () => {
      try {
        setIsFetchingUsers(true);
        const response = await api.get('/users');
        const data = extractData(response);
        console.log('Fetched users data:', data);
        console.log('Users array:', data?.users);
        setSalesUsers(data.users || []);
      } catch (err) {
        console.error('Failed to fetch sales users:', err);
        setError('Failed to load sales users. Please try again.');
      } finally {
        setIsFetchingUsers(false);
      }
    };

    if (token) {
      fetchSalesUsers();
    }
  }, [token]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check if user has permission to assign leads
    if (user?.roleId !== ROLE_ADMIN && user?.roleId !== ROLE_MANAGER) {
      setError('You do not have permission to assign leads.');
      return;
    }

    if (!selectedUserId) {
      setError('Please select a sales user to assign this lead to.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await api.patch(`/leads/${lead.id}/assign`, {
        userId: selectedUserId
      });

      const data = extractData(response);
      // Call success callback
      if (onSuccess) {
        onSuccess(data);
      }

      // Close modal
      onClose();
    } catch (err) {
      if (err.response?.status === 400) {
        setError(err.response.data.message || 'Invalid assignment data.');
      } else if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
      } else if (err.response?.status === 403) {
        setError('You do not have permission to assign leads.');
      } else if (err.response?.status >= 500) {
        setError('Server error. Please try again later.');
      } else {
        setError('Failed to assign lead. Please try again.');
      }
      console.error('Failed to assign lead:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 sm:mx-0 sm:h-10 sm:w-10">
                <svg className="h-6 w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Assign Lead
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Assign &ldquo;{lead.firstName && lead.lastName 
                      ? `${lead.firstName} ${lead.lastName}` 
                      : lead.name || 'Unknown'}&rdquo; to a sales representative.
                  </p>
                </div>

                {/* Error message */}
                {error && (
                  <div className="mt-4 bg-red-50 border-l-4 border-red-400 p-4">
                    <div className="flex">
                      <div className="shrink-0">
                        <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="mt-4">
                  <div>
                    <label htmlFor="sales-user" className="block text-sm font-medium text-gray-700">
                      Sales Representative
                    </label>
                    <div className="mt-1">
                      {isFetchingUsers ? (
                        <div className="flex items-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 mr-2"></div>
                          <span className="text-sm text-gray-500">Loading sales users...</span>
                        </div>
                      ) : (
                        <>
                          {console.log('Rendering select dropdown, salesUsers:', salesUsers)}
                          <select
                            id="sales-user"
                            name="sales-user"
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md bg-white text-gray-900 border-2"
                            style={{ backgroundColor: 'white', color: 'black', zIndex: 1000 }}
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                          >
                            <option value="" style={{ color: 'black' }}>Select a sales representative</option>
                            {salesUsers.map(user => (
                              <option key={user.id} value={user.id} style={{ color: 'black' }}>
                                {user.name} ({user.email})
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                    <button
                      type="submit"
                      disabled={isLoading || isFetchingUsers}
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Assigning...
                        </>
                      ) : (
                        'Assign Lead'
                      )}
                    </button>
                    <button
                      type="button"
                      className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                      onClick={onClose}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignLeadModal;
