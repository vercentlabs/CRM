/**
 * Refined MetricCard component for displaying dashboard metrics
 * Enterprise design with improved visual hierarchy and alignment
 */
'use client';

import React from 'react';

const MetricCard = ({
  title,
  value,
  subtitle,
  icon,
  color = 'indigo',
  trend,
  trendValue,
  highlight = false,
  isGoldRate = false
}) => {
  // Enterprise color classes mapping
  const colorClasses = {
    indigo: {
      bg: 'bg-indigo-100',
      text: 'text-indigo-700',
      border: 'border-indigo-100'
    },
    blue: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      border: 'border-blue-100'
    },
    green: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      border: 'border-green-100'
    },
    yellow: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-700',
      border: 'border-yellow-100'
    },
    red: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      border: 'border-red-100'
    },
    purple: {
      bg: 'bg-purple-100',
      text: 'text-purple-700',
      border: 'border-purple-100'
    }
  };

  // Special handling for overdue follow-ups
  const getOverdueColors = () => {
    if (value > 0) {
      return {
        bg: 'bg-red-100',
        text: 'text-red-700',
        border: 'border-red-100'
      };
    } else {
      // Tone down red when value is 0
      return {
        bg: 'bg-red-50',
        text: 'text-red-500',
        border: 'border-red-50'
      };
    }
  };

  // Special handling for gold rates
  const getGoldRateColors = () => {
    return {
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      border: 'border-yellow-50'
    };
  };

  // Select appropriate colors based on card type
  const getColors = () => {
    if (highlight) {
      return getOverdueColors();
    }
    if (isGoldRate) {
      return getGoldRateColors();
    }
    return colorClasses[color] || colorClasses.indigo;
  };

  const colors = getColors();

  // Trend indicator
  const renderTrend = () => {
    if (!trend) return null;

    const trendColors = {
      up: 'text-green-600',
      down: 'text-red-600',
      neutral: 'text-gray-500'
    };

    const trendIcons = {
      up: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
      down: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
        </svg>
      ),
      neutral: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
        </svg>
      )
    };

    return (
      <div className={`flex items-center ${trendColors[trend] || trendColors.neutral}`}>
        {trendIcons[trend] || trendIcons.neutral}
        <span className="ml-1 text-sm font-medium">{trendValue}</span>
      </div>
    );
  };

  return (
    <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-100 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 h-full flex flex-col justify-between">
      {/* Header Zone */}
      <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2">
        <div className="flex items-center">
          {icon && (
            <div className={`shrink-0 ${colors.bg} rounded-md p-1.5 sm:p-2`}>
              <div className="h-4 w-4 sm:h-5 sm:w-5 text-white flex items-center justify-center">
                {icon}
              </div>
            </div>
          )}
          <h3 className="text-xs sm:text-sm font-medium text-gray-500 ml-2 sm:ml-3 truncate">
            {title}
          </h3>
        </div>
      </div>

      {/* Metric Zone */}
      <div className="px-3 sm:px-5 py-1.5 sm:py-2">
        <div className="flex items-baseline">
          <div className={`text-xl sm:text-2xl md:text-3xl font-semibold ${isGoldRate ? 'text-gray-800' : colors.text}`}>
            {value}
          </div>
          {trend && (
            <span className="ml-2 sm:ml-3">
              {renderTrend()}
            </span>
          )}
        </div>
      </div>

      {/* Meta Zone */}
      <div className="px-3 sm:px-5 pb-3 sm:pb-4 pt-1">
        {subtitle && (
          <p className="text-xs sm:text-sm text-gray-500 line-clamp-2">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};

export default MetricCard;
