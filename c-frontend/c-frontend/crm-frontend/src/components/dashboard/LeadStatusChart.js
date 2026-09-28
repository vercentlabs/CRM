
'use client';

import React from 'react';

const LeadStatusChart = ({ leadsByStatus = {} }) => {
  // Define status colors matching backend schema
  const statusColors = {
    'New': '#3B82F6',        // blue-500
    'Contacted': '#8B5CF6',    // purple-500
    'Qualified': '#10B981',     // emerald-500
    'Converted': '#22C55E',     // green-500
    'Lost': '#EF4444'           // red-500
  };

  // Convert backend data to chart format
  const statusData = Object.keys(leadsByStatus).map(status => ({
    label: status,
    value: leadsByStatus[status] || 0,
    color: statusColors[status] || '#9CA3AF'
  }));

  const total = statusData.reduce((sum, item) => sum + item.value, 0);
  const size = 220;
  const center = size / 2;
  const radius = 80;
  const strokeWidth = 30;

  // Calculate cumulative percentages for arc segments
  let cumulativePercent = 0;
  const segments = statusData.map(item => {
    const percent = total > 0 ? item.value / total : 0;
    const startPercent = cumulativePercent;
    const endPercent = cumulativePercent + percent;
    cumulativePercent = endPercent;

    return {
      ...item,
      startPercent,
      endPercent,
      percent
    };
  });

  // Convert percentage to coordinates
  const getCoordinatesForPercent = (percent) => {
    const x = center + radius * Math.cos(2 * Math.PI * percent);
    const y = center + radius * Math.sin(2 * Math.PI * percent);
    return { x, y };
  };

  // Generate path for each segment
  const getSegmentPath = (startPercent, endPercent) => {
    const start = getCoordinatesForPercent(startPercent);
    const end = getCoordinatesForPercent(endPercent);
    const largeArcFlag = endPercent - startPercent > 0.5 ? 1 : 0;

    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">Lead Status Distribution</h3>
        <div
          className="hidden sm:flex gap-1 sm:gap-2 items-center opacity-0 pointer-events-none select-none"
          aria-hidden="true"
        >
          {['Today', 'This Week', 'This Month'].map((filter) => (
            <span
              key={filter}
              className="px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md"
            >
              {filter}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col sm:flex-row items-center justify-center w-full max-w-2xl gap-4 sm:gap-0">
          {/* Donut Chart */}
          <div className="relative flex-shrink-0" style={{ width: '180px', height: '180px' }}>
            <svg width="180" height="180" viewBox={`0 0 ${size} ${size}`}>
              {/* Background circle */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="#F3F4F6"
                strokeWidth={strokeWidth}
              />

              {/* Segments */}
              {segments.map((segment, index) => (
                <path
                  key={index}
                  d={getSegmentPath(segment.startPercent, segment.endPercent)}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  className="transition-all duration-300 hover:opacity-80 cursor-pointer hover:stroke-width-32"
                  style={{
                    transform: 'rotate(-90deg)',
                    transformOrigin: `${center}px ${center}px`
                  }}
                >
                  <title>
                    {segment.label}: {segment.value} ({(segment.percent * 100).toFixed(1)}%)
                  </title>
                </path>
              ))}

              {/* Center text */}
              <text
                x={center}
                y={center - 8}
                textAnchor="middle"
                className="text-xl sm:text-2xl font-bold fill-gray-900"
              >
                {total.toLocaleString()}
              </text>
              <text
                x={center}
                y={center + 12}
                textAnchor="middle"
                className="text-[10px] sm:text-xs fill-gray-500"
              >
                Total Leads
              </text>
            </svg>
          </div>

          {/* Legend */}
          <div className="flex-1 sm:ml-6 space-y-1.5 sm:space-y-2 w-full sm:w-auto max-w-xs">
            {segments.map((segment, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-1.5 sm:p-2 rounded hover:bg-gray-50 transition-colors cursor-pointer group"
              >
                <div className="flex items-center">
                  <div
                    className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full mr-1.5 sm:mr-2 transition-transform group-hover:scale-125"
                    style={{ backgroundColor: segment.color }}
                  />
                  <span className="text-xs sm:text-sm text-gray-700">{segment.label}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs sm:text-sm font-medium text-gray-900">{segment.value}</span>
                  <span className="text-[10px] sm:text-xs text-gray-500 ml-1">
                    ({(segment.percent * 100).toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadStatusChart;
