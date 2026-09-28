
import React, { useState, useEffect } from 'react';
import './CreateCustomerDrawer.css';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER } from '@/lib/constants';
import Select from '@/components/common/Select';

/**
 * CreateCustomerDrawer component - Drawer for creating a new customer
 * @param {Object} props - Component props
 * @param {Function} props.onSubmit - Function to call when form is submitted
 * @param {Function} props.onCancel - Function to call when drawer is cancelled
 * @param {boolean} props.isLoading - Whether form is in loading state
 */
const CreateCustomerDrawer = ({ onSubmit, onCancel, isLoading = false }) => {
  const { user } = useAuth();
  const [salesExecutives, setSalesExecutives] = useState([]);
  const [loadingSalesExecutives, setLoadingSalesExecutives] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    mobile_number: '',
    alternate_number: '',
    email: '',
    address: '',
    company: '',
    notes: '',
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
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required';
    }

    if (!formData.mobile_number.trim()) {
      newErrors.mobile_number = 'Mobile number is required';
    } else if (!/^\d{10,}$/.test(formData.mobile_number.replace(/[^\d]/g, ''))) {
      newErrors.mobile_number = 'Please enter a valid mobile number';
    }

    if (formData.alternate_number && !/^\d{10,}$/.test(formData.alternate_number.replace(/[^\d]/g, ''))) {
      newErrors.alternate_number = 'Please enter a valid alternate number';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
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

    onSubmit(submitData);
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
              Add New Customer
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
            {/* Contact Information Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Contact Information</h3>

              <div className="grid grid-cols-1 gap-y-5 gap-x-4 sm:grid-cols-2">
                {/* Full Name Field */}
                <div className="sm:col-span-2">
                  <label htmlFor="full_name" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="full_name"
                    name="full_name"
                    required
                    value={formData.full_name}
                    onChange={handleInputChange}
                    className={`mt-2 block w-full bg-blue-50 border ${errors.full_name ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400`}
                  />
                  {errors.full_name && (
                    <p className="mt-1 text-sm text-red-600">{errors.full_name}</p>
                  )}
                </div>

                {/* Mobile Number Field */}
                <div className="sm:col-span-1">
                  <label htmlFor="mobile_number" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Mobile Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    id="mobile_number"
                    name="mobile_number"
                    required
                    value={formData.mobile_number}
                    onChange={handleInputChange}
                    className={`mt-2 block w-full bg-blue-50 border ${errors.mobile_number ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400`}
                  />
                  {errors.mobile_number && (
                    <p className="mt-1 text-sm text-red-600">{errors.mobile_number}</p>
                  )}
                </div>

                {/* Alternate Number Field */}
                <div className="sm:col-span-1">
                  <label htmlFor="alternate_number" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Alternate Number
                  </label>
                  <input
                    type="tel"
                    id="alternate_number"
                    name="alternate_number"
                    value={formData.alternate_number}
                    onChange={handleInputChange}
                    className={`mt-2 block w-full bg-blue-50 border ${errors.alternate_number ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400`}
                  />
                  {errors.alternate_number && (
                    <p className="mt-1 text-sm text-red-600">{errors.alternate_number}</p>
                  )}
                </div>

                {/* Email Field */}
                <div className="sm:col-span-2">
                  <label htmlFor="email" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className={`mt-2 block w-full bg-blue-50 border ${errors.email ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400`}
                    placeholder="customer@example.com"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                  )}
                </div>

                {/* Address Field */}
                <div className="sm:col-span-2">
                  <label htmlFor="address" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Address
                  </label>
                  <textarea
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    rows={3}
                    className="mt-2 block w-full bg-blue-50 border border-blue-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400"
                    placeholder="Enter customer address"
                  />
                </div>
              </div>
            </div>

            {/* Company Information Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Company Information</h3>

              <div className="grid grid-cols-1 gap-y-5 gap-x-4 sm:grid-cols-2">
                {/* Company Name Field */}
                <div className="sm:col-span-2">
                  <label htmlFor="company" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Company Name
                  </label>
                  <input
                    type="text"
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleInputChange}
                    className="mt-2 block w-full bg-blue-50 border border-blue-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400"
                    placeholder="Enter company name"
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

            {/* Additional Information Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Additional Information</h3>

              <div className="grid grid-cols-1 gap-y-5 gap-x-4 sm:grid-cols-2">
                {/* Notes Field */}
                <div className="sm:col-span-2">
                  <label htmlFor="notes" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows={4}
                    className="mt-2 block w-full bg-blue-50 border border-blue-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400"
                    placeholder="Add any additional notes about this customer"
                  />
                </div>
              </div>
            </div>
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
                  'Create Customer'
                )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default CreateCustomerDrawer;
