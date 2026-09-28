
'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import EventSidebar from '@/components/calendar/EventSidebar';
import CalendarViewNew from '@/components/calendar/CalendarView';
import CalendarPageHeader from '@/components/calendar/CalendarPageHeader';

const CalendarPage = () => {
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewEventModal, setShowNewEventModal] = useState(false);
  const { token, user } = useAuth();

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await api.get('/calendar');

        // API instance handles HTTP errors through interceptors

        const data = response.data;
        // Filter events based on user role
        const allEvents = data.events || [];
        const filteredEvents = user?.roleId === ROLE_SALES
          ? allEvents.filter(event => event.userId === user.id)
          : allEvents;

        setEvents(filteredEvents);
      } catch (err) {
        console.error('Failed to fetch calendar events:', err);
        if (!error) {
          setError('Failed to load calendar events. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchEvents();
    }
  }, [token, error, user?.id, user?.roleId]);

  const handleRefresh = () => {
    setError(null);
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const response = await api.get('/calendar');
        const data = response.data;
        const allEvents = data.events || [];
        const filteredEvents = user?.roleId === ROLE_SALES
          ? allEvents.filter(event => event.userId === user.id)
          : allEvents;
        setEvents(filteredEvents);
      } catch (err) {
        console.error('Failed to fetch calendar events:', err);
        setError('Failed to load calendar events. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  };

  return (
    <ProtectedRoute allowedRoles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <CalendarPageHeader
            count={events.length}
            onRefresh={handleRefresh}
            onAddEvent={() => setShowNewEventModal(true)}
          />

          {/* Main Content Area with Sidebar and Calendar */}
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            {/* Left Sidebar - Event Categories and Upcoming Events */}
            <div className="w-full lg:w-72 flex-shrink-0 order-2 lg:order-1">
              <EventSidebar events={events} />
            </div>

            {/* Right Main Area - Calendar View */}
            <div className="flex-1 order-1 lg:order-2">
              {loading ? (
                <div className="flex justify-center items-center py-12 bg-white rounded-lg shadow-sm">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    <p className="mt-2 text-sm text-gray-500">Loading calendar...</p>
                  </div>
                </div>
              ) : error ? (
                <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                  <div className="text-red-500 text-lg mb-2">Error</div>
                  <p className="text-gray-500">{error}</p>
                  <button
                    onClick={handleRefresh}
                    className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <CalendarViewNew events={events} />
              )}
            </div>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default CalendarPage;
