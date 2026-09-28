import React, { useState, useEffect } from 'react';
import './CreateTaskDrawer.css';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER } from '@/lib/constants';
import Select from '@/components/common/Select';

/**
 * CreateTaskDrawer component - Drawer for creating a new task
 * @param {Object} props - Component props
 * @param {Function} props.onSubmit - Function to call when form is submitted
 * @param {Function} props.onCancel - Function to call when drawer is cancelled
 * @param {boolean} props.isLoading - Whether form is in loading state
 */
const CreateTaskDrawer = ({ onSubmit, onCancel, isLoading = false }) => {
  const { user } = useAuth();
  const [salesExecutives, setSalesExecutives] = useState([]);
  const [loadingSalesExecutives, setLoadingSalesExecutives] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    assigned_to: '',
    lead_id: ''
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
        // Filter only sales executives or all users based on your requirements
        const filteredExecutives = data.users || [];
        setSalesExecutives(filteredExecutives);
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

  // Handle select changes from custom Select component
  const handleSelectChange = (name, value) => {
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
    if (!formData.title.trim()) {
      newErrors.title = 'Task title is required';
    } else if (formData.title.trim().length < 3) {
      newErrors.title = 'Task title must be at least 3 characters';
    }

    if (!formData.due_date) {
      newErrors.due_date = 'Due date is required';
    } else {
      const selectedDate = new Date(formData.due_date);
      const today = new Date();
      if (selectedDate < today) {
        newErrors.due_date = 'Due date cannot be in the past';
      }
    }

    // Validate lead_id if provided
    if (formData.lead_id && !/^\d+$/.test(formData.lead_id)) {
      newErrors.lead_id = 'Lead ID must be a number';
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

    // Prepare data for submission
    const submitData = {
      ...formData,
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      lead_id: formData.lead_id ? parseInt(formData.lead_id) : null,
      assigned_to: formData.assigned_to || null
    };

    onSubmit(submitData);
  };

  // Format date for datetime-local input
  const getCurrentDateTimeString = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

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
              Add New Task
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
            {/* Task Information Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Task Information</h3>

              <div className="grid grid-cols-1 gap-y-5 gap-x-4 sm:grid-cols-2">
                {/* Title Field */}
                <div className="sm:col-span-2">
                  <label htmlFor="title" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Task Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    required
                    value={formData.title}
                    onChange={handleInputChange}
                    className={`mt-2 block w-full bg-blue-50 border ${errors.title ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400`}
                    placeholder="Enter task title"
                    maxLength={100}
                  />
                  {errors.title && (
                    <p className="mt-1 text-sm text-red-600">{errors.title}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500 text-right">
                    {formData.title.length}/100 characters
                  </p>
                </div>

                {/* Description Field */}
                <div className="sm:col-span-2">
                  <label htmlFor="description" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={4}
                    className="mt-2 block w-full bg-blue-50 border border-blue-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400"
                    placeholder="Enter task description"
                    maxLength={500}
                  />
                  <p className="mt-1 text-xs text-gray-500 text-right">
                    {formData.description.length}/500 characters
                  </p>
                </div>

                {/* Due Date Field */}
                <div className="sm:col-span-1">
                  <label htmlFor="due_date" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Due Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    id="due_date"
                    name="due_date"
                    required
                    value={formData.due_date}
                    onChange={handleInputChange}
                    min={getCurrentDateTimeString()}
                    className={`mt-2 block w-full bg-blue-50 border ${errors.due_date ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm`}
                  />
                  {errors.due_date && (
                    <p className="mt-1 text-sm text-red-600">{errors.due_date}</p>
                  )}
                </div>

                {/* Priority Field */}
                <div className="sm:col-span-1">
                  <label htmlFor="priority" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Priority
                  </label>
                  <Select
                    id="priority"
                    name="priority"
                    value={formData.priority}
                    onChange={(value) => handleSelectChange('priority', value)}
                    options={[
                      { value: 'low', label: 'Low' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'high', label: 'High' }
                    ]}
                  />
                </div>

                {/* Lead ID Field */}
                <div className="sm:col-span-2">
                  <label htmlFor="lead_id" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Related Lead
                  </label>
                  <input
                    type="text"
                    id="lead_id"
                    name="lead_id"
                    value={formData.lead_id}
                    onChange={handleInputChange}
                    className={`mt-2 block w-full bg-blue-50 border ${errors.lead_id ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400`}
                    placeholder="Enter lead ID (optional)"
                  />
                  {errors.lead_id && (
                    <p className="mt-1 text-sm text-red-600">{errors.lead_id}</p>
                  )}
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
                      onChange={(value) => handleSelectChange('assigned_to', value)}
                      options={[
                        { value: '', label: 'Select a sales executive' },
                        ...(loadingSalesExecutives ? [{ value: '', label: 'Loading...', disabled: true }] : salesExecutives.map(executive => ({
                          value: executive.id,
                          label: executive.full_name || executive.email
                        })))
                      ]}
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
              onClick={handleSubmit}
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
                'Create Task'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default CreateTaskDrawer;