
import React from 'react';

/**
 * NoteSkeleton component - Loading skeleton for note cards
 * @param {Object} props - Component props
 * @param {number} props.count - Number of skeleton cards to display
 */
const NoteSkeleton = ({ count = 3 }) => {
  const skeletons = Array.from({ length: count }, (_, i) => i);

  return (
    <div className="grid gap-2 sm:gap-4">
      {skeletons.map((index) => (
        <div
          key={index}
          className="relative p-2 sm:p-4 rounded-lg border-2 bg-gray-50 border-gray-200 animate-pulse"
        >
          {/* Title skeleton */}
          <div className="h-5 sm:h-6 bg-gray-200 rounded mb-2 sm:mb-3 w-3/4"></div>

          {/* Content skeleton */}
          <div className="space-y-1.5 sm:space-y-2 mb-2 sm:mb-3">
            <div className="h-3.5 sm:h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-3.5 sm:h-4 bg-gray-200 rounded w-5/6"></div>
          </div>

          {/* Tags skeleton */}
          <div className="flex gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <div className="h-5 sm:h-6 bg-gray-200 rounded w-14 sm:w-16"></div>
            <div className="h-5 sm:h-6 bg-gray-200 rounded w-18 sm:w-20"></div>
          </div>

          {/* Footer skeleton */}
          <div className="flex items-center justify-between">
            <div className="h-3.5 sm:h-4 bg-gray-200 rounded w-18 sm:w-20"></div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-gray-200"></div>
              <div className="h-3.5 sm:h-4 bg-gray-200 rounded w-14 sm:w-16"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NoteSkeleton;
