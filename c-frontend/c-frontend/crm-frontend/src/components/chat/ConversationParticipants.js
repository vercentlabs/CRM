/**
 * ConversationParticipants component - Displays all participants in a conversation
 */
'use client';

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { ROLE_NAMES, ROLE_COLORS } from '@/lib/constants';
import UserInfo from './UserInfo';
import './ConversationParticipantsDrawer.css';

const normalizeOnline = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 't' || normalized === '1' || normalized === 'yes';
  }
  return false;
};

const ConversationParticipants = ({ conversationId, isOpen, onClose }) => {
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !conversationId) return;

    const fetchParticipants = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/api/chat/conversations/${conversationId}/participants`);
        const normalizedParticipants = (response.data.participants || []).map((participant) => ({
          ...participant,
          is_online: normalizeOnline(participant.is_online)
        }));
        setParticipants(normalizedParticipants);
      } catch (err) {
        setError('Failed to load participants');
      } finally {
        setLoading(false);
      }
    };

    fetchParticipants();
  }, [isOpen, conversationId]);

  // Handle ESC key press and prevent body scroll
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Prevent body scroll when drawer is open
    document.body.style.overflow = 'hidden';

    // Add ESC key listener
    window.addEventListener('keydown', handleEsc);

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

        <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Conversation Participants
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div>
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Participants List */}
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
              </div>
            ) : (
              <div className="space-y-3">
                {participants.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No participants found</p>
                ) : (
                  participants.map(participant => (
                    <div
                      key={participant.user_id}
                      className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <UserInfo
                        user={participant}
                        showRole={true}
                        showOnline={true}
                        size="md"
                      />
                      <div className="flex items-center space-x-2">
                        {participant.last_read_at && (
                          <span className="text-xs text-gray-500">
                            Last read: {new Date(participant.last_read_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationParticipants;
