'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import ReportsPageHeader from '@/components/reports/ReportsPageHeader';

const REPORT_CARDS = [
  {
    title: 'Sales Performance',
    href: '/reports/sales-performance',
    description: 'Track individual and team sales metrics, conversion rates, and performance trends over time.',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER],
    icon: (
      <svg className="h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    category: 'Sales'
  },
  {
    title: 'Lead Aging',
    href: '/reports/lead-aging',
    description: 'Analyze how long leads remain in your pipeline to identify bottlenecks and improve conversion.',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES],
    icon: (
      <svg className="h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    category: 'Leads'
  },
  {
    title: 'Conversion Funnel',
    href: '/reports/conversion',
    description: 'Visualize lead movement across stages to identify conversion bottlenecks and optimization opportunities.',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES],
    icon: (
      <svg className="h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    category: 'Leads'
  }
];

const ReportsPage = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const fetchReports = useCallback(() => {
    setLoading(true);
    setError(null);
    const filteredReports = user?.roleId === ROLE_SALES
      ? REPORT_CARDS.filter(report => report.allowedRoles?.includes(ROLE_SALES))
      : REPORT_CARDS;
    setReports(filteredReports);
    setLoading(false);
  }, [user?.roleId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return (
    <ProtectedRoute roles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <ReportsPageHeader
            count={reports.length}
            onRefresh={fetchReports}
          />

          {loading ? (
            <div className="bg-white shadow rounded-xl p-8 sm:p-12">
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-indigo-600"></div>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-xl">
              <div className="flex">
                <div className="shrink-0">
                  <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-red-800">
                    Error loading reports
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        fetchReports();
                      }}
                      className="bg-red-50 px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {reports.map((report) => (
                  <div key={report.href} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
                    <div className="flex items-center">
                      <div className="shrink-0">
                        {report.icon}
                      </div>
                      <div className="ml-4 flex-1">
                        <h3 className="text-base sm:text-lg font-medium text-gray-900">{report.title}</h3>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                          {report.category}
                        </span>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-gray-500">{report.description}</p>
                    <div className="mt-5">
                      <Link
                        href={report.href}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                      >
                        View report <span aria-hidden="true">&rarr;</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-12 bg-white shadow overflow-hidden sm:rounded-xl">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Report Tips</h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">
                    Get the most out of your reports with these helpful tips.
                  </p>
                </div>
                <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                  <dl className="sm:divide-y sm:divide-gray-200">
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Filter your data</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        Use date range and user filters to focus on specific time periods or team members.
                      </dd>
                    </div>
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Export for analysis</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        Download reports as CSV files for deeper analysis in Excel or other tools.
                      </dd>
                    </div>
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Track trends</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        Monitor key metrics over time to identify patterns and make data-driven decisions.
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </>
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default ReportsPage;
