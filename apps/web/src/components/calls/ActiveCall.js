import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import { useAuth } from '@/context/AuthContext';

/**
 * ActiveCall component - Display and manage an active call
 * @param {Object} props - Component props
 * @param {string} props.callId - ID of the active call
 * @param {Function} props.onCallEnded - Function to call when call is ended
 */
const ActiveCall = ({ callId, onCallEnded }) => {
  const { token } = useAuth();
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [duration, setDuration] = useState(0);
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [endingCall, setEndingCall] = useState(false);

  // Fetch call details
  useEffect(() => {
    const fetchCallDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await api.get(`/calls/${callId}`);
        const data = extractData(response);
        setCall(data.call);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch call details');
        console.error('Error fetching call details:', err);
      } finally {
        setLoading(false);
      }
    };

    if (callId) {
      fetchCallDetails();
    }
  }, [callId, token]);

  // Update duration every second
  useEffect(() => {
    if (!call || call.call_status !== 'Scheduled') return;

    const startTime = new Date(call.startTime);
    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now - startTime) / 1000);
      setDuration(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [call]);

  // Format duration as MM:SS
  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  // Handle ending the call
  const handleEndCall = async () => {
    if (!callId) return;

    try {
      setEndingCall(true);
      setError(null);

      // Calculate duration in seconds
      const now = new Date();
      const startTime = new Date(call.startTime);
      const durationSeconds = Math.floor((now - startTime) / 1000);

      const response = await api.put(`/calls/${callId}/end`, {
        end_time: now.toISOString(),
        duration_seconds: durationSeconds,
        outcome,
        notes
      });
      extractData(response); // Just to validate the response

      // Call callback
      if (onCallEnded) {
        onCallEnded();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to end call');
      console.error('Error ending call:', err);
    } finally {
      setEndingCall(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-xl p-4 w-80 border border-gray-200">
        <div className="flex justify-center items-center py-2">
          <div className="spinner-border animate-spin inline-block w-6 h-6 border-2 rounded-full text-green-600" role="status"></div>
          <span className="ml-2 text-sm text-gray-600">Loading call...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-xl p-4 w-80 border border-gray-200">
        <div className="text-red-500 text-sm mb-2">Error</div>
        <p className="text-gray-600 text-sm mb-3">{error}</p>
        <button
          onClick={() => onCallEnded && onCallEnded()}
          className="w-full px-3 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
        >
          Close
        </button>
      </div>
    );
  }

  if (!call) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-xl p-4 w-80 border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium text-gray-900">Active Call</h3>
        <span className="flex items-center text-green-600">
          <span className="animate-pulse h-2 w-2 bg-green-600 rounded-full mr-2"></span>
          {formatDuration(duration)}
        </span>
      </div>

      <div className="mb-4">
        <div className="text-sm font-medium text-gray-900">
          {call.lead?.name || 'Unknown Lead'}
        </div>
        <div className="text-sm text-gray-500">
          {call.lead?.phone || 'No phone number'}
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="outcome" className="block text-sm font-medium text-gray-700 mb-1">
          Call Outcome
        </label>
        <select
          id="outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        >
          <option value="">Select outcome...</option>
          <option value="Connected">Connected</option>
          <option value="No Answer">No Answer</option>
          <option value="Busy">Busy</option>
          <option value="Left Voicemail">Left Voicemail</option>
        </select>
      </div>

      <div className="mb-4">
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          placeholder="Add call notes..."
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleEndCall}
          disabled={endingCall}
          className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
        >
          {endingCall ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Ending...
            </>
          ) : (
            'End Call'
          )}
        </button>
      </div>
    </div>
  );
};

export default ActiveCall;
