/**
 * TypingIndicator component - Shows when someone is typing
 */
'use client';

import React from 'react';

const TypingIndicator = ({ users = [] }) => {
  if (!users || users.length === 0) return null;

  const getTypingText = () => {
    if (users.length === 1) {
      return `${users[0].name} is typing...`;
    }
    if (users.length === 2) {
      return `${users[0].name} and ${users[1].name} are typing...`;
    }
    return `${users.length} people are typing...`;
  };

  return (
    <div className="flex items-center space-x-2 px-4 py-2 bg-gray-50 border-t border-gray-200">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
      </div>
      <span className="text-xs text-gray-500">{getTypingText()}</span>
    </div>
  );
};

export default TypingIndicator;
