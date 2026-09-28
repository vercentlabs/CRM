/**
 * UserInfo component - Displays user information with role badge
 */
'use client';

import React from 'react';
import { ROLE_NAMES, ROLE_COLORS } from '@/lib/constants';

const UserInfo = ({ user, showRole = true, showOnline = false, size = 'md' }) => {
  if (!user) return null;

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const getRoleColor = (roleId) => {
    return ROLE_COLORS[roleId] || 'bg-gray-100 text-gray-800';
  };

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base'
  };

  return (
    <div className="flex items-center space-x-3">
      <div className="relative">
        <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold`}>
          {getInitials(user.full_name || user.username)}
        </div>
        {showOnline && (
          <div className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white rounded-full ${
            user.is_online ? 'bg-green-500' : 'bg-gray-400'
          }`}></div>
        )}
      </div>
      <div className="flex flex-col">
        <span className="font-medium text-gray-900">
          {user.full_name || user.username || 'Unknown User'}
        </span>
        {showRole && user.role_id && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRoleColor(user.role_id)}`}>
            {ROLE_NAMES[user.role_id] || 'Unknown Role'}
          </span>
        )}
      </div>
    </div>
  );
};

export default UserInfo;
