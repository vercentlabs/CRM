/**
 * MessageReactions component - Displays and manages message reactions
 */
'use client';

import React, { useState } from 'react';

const MessageReactions = ({ messageId, reactions = [], onAddReaction, onRemoveReaction }) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏'];

  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = {
        emoji: reaction.emoji,
        users: [],
        count: 0
      };
    }
    acc[reaction.emoji].users.push(reaction.user);
    acc[reaction.emoji].count++;
    return acc;
  }, {});

  const handleAddReaction = (emoji) => {
    if (onAddReaction) {
      onAddReaction(messageId, emoji);
    }
    setShowEmojiPicker(false);
  };

  const handleRemoveReaction = (emoji) => {
    if (onRemoveReaction) {
      onRemoveReaction(messageId, emoji);
    }
  };

  return (
    <div className="relative mt-2">
      {Object.values(groupedReactions).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.values(groupedReactions).map((reaction) => (
            <button
              key={reaction.emoji}
              onClick={() => handleRemoveReaction(reaction.emoji)}
              className="flex items-center space-x-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              title={reaction.users.map(u => u.name).join(', ')}
            >
              <span className="text-sm">{reaction.emoji}</span>
              <span className="text-xs text-gray-600">{reaction.count}</span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
        className="mt-2 text-gray-400 hover:text-gray-600 transition-colors"
        title="Add reaction"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {showEmojiPicker && (
        <div className="absolute bottom-full left-0 mb-2 p-2 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="grid grid-cols-4 gap-1">
            {commonEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleAddReaction(emoji)}
                className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded transition-colors"
              >
                <span className="text-xl">{emoji}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageReactions;
