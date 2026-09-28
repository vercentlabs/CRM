import React, { useState } from 'react';

/**
 * CreateFollowupForm component - Form for creating new follow-ups
 * @param {Object} props - Component props
 * @param {Object} props.lead - Lead object for which follow-up is being created
 * @param {Function} props.onSubmit - Function to call when form is submitted
 * @param {Function} props.onCancel - Function to call when form is cancelled
 * @param {boolean} props.loading - Whether form is in loading state
 */
const CreateFollowupForm = ({
  lead,
  onSubmit,
  onCancel,
  loading = false
}) => {
  const [formData, setFormData] = useState({
    leadId: lead?.id || '',
    followupDate: '',
    followupType: 'call',
    notes: ''
  });

  const [errors, setErrors] = useState({});

  // Follow-up type options matching backend enum
  const followupTypeOptions = [
    { value: 'call', label: 'Phone Call' },
    { value: 'email', label: 'Email' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'task', label: 'Task' }
  ];

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  // Form validation
  const validate = () => {
    const newErrors = {};

    if (!formData.followupDate) {
      newErrors.followupDate = 'Follow-up date is required';
    }

    if (!formData.followupType) {
      newErrors.followupType = 'Follow-up type is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      onSubmit(formData);
    }
  };

  // Format date for datetime-local input
  const formatDateTimeForInput = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Schedule Follow-up
        </h3>

        {lead && (
          <div className="mb-4 p-3 bg-gray-50 rounded-md">
            <div className="text-sm font-medium text-gray-700">Lead Information</div>
            <div className="mt-1 text-sm text-gray-500">
              {lead.name} {lead.email && `(${lead.email})`}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="followupDate" className="block text-sm font-medium text-gray-700">
              Follow-up Date & Time
            </label>
            <div className="mt-1">
              <input
                type="datetime-local"
                id="followupDate"
                name="followupDate"
                value={formData.followupDate || formatDateTimeForInput()}
                onChange={handleChange}
                min={formatDateTimeForInput()}
                className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                  errors.followupDate ? 'border-red-500' : ''
                }`}
              />
              {errors.followupDate && (
                <p className="mt-2 text-sm text-red-600">{errors.followupDate}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="followupType" className="block text-sm font-medium text-gray-700">
              Follow-up Type
            </label>
            <div className="mt-1">
              <select
                id="followupType"
                name="followupType"
                value={formData.followupType}
                onChange={handleChange}
                className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                  errors.followupType ? 'border-red-500' : ''
                }`}
              >
                {followupTypeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {errors.followupType && (
                <p className="mt-2 text-sm text-red-600">{errors.followupType}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
              Notes
            </label>
            <div className="mt-1">
              <textarea
                id="notes"
                name="notes"
                rows={3}
                value={formData.notes}
                onChange={handleChange}
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="Add any notes for this follow-up..."
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Schedule Follow-up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateFollowupForm;
