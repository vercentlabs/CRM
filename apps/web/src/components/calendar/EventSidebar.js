 
'use client';

import React from 'react';

const EventSidebar = ({ events }) => {
  const eventCategories = [
    { name: 'Team Events', color: 'bg-indigo-500', bgColor: 'bg-indigo-50' },
    { name: 'Work', color: 'bg-purple-500', bgColor: 'bg-purple-50' },
    { name: 'External', color: 'bg-blue-500', bgColor: 'bg-blue-50' },
    { name: 'Projects', color: 'bg-teal-500', bgColor: 'bg-teal-50' },
    { name: 'Applications', color: 'bg-pink-500', bgColor: 'bg-pink-50' },
    { name: 'Design', color: 'bg-orange-500', bgColor: 'bg-orange-50' },
  ];

  // Get upcoming events (sorted by date, limit to 5)
  const upcomingEvents = [...events]
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
    .slice(0, 5);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Event Categories Card */}
      <div className="bg-white rounded-lg shadow-sm p-3 sm:p-5">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Event</h3>
        <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">
          Drag and drop your event or click in the calendar
        </p>
        <div className="space-y-2 sm:space-y-3">
          {eventCategories.map((category, index) => (
            <div
              key={index}
              className={`flex items-center px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full ${category.bgColor} cursor-pointer hover:opacity-80 transition-opacity`}
            >
              <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded ${category.color} mr-2 sm:mr-3`}></div>
              <span className="text-xs sm:text-sm font-medium text-gray-700">{category.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Events Card */}
      <div className="bg-white rounded-lg shadow-sm p-3 sm:p-5">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Upcoming Event</h3>
        <div className="space-y-3 sm:space-y-4">
          {upcomingEvents.length === 0 ? (
            <p className="text-xs sm:text-sm text-gray-500 text-center py-3 sm:py-4">No upcoming events</p>
          ) : (
            upcomingEvents.map((event, index) => {
              const categoryColor = event.priority === 'high' ? 'bg-indigo-500' :
                                   event.priority === 'medium' ? 'bg-purple-500' :
                                   'bg-blue-500';
              const categoryBgColor = event.priority === 'high' ? 'bg-indigo-50' :
                                     event.priority === 'medium' ? 'bg-purple-50' :
                                     'bg-blue-50';

              return (
                <div
                  key={index}
                  className={`flex items-start p-2 sm:p-3 rounded-lg ${categoryBgColor} border-l-4 ${categoryColor}`}
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                      {event.title}
                    </h4>
                    <div className="flex items-center mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-500">
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {formatDate(event.start_date)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default EventSidebar;
