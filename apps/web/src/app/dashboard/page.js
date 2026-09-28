
'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import DashboardPageHeader from '@/components/dashboard/DashboardPageHeader';
import LeadsOverTimeChart from '@/components/dashboard/LeadsOverTimeChart';
import LeadStatusChart from '@/components/dashboard/LeadStatusChart';
import RecentLeadsTable from '@/components/dashboard/RecentLeadsTable';
import SalesExecutiveTable from '@/components/dashboard/SalesExecutiveTable';

const DashboardPage = () => {
  const [loading, setLoading] = useState(true);
  const [kpiData, setKpiData] = useState({
    totalLeads: {
      title: 'Total Leads',
      value: 0,
      change: 0,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: 'blue'
    },
    newLeads: {
      title: 'New Leads',
      value: 0,
      change: 0,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
      color: 'green'
    },
    qualifiedLeads: {
      title: 'Qualified Leads',
      value: 0,
      change: 0,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'purple'
    },
    convertedLeads: {
      title: 'Converted Leads',
      value: 0,
      change: 0,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'green'
    },
    lostLeads: {
      title: 'Lost Leads',
      value: 0,
      change: 0,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'red'
    }
  });

  // Fetch dashboard data from backend
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const api = (await import('@/lib/api')).default;
        const response = await api.get('/reports/dashboard-summary');
        const data = response.data;

        // Update KPI data with real values
        // Transform leadsByStatus array from backend to object format
        const leadsByStatusArray = data.leadsByStatus || [];
        const leadsByStatus = {};
        leadsByStatusArray.forEach(item => {
          leadsByStatus[item.status] = item.count;
        });

        const newLeads = leadsByStatus['New'] || 0;
        const contactedLeads = leadsByStatus['Contacted'] || 0;
        const qualifiedLeads = leadsByStatus['Qualified'] || 0;
        const convertedLeads = leadsByStatus['Converted'] || 0;
        const lostLeads = leadsByStatus['Lost'] || 0;
        const totalLeads = data.totalLeads || 0;

        // Calculate percentages
        const calculatePercentage = (value, total) => {
          if (total === 0) return 0;
          return Math.round((value / total) * 100);
        };

        setKpiData(prev => ({
          ...prev,
          leadsByStatus: leadsByStatus,
          totalLeads: {
            ...prev.totalLeads,
            value: totalLeads,
            change: 0 // Total doesn't need a percentage
          },
          newLeads: {
            ...prev.newLeads,
            value: newLeads,
            change: calculatePercentage(newLeads, totalLeads)
          },
          qualifiedLeads: {
            ...prev.qualifiedLeads,
            value: qualifiedLeads,
            change: calculatePercentage(qualifiedLeads, totalLeads)
          },
          convertedLeads: {
            ...prev.convertedLeads,
            value: convertedLeads,
            change: calculatePercentage(convertedLeads, totalLeads)
          },
          lostLeads: {
            ...prev.lostLeads,
            value: lostLeads,
            change: calculatePercentage(lostLeads, totalLeads)
          }
        }));
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const getTrendColor = (change) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getTrendIcon = (change) => {
    if (change > 0) return '↑';
    if (change < 0) return '↓';
    return '→';
  };

  const getCardBgColor = (color) => {
    const colors = {
      blue: 'bg-blue-50',
      green: 'bg-green-50',
      purple: 'bg-purple-50',
      red: 'bg-red-50',
      yellow: 'bg-yellow-50'
    };
    return colors[color] || 'bg-gray-50';
  };

  const getIconColor = (color) => {
    const colors = {
      blue: 'text-blue-600',
      green: 'text-green-600',
      purple: 'text-purple-600',
      red: 'text-red-600',
      yellow: 'text-yellow-600'
    };
    return colors[color] || 'text-gray-600';
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <DashboardPageHeader onRefresh={() => window.location.reload()} />

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            {Object.entries(kpiData).filter(([key]) => key !== 'leadsByStatus').map(([key, kpi], index) => (
              <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">{kpi.title}</p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{kpi.value.toLocaleString()}</p>
                    {key !== 'totalLeads' && (
                      <p className={`text-xs mt-1 ${getTrendColor(kpi.change)}`}>
                        {getTrendIcon(kpi.change)} {Math.abs(kpi.change)}%
                      </p>
                    )}
                  </div>
                  <div className={`p-2 sm:p-3 ${getCardBgColor(kpi.color)} rounded-lg`}>
                    <div className={`${getIconColor(kpi.color)} h-5 w-5 sm:h-6 sm:w-6`}>
                      {kpi.icon}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
            {/* Leads Over Time Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
              <LeadsOverTimeChart />
            </div>

            {/* Lead Status Distribution Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
              <LeadStatusChart leadsByStatus={kpiData.leadsByStatus || {}} />
            </div>
          </div>

          {/* Data Tables Section */}
          <div className="space-y-4 sm:space-y-6">
            {/* Recent Leads Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <RecentLeadsTable />
            </div>

            {/* Sales Executive Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <SalesExecutiveTable />
            </div>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default DashboardPage;
