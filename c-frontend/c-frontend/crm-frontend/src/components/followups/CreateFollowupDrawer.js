
import React, { useState, useEffect } from 'react';
import './CreateFollowupDrawer.css';
import Select from '@/components/common/Select';

/**
 * CreateFollowupDrawer component - Drawer for editing lead status and follow-up
 * @param {Object} props - Component props
 * @param {Function} props.onSubmit - Function to call when form is submitted
 * @param {Function} props.onCancel - Function to call when drawer is cancelled
 * @param {boolean} props.isLoading - Whether form is in loading state
 * @param {Object} props.lead - Lead object to edit
 */
const CreateFollowupDrawer = ({ onSubmit, onCancel, isLoading = false, lead = null }) => {
  // Form state - Initialize with lead data
  const [formData, setFormData] = useState({
    status: lead?.status || '',
    next_call_at: lead?.next_call_at ? new Date(lead.next_call_at).toISOString().slice(0, 16) : '',
    notes: lead?.notes || ''
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

    // Validate status is required
    if (!formData.status) {
      newErrors.status = 'Status is required';
    }

    // Validate next_call_at is required
    if (!formData.next_call_at) {
      newErrors.next_call_at = 'Next call date is required';
    } else {
      const nextCallDate = new Date(formData.next_call_at);
      const now = new Date();

      if (nextCallDate < now) {
        newErrors.next_call_at = 'Next call date must be in the future';
      }
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

    // Submit the form data to update the lead
    onSubmit({
      id: lead?.id,
      ...formData
    });
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
              Create New Follow-up
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
            {/* Lead Information */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Lead Information</h3>
              <div className="bg-gray-50 px-4 py-5 sm:px-6 sm:py-6 rounded-lg">
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
                    <dt className="text-sm font-medium text-gray-500">Current Status</dt>
                    <dd className="mt-1 text-sm text-gray-900">{lead?.status || 'Not set'}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Status & Next Call Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Status & Follow-up</h3>

              <div className="grid grid-cols-1 gap-y-5 gap-x-4 sm:grid-cols-2">
                {/* Status Field */}
                <div className="sm:col-span-1">
                  <label htmlFor="status" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Status <span className="text-red-500">*</span>
                  </label>
                  <Select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    options={[
                      { value: '', label: 'Select status' },
                      { value: 'New', label: 'New' },
                      { value: 'Contacted', label: 'Contacted' },
                      { value: 'Qualified', label: 'Qualified' },
                      { value: 'Converted', label: 'Converted' },
                      { value: 'Lost', label: 'Lost' }
                    ]}
                  />
                  {errors.status && (
                    <p className="mt-1 text-sm text-red-600">{errors.status}</p>
                  )}
                </div>

                {/* Next Call Field */}
                <div className="sm:col-span-1">
                  <label htmlFor="next_call_at" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Next Call <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    id="next_call_at"
                    name="next_call_at"
                    required
                    value={formData.next_call_at}
                    onChange={handleInputChange}
                    className={`mt-2 block w-full bg-blue-50 border ${errors.next_call_at ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm`}
                  />
                  {errors.next_call_at && (
                    <p className="mt-1 text-sm text-red-600">{errors.next_call_at}</p>
                  )}
                </div>

                {/* Notes Field */}
                <div className="sm:col-span-2">
                  <label htmlFor="notes" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={4}
                    value={formData.notes}
                    onChange={handleInputChange}
                    className="mt-2 block w-full bg-blue-50 border border-blue-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400"
                    placeholder="Enter notes about this follow-up"
                  />
                </div>
              </div>
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
                    'Create Follow-up'
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

export default CreateFollowupDrawer;
