'use client';

import React, { useState } from 'react';

/**
 * AuditLogDetail modal component - Display detailed audit log information
 * @param {Object} props - Component props
 * @param {Object} props.log - The audit log to display
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to close the modal
 */
const AuditLogDetail = ({ log, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('details');

  if (!isOpen || !log) return null;

  // Format JSON for display
  const formatJSON = (json) => {
    if (!json) return 'No data';

    try {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return json;
    }
  };

  // Render JSON with syntax highlighting
  const renderJSON = (json) => {
    const formatted = formatJSON(json);

    if (formatted === 'No data') {
      return <div className="text-gray-500 italic">No data</div>;
    }

    try {
      const parsed = JSON.parse(formatted);

      return (
        <pre className="bg-gray-50 p-4 rounded-md overflow-auto text-sm">
          {formatted}
        </pre>
      );
    } catch (e) {
      return (
        <div className="bg-gray-50 p-4 rounded-md overflow-auto text-sm">
          {formatted}
        </div>
      );
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto z-50">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
          onClick={onClose}
        ></div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="w-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                    Audit Log Details
                  </h3>
                  <button
                    type="button"
                    className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Tab navigation */}
                <div className="border-b border-gray-200 mb-4">
                  <nav className="-mb-px flex space-x-8">
                    <button
                      onClick={() => setActiveTab('details')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'details'
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      General Details
                    </button>
                    <button
                      onClick={() => setActiveTab('changes')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'changes'
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Changes
                    </button>
                  </nav>
                </div>

                {/* Tab content */}
                {activeTab === 'details' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">ID</h4>
                        <p className="mt-1 text-sm text-gray-900">{log.id || 'N/A'}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Timestamp</h4>
                        <p className="mt-1 text-sm text-gray-900">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">User</h4>
                        <p className="mt-1 text-sm text-gray-900">
                          {log.user_name || 'Unknown'} ({log.user_email || 'N/A'})
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Action</h4>
                        <p className="mt-1 text-sm text-gray-900">{log.action || 'N/A'}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Table</h4>
                        <p className="mt-1 text-sm text-gray-900">{log.table_name || 'N/A'}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Record ID</h4>
                        <p className="mt-1 text-sm text-gray-900">{log.record_id || 'N/A'}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">IP Address</h4>
                        <p className="mt-1 text-sm text-gray-900">{log.ip_address || 'N/A'}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">User Agent</h4>
                        <p className="mt-1 text-sm text-gray-900 truncate" title={log.user_agent}>
                          {log.user_agent || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Details</h4>
                      <p className="mt-1 text-sm text-gray-900">{log.details || 'No details available'}</p>
                    </div>
                  </div>
                )}

                {activeTab === 'changes' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 mb-2">Old Values</h4>
                        <div className="border border-gray-200 rounded-md overflow-auto max-h-96">
                          {renderJSON(log.old_values)}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 mb-2">New Values</h4>
                        <div className="border border-gray-200 rounded-md overflow-auto max-h-96">
                          {renderJSON(log.new_values)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Modal footer */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditLogDetail;
