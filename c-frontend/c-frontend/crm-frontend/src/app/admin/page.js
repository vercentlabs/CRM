
'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import Link from 'next/link';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

const AdminPage = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalLeads: 0,
    totalCustomers: 0,
    systemStatus: 'operational'
  });
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  useEffect(() => {
    const fetchAdminStats = async () => {
      try {
        setLoading(true);
        // Fetch users count
        const usersResponse = await api.get('/users');
        const users = usersResponse.data.users || [];

        // Fetch leads count
        const leadsResponse = await api.get('/leads');
        const leadsData = leadsResponse.data;
        const totalLeads = leadsData.pagination?.total || leadsData.leads?.length || 0;

        // Fetch customers count
        const customersResponse = await api.get('/customers');
        const customers = customersResponse.data.customers || [];

        setStats({
          totalUsers: users.length,
          activeUsers: users.filter(u => u.is_active).length,
          totalLeads,
          totalCustomers: customers.length,
          systemStatus: 'operational'
        });
      } catch (err) {
        console.error('Failed to fetch admin stats:', err);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchAdminStats();
    }
  }, [token]);

  const adminTools = [
    {
      title: 'User Management',
      description: 'Manage team members, roles, and permissions',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      href: '/users',
      color: 'bg-blue-500'
    },
    {
      title: 'System Settings',
      description: 'Configure system-wide settings and preferences',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      href: '/settings',
      color: 'bg-purple-500'
    },
    {
      title: 'Audit Logs',
      description: 'View system activity and audit trails',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      href: '/audit',
      color: 'bg-green-500'
    },
    {
      title: 'Reports',
      description: 'View and generate system reports',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      href: '/reports',
      color: 'bg-orange-500'
    },
    {
      title: 'Locations',
      description: 'Manage locations and executives',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      href: '/locations',
      color: 'bg-red-500'
    }
  ];

  return (
    <ProtectedRoute allowedRoles={[ROLE_ADMIN]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <AdminPageHeader systemStatus={stats.systemStatus} />

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-3 py-3 sm:px-4 sm:py-4">
                <dt className="text-xs font-medium text-gray-500 truncate">Total Users</dt>
                <dd className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">{loading ? '...' : stats.totalUsers}</dd>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-3 py-3 sm:px-4 sm:py-4">
                <dt className="text-xs font-medium text-gray-500 truncate">Active Users</dt>
                <dd className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">{loading ? '...' : stats.activeUsers}</dd>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-3 py-3 sm:px-4 sm:py-4">
                <dt className="text-xs font-medium text-gray-500 truncate">Total Leads</dt>
                <dd className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">{loading ? '...' : stats.totalLeads}</dd>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-3 py-3 sm:px-4 sm:py-4">
                <dt className="text-xs font-medium text-gray-500 truncate">Total Customers</dt>
                <dd className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">{loading ? '...' : stats.totalCustomers}</dd>
              </div>
            </div>
          </div>

          {/* Admin Tools Grid */}
          <div className="mt-6">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">Administration Tools</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {adminTools.map((tool, index) => (
                <Link
                  key={index}
                  href={tool.href}
                  className="relative group bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-200"
                >
                  <div className={`${tool.color} rounded-lg p-2 inline-block mb-3 group-hover:scale-110 transition-transform duration-200`}>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {tool.icon.props.children}
                    </svg>
                  </div>
                  <h3 className="text-base font-medium text-gray-900">{tool.title}</h3>
                  <p className="mt-1.5 text-xs sm:text-sm text-gray-500">{tool.description}</p>
                  <div className="mt-3 flex items-center text-xs sm:text-sm font-medium text-indigo-600 group-hover:text-indigo-500">
                    Access tool
                    <svg className="ml-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default AdminPage;
