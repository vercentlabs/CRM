"use client";

import React, { useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN } from '@/lib/constants';

const UsersTable = ({ users, loading, error, onEdit, onStatusChange }) => {
  const { user } = useAuth();
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const handleToggleStatus = async (userId, currentStatus) => {
    try {
      setUpdatingUserId(userId);

      // Call API to toggle user status
      const response = await api.patch(`/users/${userId}/status`);

      if (response.status !== 200) {
        throw new Error(response.data?.message || 'Failed to update user status');
      }

      // Call the callback to update the UI
      if (onStatusChange) {
        const newStatus = !currentStatus; // Toggle the status
        onStatusChange(userId, newStatus ? 'Active' : 'Inactive');
      }
    } catch (error) {
      console.error('Error updating user status:', error);
      alert(error.response?.data?.message || 'Failed to update user status');
    } finally {
      setUpdatingUserId(null);
    }
  };



  return (
    <>
      {successMessage && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md">
          {successMessage}
        </div>
      )}
      <div className="overflow-hidden shadow-lg rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-linear-to-r from-indigo-50 to-purple-50">
            <tr>
              <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                Name
              </th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                Email
              </th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                Mobile
              </th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                Role
              </th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="relative px-6 py-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr key="loading">
                <td colSpan="6" className="whitespace-nowrap px-6 py-8 text-sm text-gray-500 text-center">
                  Loading users...
                </td>
              </tr>
            ) : error ? (
              <tr key="error">
                <td colSpan="6" className="whitespace-nowrap px-6 py-8 text-sm text-red-500 text-center">
                  Error: {error}
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr key="empty">
                <td colSpan="6" className="whitespace-nowrap px-6 py-8 text-sm text-gray-500 text-center">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((userItem) => (
                <tr key={`user-${userItem.id}`} className="hover:bg-indigo-50/50 transition-colors duration-200">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="shrink-0 h-11 w-11">
                        <div className="h-11 w-11 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                          <span className="text-white font-semibold text-lg">
                            {userItem.full_name?.charAt(0).toUpperCase() || 'U'}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-semibold text-gray-900">
                          {userItem.full_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {userItem.username || 'No username'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <a
                      href={`mailto:${userItem.email}`}
                      className="text-indigo-600 hover:text-indigo-900"
                      title="Click to email"
                    >
                      {userItem.email}
                    </a>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {userItem.mobile_number || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      userItem.role_id === 1
                        ? 'bg-gray-100 text-gray-800'
                        : userItem.role_id === 2
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {userItem.role_id === 1 ? 'Admin' : userItem.role_id === 2 ? 'Manager' : 'Sales'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      userItem.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {userItem.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(userItem)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Edit user"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleStatus(userItem.id, userItem.is_active)}
                        disabled={updatingUserId === userItem.id}
                        className={`${
                          userItem.is_active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'
                        } ${updatingUserId === userItem.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={userItem.is_active ? 'Deactivate user' : 'Activate user'}
                      >
                        {updatingUserId === userItem.id ? 'Updating...' :
                         userItem.is_active ? 'Deactivate' : 'Activate'}
                      </button>

                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default UsersTable;
