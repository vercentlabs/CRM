
import React from 'react';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';

/**
 * FollowupsPageHeader component - Header for the followups page
 * @param {Object} props - Component props
 * @param {number} props.count - Number of follow-ups
 * @param {Function} props.onRefresh - Function to call when refresh button is clicked
 */
const FollowupsPageHeader = ({
  count = 0,
  onRefresh
}) => {
  return (
    <div className="mb-4 sm:mb-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg overflow-hidden">
        <div className="px-3 py-3 sm:px-5 sm:py-5 md:px-6 md:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="mb-2 sm:mb-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                Follow Ups
              </h1>
              <p className="mt-1 sm:mt-1.5 text-indigo-100 text-xs sm:text-sm md:text-base">
                Your daily task list of leads that need follow-up
              </p>
              <div className="mt-1.5 sm:mt-2 flex items-center">
                <div className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-white/20 text-white backdrop-blur-sm">
                  <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                  </svg>
                  {count} Total Follow Ups
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FollowupsPageHeader;
