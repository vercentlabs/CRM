
import React from 'react';

/**
 * DashboardPageHeader component - Header for dashboard page
 * @param {Object} props - Component props
 * @param {Function} props.onRefresh - Function to call when refresh button is clicked
 */
const DashboardPageHeader = ({
  onRefresh
}) => {
  return (
    <div className="mb-4 sm:mb-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg overflow-hidden">
        <div className="px-3 py-3 sm:px-5 sm:py-5 md:px-6 md:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="mb-2 sm:mb-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                Dashboard
              </h1>
              <p className="mt-1 sm:mt-1.5 text-indigo-100 text-xs sm:text-sm md:text-base">
                Track your leads, conversions, and team performance
              </p>
            </div>

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
  );
};

export default DashboardPageHeader;
