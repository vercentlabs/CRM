
import React, { useState, useEffect } from 'react';
import './CreateOpportunityDrawer.css';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import Select from '@/components/common/Select';

/**
 * CreateOpportunityDrawer component - Drawer for creating a new opportunity
 * @param {Object} props - Component props
 * @param {Function} props.onSubmit - Function to call when form is submitted
 * @param {Function} props.onCancel - Function to call when drawer is cancelled
 * @param {boolean} props.isLoading - Whether form is in loading state
 * @param {Array} props.leads - List of leads to select from
 */
const CreateOpportunityDrawer = ({ onSubmit, onCancel, isLoading = false, leads = [] }) => {
  const { user } = useAuth();
  const [salesExecutives, setSalesExecutives] = useState([]);
  const [loadingSalesExecutives, setLoadingSalesExecutives] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    lead_id: '',
    title: '',
    description: '',
    value: '',
    stage: 'Prospecting',
    probability: '',
    expected_close_date: '',
    assigned_to: ''
  });

  const [errors, setErrors] = useState({});

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
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
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
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.lead_id) {
      newErrors.lead_id = 'Lead is required';
    }

    if (formData.value && isNaN(parseFloat(formData.value))) {
      newErrors.value = 'Value must be a valid number';
    }

    if (formData.probability && (isNaN(parseFloat(formData.probability)) || parseFloat(formData.probability) < 0 || parseFloat(formData.probability) > 100)) {
      newErrors.probability = 'Probability must be between 0 and 100';
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

    // Filter out empty values before submitting
    const submitData = Object.fromEntries(
      Object.entries(formData).filter(([_, value]) => value !== '' && value !== null && value !== undefined)
    );

    // Convert numeric fields
    if (submitData.value !== undefined) {
      submitData.value = parseFloat(submitData.value);
    }
    if (submitData.probability !== undefined) {
      submitData.probability = parseFloat(submitData.probability);
    }

    onSubmit(submitData);
  };

  // Stage options
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
              Add New Opportunity
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
            {/* Opportunity Information Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Opportunity Information</h3>

              <div className="grid grid-cols-1 gap-y-5 gap-x-4 sm:grid-cols-2">
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
                    placeholder="Enter opportunity title"
                  />
                  {errors.title && (
                    <p className="mt-1 text-sm text-red-600">{errors.title}</p>
                  )}
                </div>

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
                    options={[
                      { value: '', label: 'Select a lead' },
                      ...leads.map(lead => ({
                        value: lead.id,
                        label: lead.full_name
                      }))
                    ]}
                  />
                  {errors.lead_id && (
                    <p className="mt-1 text-sm text-red-600">{errors.lead_id}</p>
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
                    rows={4}
                    value={formData.description}
                    onChange={handleInputChange}
                    className="mt-2 block w-full bg-blue-50 border border-blue-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400"
                    placeholder="Enter opportunity description"
                  />
                </div>

                {/* Value Field */}
                <div className="sm:col-span-1">
                  <label htmlFor="value" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Value
                  </label>
                  <input
                    type="number"
                    id="value"
                    name="value"
                    value={formData.value}
                    onChange={handleInputChange}
                    step="0.01"
                    className={`mt-2 block w-full bg-blue-50 border ${errors.value ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400`}
                    placeholder="0.00"
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
                    step="1"
                    className={`mt-2 block w-full bg-blue-50 border ${errors.probability ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400`}
                    placeholder="50"
                  />
                  {errors.probability && (
                    <p className="mt-1 text-sm text-red-600">{errors.probability}</p>
                  )}
                </div>

                {/* Expected Close Date Field */}
                <div className="sm:col-span-1">
                  <label htmlFor="expected_close_date" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Expected Close Date
                  </label>
                  <input
                    type="datetime-local"
                    id="expected_close_date"
                    name="expected_close_date"
                    value={formData.expected_close_date}
                    onChange={handleInputChange}
                    className="mt-2 block w-full bg-blue-50 border border-blue-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm"
                  />
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
                    placeholder="Select a stage"
                  />
                </div>
              </div>
            </div>

            {/* Assignment Section - Admin/Manager Only */}
            {(user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Assignment</h3>

                <div className="grid grid-cols-1 gap-y-5 gap-x-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="assigned_to" className="block text-sm font-medium" style={{ color: 'black' }}>
                      Assign To
                    </label>
                    <Select
                      id="assigned_to"
                      name="assigned_to"
                      value={formData.assigned_to}
                      onChange={handleInputChange}
                      options={[
                        { value: '', label: 'Select a sales executive' },
                        ...(loadingSalesExecutives ? [{ value: '', label: 'Loading...', disabled: true }] : salesExecutives.map(executive => ({
                          value: executive.id,
                          label: executive.full_name
                        })))
                      ]}
                      disabled={loadingSalesExecutives}
                    />
                  </div>
                </div>
              </div>
            )}

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
                  className="px-4 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating...
                    </>
                  ) : (
                    'Create Opportunity'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default CreateOpportunityDrawer;
