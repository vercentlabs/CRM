import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';

/**
 * OpportunityForm component - Form to create or update an opportunity
 * @param {Object} props - Component props
 * @param {Object} props.opportunity - Opportunity data for update mode (optional)
 * @param {Array} props.leads - List of leads to select from
 * @param {Function} props.onSuccess - Function to call when form is submitted successfully
 * @param {Function} props.onCancel - Function to call when form is cancelled
 */
const OpportunityForm = ({ opportunity, leads, onSuccess, onCancel }) => {
  const { token, user } = useAuth();
  const [formData, setFormData] = useState({
    lead_id: opportunity?.lead_id || '',
    title: opportunity?.title || '',
    description: opportunity?.description || '',
    value: opportunity?.value || '',
    stage: opportunity?.stage || 'Prospecting',
    probability: opportunity?.probability || '',
    expected_close_date: opportunity?.expected_close_date ? 
      new Date(opportunity.expected_close_date).toISOString().split('T')[0] : '',
    assigned_to: opportunity?.assigned_to || (user?.roleId === ROLE_SALES ? user.id : '')
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isUpdate = Boolean(opportunity?.id);

  // Handle form field changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.lead_id || !formData.title) {
      setError('Lead and title are required fields');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const endpoint = isUpdate ? `/opportunities/${opportunity.id}` : '/opportunities';
      const method = isUpdate ? 'PUT' : 'POST';

      const response = await api({
        method,
        url: endpoint,
        data: formData
      });

      extractData(response); // Just to validate the response

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${isUpdate ? 'update' : 'create'} opportunity`);
      console.error(`Error ${isUpdate ? 'updating' : 'creating'} opportunity:`, err);
    } finally {
      setLoading(false);
    }
  };

  // Get available stages
  const stages = [
    'Prospecting',
    'Qualification',
    'Needs Analysis',
    'Value Proposition',
    'Proposal',
    'Negotiation',
    'Closed Won',
    'Closed Lost'
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="lead_id" className="block text-sm font-medium text-gray-700">
          Lead <span className="text-red-500">*</span>
        </label>
        <select
          id="lead_id"
          name="lead_id"
          value={formData.lead_id}
          onChange={handleChange}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          required
        >
          <option value="">Select a lead</option>
          {leads.map(lead => (
            <option key={lead.id} value={lead.id}>
              {lead.name || lead.full_name || (lead.firstName && lead.lastName ? `${lead.firstName} ${lead.lastName}` : lead.firstName || lead.lastName || 'Unknown Lead')} - {lead.email || lead.mobile_number || 'No contact info'}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="title"
          name="title"
          value={formData.title}
          onChange={handleChange}
          className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
          required
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={4}
          className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="value" className="block text-sm font-medium text-gray-700">
            Value (₹)
          </label>
          <input
            type="number"
            id="value"
            name="value"
            value={formData.value}
            onChange={handleChange}
            step="0.01"
            min="0"
            className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="probability" className="block text-sm font-medium text-gray-700">
            Probability (%)
          </label>
          <input
            type="number"
            id="probability"
            name="probability"
            value={formData.probability}
            onChange={handleChange}
            min="0"
            max="100"
            className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="stage" className="block text-sm font-medium text-gray-700">
            Stage
          </label>
          <select
            id="stage"
            name="stage"
            value={formData.stage}
            onChange={handleChange}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            {stages.map(stage => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="expected_close_date" className="block text-sm font-medium text-gray-700">
            Expected Close Date
          </label>
          <input
            type="date"
            id="expected_close_date"
            name="expected_close_date"
            value={formData.expected_close_date}
            onChange={handleChange}
            className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
          />
        </div>
      </div>

      {(user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) && (
        <div>
          <label htmlFor="assigned_to" className="block text-sm font-medium text-gray-700">
            Assigned To
          </label>
          <select
            id="assigned_to"
            name="assigned_to"
            value={formData.assigned_to}
            onChange={handleChange}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            <option value="">Unassigned</option>
            {/* This would be populated with sales users */}
          </select>
        </div>
      )}

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
          disabled={loading}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {isUpdate ? 'Updating...' : 'Creating...'}
            </>
          ) : (
            isUpdate ? 'Update Opportunity' : 'Create Opportunity'
          )}
        </button>
      </div>
    </form>
  );
};

export default OpportunityForm;
