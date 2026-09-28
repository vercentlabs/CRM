
'use client';

import React, { useState, useEffect } from 'react';
import axios from '../../lib/axios';

const LeadsOverTimeChart = () => {
  const [timeFilter, setTimeFilter] = useState('This Month');
  const [chartData, setChartData] = useState({
    'Today': [],
    'This Week': [],
    'This Month': []
  });
  const [loading, setLoading] = useState(true);

  // Fetch leads over time data from backend
  useEffect(() => {
    const fetchLeadsOverTime = async () => {
      try {
        const token = localStorage.getItem('token');

        // Fetch data for all three periods
        const [todayData, weekData, monthData] = await Promise.all([
          axios.get('/reports/leads-over-time?period=today', {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get('/reports/leads-over-time?period=week', {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get('/reports/leads-over-time?period=month', {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        // If no data for any period, fetch all leads and display them
        if (!todayData.data.length && !weekData.data.length && !monthData.data.length) {
          const allLeads = await axios.get('/leads', {
            headers: { Authorization: `Bearer ${token}` }
          });

          // Group leads by date
          const leadsByDate = {};
          (allLeads.data.leads || []).forEach(lead => {
            const dateKey = new Date(lead.created_at).toISOString().slice(0, 10);
            if (!leadsByDate[dateKey]) {
              leadsByDate[dateKey] = 0;
            }
            leadsByDate[dateKey]++;
          });

          // Convert to array format
          const allLeadsData = Object.entries(leadsByDate)
            .map(([dateKey, count]) => ({
              time: new Date(dateKey).toLocaleDateString(),
              leads: count,
              dateKey
            }))
            .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
            .map(({ time, leads }) => ({ time, leads }));

          setChartData({
            'Today': allLeadsData.slice(0, 10),
            'This Week': allLeadsData.slice(0, 7),
            'This Month': allLeadsData.slice(0, 4)
          });
        } else {
          setChartData({
            'Today': todayData.data,
            'This Week': weekData.data,
            'This Month': monthData.data
          });
        }
      } catch (error) {
        console.error('Error fetching leads over time:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeadsOverTime();
  }, []);

  const currentData = chartData[timeFilter];

  // Handle empty data
  const hasData = currentData && currentData.length > 0;
  const maxValue = hasData ? Math.max(1, ...currentData.map(d => d.leads)) : 100;
  const chartHeight = 200;

  const generatePath = () => {
    if (!hasData || currentData.length === 0) return '';
    const points = currentData.map((d, i) => {
      // Handle single data point case
      const x = currentData.length === 1 ? 50 : (i / (currentData.length - 1)) * 100;
      const y = chartHeight - (d.leads / maxValue) * chartHeight;
      return `${x},${y}`;
    });
    return points.join(' ');
  };

  const generateAreaPath = () => {
    if (!hasData || currentData.length === 0) return '';
    const points = currentData.map((d, i) => {
      // Handle single data point case
      const x = currentData.length === 1 ? 50 : (i / (currentData.length - 1)) * 100;
      const y = chartHeight - (d.leads / maxValue) * chartHeight;
      return `${x},${y}`;
    });
    return `0,${chartHeight} ${points.join(' ')} 100,${chartHeight}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">Leads Over Time</h3>
        <div className="flex gap-1 sm:gap-2 items-center">
          {['Today', 'This Week', 'This Month'].map((filter) => (
            <button
              key={filter}
              onClick={() => setTimeFilter(filter)}
              className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors whitespace-nowrap ${
                timeFilter === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center" style={{ height: `${chartHeight + 40}px` }}>
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        </div>
      ) : !hasData ? (
        <div className="flex justify-center items-center text-gray-500 text-sm sm:text-base" style={{ height: `${chartHeight + 40}px` }}>
          No data available for this period
        </div>
      ) : (
        <div className="relative" style={{ height: `${chartHeight + 40}px` }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-8 w-6 sm:w-8 flex flex-col justify-between text-[10px] sm:text-xs text-gray-500">
          <span>{maxValue}</span>
          <span>{Math.round(maxValue / 2)}</span>
          <span>0</span>
        </div>

        {/* Chart area */}
        <div className="absolute left-6 sm:left-8 right-0 top-0 bottom-8">
          <svg width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="none">
            {/* Area fill */}
            <path
              d={`M ${generateAreaPath()} Z`}
              fill="rgba(59, 130, 246, 0.1)"
              className="transition-all duration-500 ease-in-out"
            />
            {/* Line */}
            <path
              d={`M ${generatePath()}`}
              fill="none"
              stroke="rgb(59, 130, 246)"
              strokeWidth="0.5"
              className="transition-all duration-500 ease-in-out"
            />
            {/* Data points */}
            {currentData.map((d, i) => {
              // Handle single data point case
              const x = currentData.length === 1 ? 50 : (i / (currentData.length - 1)) * 100;
              const y = chartHeight - (d.leads / maxValue) * chartHeight;
              return (
                <g key={i}>
                  <circle
                    cx={x}
                    cy={y}
                    r="1.5"
                    fill="rgb(59, 130, 246)"
                    className="transition-all duration-500 ease-in-out hover:r-2"
                  />
                  {/* Tooltip */}
                  <foreignObject
                    x={x - 10}
                    y={y - 35}
                    width="20"
                    height="30"
                    className="opacity-0 hover:opacity-100 transition-opacity"
                  >
                    <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 text-center">
                      {d.leads}
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        </div>

        {/* X-axis labels */}
        <div className="absolute left-6 sm:left-8 right-0 bottom-0 flex justify-between text-[10px] sm:text-xs text-gray-500">
          {currentData.map((d, i) => (
            <span key={i}>{d.time}</span>
          ))}
        </div>
      </div>
      )}
    </div>
  );
};

export default LeadsOverTimeChart;
