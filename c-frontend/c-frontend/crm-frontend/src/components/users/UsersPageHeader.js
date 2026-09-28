
import React from 'react';
import { ROLE_ADMIN } from '@/lib/constants';

/**
 * UsersPageHeader component - Header for the users page
 * @param {Object} props - Component props
 * @param {number} props.count - Number of users
 * @param {Function} props.onRefresh - Function to call when refresh button is clicked
 * @param {Function} props.onAddUser - Function to call when add user button is clicked
 */
const UsersPageHeader = ({
  count = 0,
  onRefresh,
  onAddUser
}) => {
  return (
    <div className="mb-4 sm:mb-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg overflow-hidden">
        <div className="px-3 py-3 sm:px-5 sm:py-5 md:px-6 md:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="mb-2 sm:mb-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                Team
              </h1>
              <p className="mt-1 sm:mt-1.5 text-indigo-100 text-xs sm:text-sm md:text-base">
                Manage team members and their access levels
              </p>
              <div className="mt-1.5 sm:mt-2 flex items-center">
                <div className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-white/20 text-white backdrop-blur-sm">
                  <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                  </svg>
                  {count} Team Members
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 sm:gap-2 w-full sm:w-auto">
              {/* Refresh button */}
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center px-2.5 py-1.5 sm:px-3 sm:py-2 border border-white/30 rounded-lg text-[11px] sm:text-xs font-medium text-white bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white focus:ring-offset-indigo-600 transition-all duration-200 backdrop-blur-sm"
                >
                  <svg
                    className="mr-1 sm:mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Refresh
                </button>
              )}

              {/* Add user button */}
              {onAddUser && (
                <button
                  type="button"
                  onClick={onAddUser}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center px-3 py-1.5 sm:px-4 sm:py-2 border border-transparent rounded-lg text-[11px] sm:text-xs font-semibold text-indigo-600 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-indigo-600 transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  <svg
                    className="mr-1 sm:mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add User
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UsersPageHeader;
