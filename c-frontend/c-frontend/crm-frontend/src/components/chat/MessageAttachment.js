/**
 * MessageAttachment component - Displays file attachments in messages
 */
'use client';

import React, { useState } from 'react';

const MessageAttachment = ({ attachment, type, size = 'md' }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const getFileIcon = (fileType) => {
    const type = fileType?.toLowerCase() || '';

    if (type.includes('image')) {
      return (
        <svg className="w-3 h-3 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }

    if (type.includes('pdf')) {
      return (
        <svg className="w-3 h-3 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }

    if (type.includes('word') || type.includes('document')) {
      return (
        <svg className="w-3 h-3 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }

    return (
      <svg className="w-3 h-3 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 0L21 9m0 0l-6.586 6.586a2 2 0 002.828 0L21 9m0 0l-6.586 6.586a2 2 0 002.828 0L21 9M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  };

  const sizeClasses = {
    sm: 'max-w-xs',
    md: 'max-w-md',
    lg: 'max-w-lg'
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setError(true);
    setIsLoading(false);
  };

  if (!attachment) return null;

  return (
    <div className={`${sizeClasses[size]}`}>
      <a
        href={attachment}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center space-x-1 p-0.5 md:space-x-1.5 md:p-1 bg-gray-50 hover:bg-gray-100 rounded transition-colors"
      >
        <div className="text-indigo-600 flex-shrink-0">
          {getFileIcon(type)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[8px] md:text-[10px] font-medium text-gray-900 truncate">
            {attachment.split('/').pop()}
          </p>
        </div>
        <svg className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l4-4m4 4V5a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </a>
    </div>
  );
};

export default MessageAttachment;
