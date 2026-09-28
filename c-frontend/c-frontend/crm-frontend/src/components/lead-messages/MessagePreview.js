import React, { useState } from 'react';

/**
 * MessagePreview component - Displays truncated message content with tooltip
 * @param {Object} props - Component props
 * @param {string} props.content - Message content
 * @param {string} props.subject - Message subject (optional)
 * @param {number} props.maxLength - Maximum length before truncation (default: 100)
 */
const MessagePreview = ({ content, subject, maxLength = 100 }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // Combine subject and content for preview
  const fullText = subject ? `${subject}: ${content}` : content;
  const isTruncated = fullText.length > maxLength;
  const displayText = isTruncated ? `${fullText.substring(0, maxLength)}...` : fullText;

  return (
    <div className="relative">
      <div 
        className="max-w-xs truncate text-sm text-gray-500 cursor-pointer"
        onMouseEnter={() => isTruncated && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {displayText}
      </div>

      {showTooltip && isTruncated && (
        <div className="absolute z-10 w-64 p-2 mt-1 text-sm text-white bg-gray-900 rounded-md shadow-lg">
          <div className="max-h-40 overflow-y-auto">
            {subject && (
              <div className="font-medium mb-1">{subject}</div>
            )}
            <div>{content}</div>
          </div>
          <div className="absolute w-3 h-3 transform rotate-45 bg-gray-900 -top-1 left-6"></div>
        </div>
      )}
    </div>
  );
};

export default MessagePreview;
