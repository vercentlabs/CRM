
import React, { useState, useEffect } from 'react';
import './OpportunityDrawer.css';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER } from '@/lib/constants';
import Select from '@/components/common/Select';

/**
 * OpportunityDrawer component - Drawer for creating or editing an opportunity
 * @param {Object} props - Component props
 * @param {Object} props.opportunity - Opportunity data for update mode (optional)
 * @param {Array} props.leads - List of leads to select from
 * @param {Function} props.onSuccess - Function to call when form is submitted successfully
 * @param {Function} props.onCancel - Function to call when drawer is cancelled
 * @param {boolean} props.isLoading - Whether form is in loading state
 */
const OpportunityDrawer = ({ opportunity, leads, onSuccess, onCancel, isLoading = false }) => {
  const { user } = useAuth();
  const [salesExecutives, setSalesExecutives] = useState([]);
  const [loadingSalesExecutives, setLoadingSalesExecutives] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    lead_id: opportunity?.lead_id || '',
    title: opportunity?.title || '',
    description: opportunity?.description || '',
    value: opportunity?.value || '',
    stage: opportunity?.stage || 'Prospecting',
    probability: opportunity?.probability || '',
    expected_close_date: opportunity?.expected_close_date ?
      new Date(opportunity.expected_close_date).toISOString().split('T')[0] : '',
    assigned_to: opportunity?.assigned_to || ''
  });

  const [errors, setErrors] = useState({});
  const isUpdate = Boolean(opportunity?.id);

  // Handle ESC key press and prevent body scroll
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    // Add ESC key listener
    window.addEventListener('keydown', handleEsc);

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onCancel]);

  // Fetch sales executives for Assign To dropdown (admin/manager only)
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

    if (user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) {
      fetchSalesExecutives();
    }
  }, [user]);

  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error for this field if it exists
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  // Validate form data
  const validateForm = () => {
    const newErrors = {};

    // Validate required fields
    if (!formData.lead_id) {
      newErrors.lead_id = 'Lead is required';
    }

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (formData.value && isNaN(parseFloat(formData.value))) {
      newErrors.value = 'Please enter a valid value';
    }

    if (formData.probability && (isNaN(parseFloat(formData.probability)) || formData.probability < 0 || formData.probability > 100)) {
      newErrors.probability = 'Please enter a valid probability between 0 and 100';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Convert numeric fields
    const submitData = {
      ...formData,
      value: formData.value ? parseFloat(formData.value) : null,
      probability: formData.probability ? parseFloat(formData.probability) : null
    };

    // Filter out empty values before submitting
    const filteredData = Object.fromEntries(
      Object.entries(submitData).filter(([_, value]) => value !== '' && value !== null && value !== undefined)
    );

    onSuccess(filteredData);
  };

  // Get available stages
  const stageOptions = [
    { value: 'Prospecting', label: 'Prospecting' },
    { value: 'Qualification', label: 'Qualification' },
    { value: 'Needs Analysis', label: 'Needs Analysis' },
    { value: 'Value Proposition', label: 'Value Proposition' },
    { value: 'Proposal', label: 'Proposal' },
    { value: 'Negotiation', label: 'Negotiation' },
    { value: 'Closed Won', label: 'Closed Won' },
    { value: 'Closed Lost', label: 'Closed Lost' }
  ];

  // Get lead options
  const leadOptions = [
    { value: '', label: 'Select a lead' },
    ...leads.map(lead => ({
      value: lead.id,
      label: `${lead.name || lead.full_name || (lead.firstName && lead.lastName ? `${lead.firstName} ${lead.lastName}` : lead.firstName || lead.lastName || 'Unknown Lead')} - ${lead.email || lead.mobile_number || 'No contact info'}`
    }))
  ];

  // Get sales executive options
  const salesExecutiveOptions = [
    { value: '', label: 'Unassigned' },
    ...salesExecutives.map(executive => ({
      value: executive.id,
      label: executive.full_name
    }))
  ];

  return (
    <>
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-40 animate-fade-in" onClick={onCancel}></div>

      {/* Right-side slide-in modal */}
      <div className="fixed top-0 right-0 h-screen w-[520px] bg-white z-50 shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header - Sticky */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {isUpdate ? 'Edit Opportunity' : 'Add New Opportunity'}
            </h2>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-500 focus:outline-none transition-colors"
              onClick={onCancel}
            >
              <span className="sr-only">Close panel</span>
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Information Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Basic Information</h3>

              <div className="grid grid-cols-1 gap-y-5 gap-x-4 sm:grid-cols-2">
                {/* Lead Field */}
                <div className="sm:col-span-2">
                  <label htmlFor="lead_id" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Lead <span className="text-red-500">*</span>
                  </label>
                  <Select
                    id="lead_id"
                    name="lead_id"
                    value={formData.lead_id}
                    onChange={handleInputChange}
                    options={leadOptions}
                  />
                  {errors.lead_id && (
                    <p className="mt-1 text-sm text-red-600">{errors.lead_id}</p>
                  )}
                </div>

                {/* Title Field */}
                <div className="sm:col-span-2">
                  <label htmlFor="title" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    required
                    value={formData.title}
                    onChange={handleInputChange}
                    className={`mt-2 block w-full bg-blue-50 border ${errors.title ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400`}
                  />
                  {errors.title && (
                    <p className="mt-1 text-sm text-red-600">{errors.title}</p>
                  )}
                </div>

                {/* Description Field */}
                <div className="sm:col-span-2">
                  <label htmlFor="description" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={3}
                    value={formData.description}
                    onChange={handleInputChange}
                    className="mt-2 block w-full bg-blue-50 border border-blue-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400"
                    placeholder="Enter opportunity description"
                  />
                </div>
              </div>
            </div>

            {/* Opportunity Details Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Opportunity Details</h3>

              <div className="grid grid-cols-1 gap-y-5 gap-x-4 sm:grid-cols-2">
                {/* Value Field */}
                <div className="sm:col-span-1">
                  <label htmlFor="value" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Value (₹)
                  </label>
                  <input
                    type="number"
                    id="value"
                    name="value"
                    value={formData.value}
                    onChange={handleInputChange}
                    step="0.01"
                    min="0"
                    className={`mt-2 block w-full bg-blue-50 border ${errors.value ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm`}
                  />
                  {errors.value && (
                    <p className="mt-1 text-sm text-red-600">{errors.value}</p>
                  )}
                </div>

                {/* Probability Field */}
                <div className="sm:col-span-1">
                  <label htmlFor="probability" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Probability (%)
                  </label>
                  <input
                    type="number"
                    id="probability"
                    name="probability"
                    value={formData.probability}
                    onChange={handleInputChange}
                    min="0"
                    max="100"
                    className={`mt-2 block w-full bg-blue-50 border ${errors.probability ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm`}
                  />
                  {errors.probability && (
                    <p className="mt-1 text-sm text-red-600">{errors.probability}</p>
                  )}
                </div>

                {/* Stage Field */}
                <div className="sm:col-span-1">
                  <label htmlFor="stage" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Stage
                  </label>
                  <Select
                    id="stage"
                    name="stage"
                    value={formData.stage}
                    onChange={handleInputChange}
                    options={stageOptions}
                  />
                </div>

                {/* Expected Close Date Field */}
                <div className="sm:col-span-1">
                  <label htmlFor="expected_close_date" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Expected Close Date
                  </label>
                  <input
                    type="date"
                    id="expected_close_date"
                    name="expected_close_date"
                    value={formData.expected_close_date}
                    onChange={handleInputChange}
                    className="mt-2 block w-full bg-blue-50 border border-blue-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Assignment Section - Admin/Manager Only */}
            {(user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Assignment</h3>

                <div className="grid grid-cols-1 gap-y-5 gap-x-4 sm:grid-cols-2">
                  {/* Assign To Field */}
                  <div className="sm:col-span-2">
                    <label htmlFor="assigned_to" className="block text-sm font-medium" style={{ color: 'black' }}>
                      Assign To
                    </label>
                    <Select
                      id="assigned_to"
                      name="assigned_to"
                      value={formData.assigned_to}
                      onChange={handleInputChange}
                      options={salesExecutiveOptions}
                      disabled={loadingSalesExecutives}
                    />
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Footer Actions - Sticky */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 z-10">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              onClick={handleSubmit}
              className="px-4 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
        </div>
      </div>
    </>
  );
};

export default OpportunityDrawer;
