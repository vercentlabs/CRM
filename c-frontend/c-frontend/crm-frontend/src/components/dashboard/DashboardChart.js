/**
 * DashboardChart component for displaying data visualizations
 * Supports different chart types: funnel, donut, line
 */
'use client';

import React, { useState, useEffect, useRef } from 'react';

// Chart type icons
const FunnelIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L12 15.414V21a1 1 0 01-.293.707l-2 2A1 1 0 018 21v-5.586L3.293 6.707A1 1 0 013 6V4z" />
  </svg>
);

const DonutIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
  </svg>
);

const LineIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16" />
  </svg>
);

const DashboardChart = ({ title, type, data }) => {
  const canvasRef = useRef(null);
  const [chartInstance, setChartInstance] = useState(null);

  // Simple chart rendering logic (without external libraries)
  useEffect(() => {
    if (!canvasRef.current || !data || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Render different chart types
    if (type === 'funnel') {
      renderFunnelChart(ctx, canvas.width, canvas.height, data);
    } else if (type === 'donut') {
      renderDonutChart(ctx, canvas.width, canvas.height, data);
    } else if (type === 'line') {
      renderLineChart(ctx, canvas.width, canvas.height, data);
    }
  }, [data, type]);

  // Render funnel chart
  const renderFunnelChart = (ctx, width, height, data) => {
    // Colors for different segments
    const colors = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'];

    // Calculate total for percentages
    const total = data.reduce((sum, item) => sum + item.value, 0);

    // Calculate dimensions for each segment
    const segmentHeight = height / (data.length * 1.5);
    const maxWidth = width * 0.8;
    const minWidth = width * 0.4;

    // Draw funnel segments
    let y = 20;
    data.forEach((item, index) => {
      const percentage = total > 0 ? item.value / total : 0;
      const segmentWidth = minWidth + (maxWidth - minWidth) * (1 - percentage);

      // Draw segment
      ctx.fillStyle = colors[index % colors.length];
      ctx.beginPath();
      ctx.moveTo((width - segmentWidth) / 2, y);
      ctx.lineTo((width + segmentWidth) / 2, y);
      ctx.lineTo((width + maxWidth) / 2, y + segmentHeight);
      ctx.lineTo((width - maxWidth) / 2, y + segmentHeight);
      ctx.closePath();
      ctx.fill();

      // Draw label
      ctx.fillStyle = '#1f2937';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.label, width / 2, y + segmentHeight / 2);
      ctx.fillText(`${item.value} (${(percentage * 100).toFixed(1)}%)`, width / 2, y + segmentHeight / 2 + 15);

      y += segmentHeight * 1.2;
    });
  };

  // Render donut chart
  const renderDonutChart = (ctx, width, height, data) => {
    // Colors for different segments
    const colors = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'];

    // Calculate total for percentages
    const total = data.reduce((sum, item) => sum + item.value, 0);

    // Chart dimensions
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;
    const innerRadius = radius * 0.6;

    // Draw donut segments
    let currentAngle = -Math.PI / 2; // Start at top
    data.forEach((item, index) => {
      const percentage = total > 0 ? item.value / total : 0;
      const segmentAngle = percentage * Math.PI * 2;

      // Draw segment
      ctx.fillStyle = colors[index % colors.length];
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + segmentAngle);
      ctx.arc(centerX, centerY, innerRadius, currentAngle + segmentAngle, currentAngle, true);
      ctx.closePath();
      ctx.fill();

      // Draw label
      const labelAngle = currentAngle + segmentAngle / 2;
      const labelX = centerX + Math.cos(labelAngle) * (radius * 1.3);
      const labelY = centerY + Math.sin(labelAngle) * (radius * 1.3);

      ctx.fillStyle = '#1f2937';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = labelX > centerX ? 'left' : 'right';
      ctx.fillText(item.label, labelX, labelY);
      ctx.fillText(`${item.value} (${(percentage * 100).toFixed(1)}%)`, labelX, labelY + 15);

      currentAngle += segmentAngle;
    });
  };

  // Render line chart
  const renderLineChart = (ctx, width, height, data) => {
    // Chart dimensions
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Find min and max values
    const values = data.map(item => item.value);
    const maxValue = Math.max(...values, 1);
    const minValue = 0;

    // Draw axes
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw grid lines
    ctx.strokeStyle = '#f3f4f6';
    for (let i = 0; i <= 5; i++) {
      const y = padding + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();

      // Y-axis labels
      const value = maxValue - (maxValue / 5) * i;
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(value.toFixed(0), padding - 10, y + 4);
    }

    // Draw data points and lines
    const pointSpacing = chartWidth / (data.length - 1 || 1);

    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((item, index) => {
      const x = padding + pointSpacing * index;
      const y = height - padding - ((item.value - minValue) / (maxValue - minValue)) * chartHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw data points
    data.forEach((item, index) => {
      const x = padding + pointSpacing * index;
      const y = height - padding - ((item.value - minValue) / (maxValue - minValue)) * chartHeight;

      // Draw point
      ctx.fillStyle = '#4f46e5';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw label
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.label, x, height - padding + 20);
    });
  };

  // Get icon based on chart type
  const getChartIcon = () => {
    if (type === 'funnel') return <FunnelIcon />;
    if (type === 'donut') return <DonutIcon />;
    if (type === 'line') return <LineIcon />;
    return null;
  };

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="px-3 sm:px-4 py-3 sm:py-5 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-medium text-gray-900">{title}</h3>
          <div className="flex items-center text-gray-400">
            {getChartIcon()}
          </div>
        </div>
      </div>
      <div className="p-2 sm:p-4 h-48 sm:h-64">
        {data && data.length > 0 ? (
          <canvas ref={canvasRef} className="w-full h-full"></canvas>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 mb-3 sm:mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-xs sm:text-sm">No data available</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardChart;
