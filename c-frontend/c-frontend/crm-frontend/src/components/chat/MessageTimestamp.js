/**
 * MessageTimestamp component - Displays message timestamp with full date on hover
 */
'use client';

import React, { useState } from 'react';

const MessageTimestamp = ({ timestamp, showFullDate = false }) => {
  const [isHovered, setIsHovered] = useState(false);

  const formatFullDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatShortDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <span
      className="text-xs opacity-70 cursor-help"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={formatFullDate(timestamp)}
    >
      {isHovered || showFullDate ? formatFullDate(timestamp) : formatShortDate(timestamp)}
    </span>
  );
};

export default MessageTimestamp;
