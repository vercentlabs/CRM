
import React, { useState, useEffect } from 'react';
import './CreateUserDrawer.css';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN } from '@/lib/constants';

const EditUserDrawer = ({ user, onSubmit, onCancel, isLoading = false }) => {
  const { currentUser } = useAuth();

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    mobile_number: '',
    role_id: '',
    is_active: true
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        full_name: user.full_name || '',
        email: user.email || '',
        mobile_number: user.mobile_number || '',
        role_id: user.role_id || '',
        is_active: user.is_active !== undefined ? user.is_active : true
      });
    }
  }, [user]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEsc);

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onCancel]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.mobile_number.trim()) {
      newErrors.mobile_number = 'Mobile number is required';
    } else if (!/^\d{10,}$/.test(formData.mobile_number.replace(/[^\d]/g, ''))) {
      newErrors.mobile_number = 'Please enter a valid mobile number';
    }

    if (!formData.role_id) {
      newErrors.role_id = 'Role is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    onSubmit(formData);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-40 animate-fade-in" onClick={onCancel}></div>

      <div className="fixed top-0 right-0 h-screen w-[520px] bg-white z-50 shadow-2xl flex flex-col animate-slide-in-right">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Edit User</h2>
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

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Basic Information</h3>

              <div className="grid grid-cols-1 gap-y-5 gap-x-4 sm:grid-cols-2">
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

                <div className="sm:col-span-2">
                  <label htmlFor="email" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className={`mt-2 block w-full bg-blue-50 border ${errors.email ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400`}
                    placeholder="user@example.com"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                  )}
                </div>

                <div className="sm:col-span-2">
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

                <div className="sm:col-span-2">
                  <label htmlFor="role_id" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="role_id"
                    name="role_id"
                    required
                    value={formData.role_id}
                    onChange={handleInputChange}
                    className={`mt-2 block w-full bg-blue-50 border ${errors.role_id ? 'border-red-500' : 'border-blue-300'} rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm`}
                  >
                    <option value="">Select a role</option>
                    <option value="1">Admin</option>
                    <option value="2">Manager</option>
                    <option value="3">Sales Executive</option>
                  </select>
                  {errors.role_id && (
                    <p className="mt-1 text-sm text-red-600">{errors.role_id}</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="is_active" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Status
                  </label>
                  <div className="mt-2 flex items-center">
                    <input
                      type="checkbox"
                      id="is_active"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleInputChange}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                      Active
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

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
              form="edit-user-form"
              disabled={isLoading}
              className="px-4 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating...
                </>
              ) : (
                'Update User'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default EditUserDrawer;
