 
'use client';

import React, { useState } from 'react';

const CalendarView = ({ events }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month'); // 'month', 'week', or 'day'

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const getEventsForDate = (date) => {
    return events.filter(event => {
      const eventDate = new Date(event.start_date);
      return eventDate.toDateString() === date.toDateString();
    });
  };

  const navigateMonth = (direction) => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setMonth(newDate.getMonth() + direction);
      return newDate;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getWeekDays = (date) => {
    const week = [];
    const curr = new Date(date);
    const first = curr.getDate() - curr.getDay();

    for (let i = 0; i < 7; i++) {
      const day = new Date(curr);
      day.setDate(first + i);
      week.push(day);
    }

    return week;
  };

  const navigateWeek = (direction) => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setDate(newDate.getDate() + (direction * 7));
      return newDate;
    });
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);
  const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekDays = getWeekDays(currentDate);

  // Get events from previous and next month for display
  const getDaysFromPrevMonth = () => {
    const prevMonthDate = new Date(year, month - 1, 0);
    const daysInPrevMonth = prevMonthDate.getDate();
    const days = [];
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push(daysInPrevMonth - i);
    }
    return days;
  };

  const getDaysFromNextMonth = () => {
    const totalCells = 42; // 6 rows x 7 columns
    const days = [];
    const filledCells = startingDayOfWeek + daysInMonth;
    const remainingCells = totalCells - filledCells;
    for (let i = 1; i <= remainingCells; i++) {
      days.push(i);
    }
    return days;
  };

  const navigateDay = (direction) => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setDate(newDate.getDate() + direction);
      return newDate;
    });
  };

  const renderDayView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    const isToday = new Date().toDateString() === currentDate.toDateString();

    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Day Header */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="text-center">
            <div className={`text-2xl font-bold ${isToday ? 'text-indigo-600' : 'text-gray-900'}`}>
              {currentDate.getDate()}
            </div>
            <div className={`text-sm font-medium mt-1 ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>
              {dayNames[currentDate.getDay()]}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </div>
            {isToday && (
              <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 mt-2">
                Today
              </div>
            )}
          </div>
        </div>

        {/* Day Grid */}
        <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
          {hours.map((hour) => {
            const hourEvents = events.filter(event => {
              const eventDate = new Date(event.start_date);
              return eventDate.toDateString() === currentDate.toDateString() &&
                     new Date(event.start_date).getHours() === hour;
            });

            return (
              <div key={hour} className="flex border-b border-gray-100 hover:bg-gray-50 transition-colors">
                {/* Time Column */}
                <div className="w-20 p-3 text-xs text-gray-500 text-right pr-4 border-r border-gray-200 bg-gray-50 flex-shrink-0">
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>

                {/* Events Column */}
                <div className="flex-1 p-2 min-h-[60px]">
                  {hourEvents.length > 0 ? (
                    <div className="space-y-2">
                      {hourEvents.map((event, eventIndex) => {
                        const categoryColor = event.priority === 'high' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                                             event.priority === 'medium' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                                             'bg-blue-100 text-blue-800 border-blue-200';
                        const eventDate = new Date(event.start_date);
                        const timeStr = eventDate.toLocaleTimeString('en-US', { 
                          hour: 'numeric', 
                          minute: '2-digit',
                          hour12: true 
                        });
                        return (
                          <div
                            key={eventIndex}
                            className={`p-3 rounded-lg border ${categoryColor}`}
                          >
                            <div className="font-medium text-sm">{event.title}</div>
                            <div className="text-xs mt-1 opacity-75">{timeStr}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-xs text-gray-400">No events</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekDays = getWeekDays(currentDate);
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Week Header */}
        <div className="grid grid-cols-8 border-b border-gray-200">
          <div className="p-3 bg-gray-50 border-r border-gray-200"></div>
          {weekDays.map((day, index) => {
            const isToday = new Date().toDateString() === day.toDateString();
            return (
              <div key={index} className={`p-3 text-center border-r border-gray-200 last:border-r-0 ${isToday ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                <div className={`text-xs font-medium ${isToday ? 'text-indigo-600' : 'text-gray-500'}`}>
                  {dayNames[day.getDay()]}
                </div>
                <div className={`text-lg font-semibold mt-1 ${isToday ? 'text-indigo-600' : 'text-gray-900'}`}>
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Week Grid */}
        <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-8 border-b border-gray-100">
              {/* Time Column */}
              <div className="p-2 text-xs text-gray-500 text-right pr-4 border-r border-gray-200 bg-gray-50">
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>

              {/* Day Columns */}
              {weekDays.map((day, dayIndex) => {
                const dayEvents = events.filter(event => {
                  const eventDate = new Date(event.start_date);
                  return eventDate.toDateString() === day.toDateString() &&
                         new Date(event.start_date).getHours() === hour;
                });

                return (
                  <div key={dayIndex} className="min-h-[60px] p-1 border-r border-gray-100 last:border-r-0 hover:bg-gray-50 transition-colors">
                    {dayEvents.map((event, eventIndex) => {
                      const categoryColor = event.priority === 'high' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                                           event.priority === 'medium' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                                           'bg-blue-100 text-blue-800 border-blue-200';
                      return (
                        <div
                          key={eventIndex}
                          className={`text-xs px-2 py-1 rounded mb-1 truncate border ${categoryColor}`}
                          title={event.title}
                        >
                          {event.title}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMonthView = () => {
    const days = [];
    const prevMonthDays = getDaysFromPrevMonth();
    const nextMonthDays = getDaysFromNextMonth();

    // Days from previous month (faded)
    prevMonthDays.forEach((day, index) => {
      days.push(
        <div key={`prev-${day}`} className="h-20 sm:h-32 border border-gray-100 bg-gray-50 p-1 sm:p-2 opacity-50">
          <div className="text-xs sm:text-sm font-medium text-gray-400">{day}</div>
        </div>
      );
    });

    // Days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayEvents = getEventsForDate(date);
      const isToday = new Date().toDateString() === date.toDateString();

      days.push(
        <div key={day} className={`h-20 sm:h-32 border border-gray-100 p-1 sm:p-2 hover:bg-gray-50 transition-colors ${isToday ? 'bg-indigo-50' : ''}`}>
          <div className={`text-xs sm:text-sm font-medium mb-1 ${isToday ? 'text-indigo-600' : 'text-gray-900'}`}>
            {day}
          </div>
          <div className="space-y-0.5 sm:space-y-1">
            {dayEvents.slice(0, 3).map((event, index) => {
              const categoryColor = event.priority === 'high' ? 'bg-red-100 text-red-800' :
                                   event.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                   'bg-green-100 text-green-800';
              return (
                <div
                  key={index}
                  className={`text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded truncate ${categoryColor}`}
                >
                  {event.title}
                </div>
              );
            })}
            {dayEvents.length > 3 && (
              <div className="text-[10px] sm:text-xs text-gray-500 px-1 sm:px-2 py-0.5 sm:py-1">
                +{dayEvents.length - 3} more
              </div>
            )}
          </div>
        </div>
      );
    }

    // Days from next month (faded)
    nextMonthDays.forEach((day, index) => {
      days.push(
        <div key={`next-${day}`} className="h-20 sm:h-32 border border-gray-100 bg-gray-50 p-1 sm:p-2 opacity-50">
          <div className="text-xs sm:text-sm font-medium text-gray-400">{day}</div>
        </div>
      );
    });

    return (
      <div className="grid grid-cols-7 gap-0 border border-gray-200 rounded-lg overflow-hidden bg-white">
        {dayNames.map(day => (
          <div key={day} className="bg-gray-50 px-1 sm:px-2 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700 border-b border-gray-200">
            {day}
          </div>
        ))}
        {days}
      </div>
    );
  };

  return (
    <div className="space-y-4 relative">
      {/* Calendar Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 bg-white rounded-lg shadow-sm p-2 sm:p-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              if (view === 'month') navigateMonth(-1);
              else if (view === 'week') navigateWeek(-1);
              else navigateDay(-1);
            }}
            className="p-1 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title={view === 'month' ? 'Previous month' : view === 'week' ? 'Previous week' : 'Previous day'}
          >
            <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goToToday}
            className="px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => {
              if (view === 'month') navigateMonth(1);
              else if (view === 'week') navigateWeek(1);
              else navigateDay(1);
            }}
            className="p-1 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title={view === 'month' ? 'Next month' : view === 'week' ? 'Next week' : 'Next day'}
          >
            <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <h2 className="text-xs sm:text-xl font-semibold text-gray-900 ml-1 sm:ml-2">
            {view === 'month' ? `${monthNames[month]} ${year}` : 
             `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
          </h2>
        </div>

        <div className="flex items-center space-x-1 sm:space-x-2">
          <button
            onClick={() => setView('month')}
            className={`px-2 sm:px-4 py-0.5 sm:py-2 text-[10px] sm:text-sm font-medium rounded-lg transition-colors ${
              view === 'month'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setView('week')}
            className={`px-2 sm:px-4 py-0.5 sm:py-2 text-[10px] sm:text-sm font-medium rounded-lg transition-colors ${
              view === 'week'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setView('day')}
            className={`px-2 sm:px-4 py-0.5 sm:py-2 text-[10px] sm:text-sm font-medium rounded-lg transition-colors ${
              view === 'day'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Day
          </button>
        </div>
      </div>

      {/* Calendar Content */}
      <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4">
        {view === 'month' && renderMonthView()}
        {view === 'week' && renderWeekView()}
        {view === 'day' && renderDayView()}
      </div>


    </div>
  );
};

export default CalendarView;
