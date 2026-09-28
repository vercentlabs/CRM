import React, { useState } from 'react';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import { useAuth } from '@/context/AuthContext';

/**
 * InitiateCallButton component - Button to start a call with a lead
 * @param {Object} props - Component props
 * @param {string} props.leadId - ID of the lead to call
 * @param {Function} props.onCallStarted - Function to call when call is successfully initiated
 * @param {boolean} props.disabled - Whether button should be disabled
 * @param {string} props.className - Additional CSS classes for the button
 * @param {boolean} props.iconOnly - Whether to show only the icon
 * @param {React.ReactNode} props.children - Child elements to render
 */
const InitiateCallButton = ({ leadId, onCallStarted, disabled = false, className = '', iconOnly = false, children }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Handle initiating a call
  const handleInitiateCall = async () => {
    if (!leadId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await api.post('/calls/initiate', {
        leadId: leadId
      });

      const data = extractData(response);
      // Call the callback with the returned call ID
      if (onCallStarted && data.callId) {
        onCallStarted(data.callId);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to initiate call');
      console.error('Error initiating call:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleInitiateCall}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center border border-transparent font-medium shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 ${iconOnly ? 'bg-green-600 hover:bg-green-700 rounded-full p-2' : 'bg-green-600 hover:bg-green-700 rounded-md px-4 py-2'} ${className}`}
      >
        {loading ? (
          iconOnly ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Initiating...
            </>
          )
        ) : (
          children || (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className={iconOnly ? "h-5 w-5" : "-ml-1 mr-2 h-4 w-4"} viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              {!iconOnly && <span>Call</span>}
            </>
          )
        )}
      </button>

      {error && (
        <div className="mt-2 text-xs text-red-600">
          {error}
        </div>
      )}
    </div>
  );
};

export default InitiateCallButton;
