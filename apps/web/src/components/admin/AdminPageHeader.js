
import React from 'react';
import { ROLE_ADMIN } from '@/lib/constants';

/**
 * AdminPageHeader component - Header for the admin page
 * @param {Object} props - Component props
 * @param {string} props.systemStatus - Current system status ('operational' or other)
 */
const AdminPageHeader = ({
  systemStatus = 'operational'
}) => {
  return (
    <div className="mb-4 sm:mb-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg overflow-hidden">
        <div className="px-3 py-3 sm:px-5 sm:py-5 md:px-6 md:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="mb-2 sm:mb-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                System Administration
              </h1>
              <p className="mt-1 sm:mt-1.5 text-indigo-100 text-xs sm:text-sm md:text-base">
                Manage your system settings and administrative tools
              </p>
              <div className="mt-1.5 sm:mt-2 flex items-center">
                <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${
                  systemStatus === 'operational'
                    ? 'bg-green-400/20 text-green-100'
                    : 'bg-red-400/20 text-red-100'
                }`}>
                  <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full mr-1 ${
                    systemStatus === 'operational' ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                  System {systemStatus}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPageHeader;
