/**
 * ParticipantAvatars component - Displays multiple participant avatars for group chats
 */
'use client';

import React from 'react';

const ParticipantAvatars = ({ participants, maxVisible = 4, size = 'md' }) => {
  if (!participants || participants.length === 0) return null;

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base'
  };

  const visibleParticipants = participants.slice(0, maxVisible);

  return (
    <div className="flex -space-x-2">
      {visibleParticipants.map((participant, index) => (
        <div
          key={participant.user_id}
          className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold border-2 border-white relative z-0`}
          style={{ zIndex: visibleParticipants.length - index }}
          title={participant.full_name || participant.username}
        >
          {getInitials(participant.full_name || participant.username)}
          {participant.is_online && (
            <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border-2 border-white rounded-full"></div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ParticipantAvatars;
