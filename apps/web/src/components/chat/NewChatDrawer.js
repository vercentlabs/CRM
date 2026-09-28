
import React, { useState, useEffect } from 'react';
import './NewChatDrawer.css';
import api from '@/lib/api';
import { ROLE_NAMES, ROLE_COLORS } from '@/lib/constants';

/**
 * NewChatDrawer component - Drawer for creating a new chat conversation
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the drawer is open
 * @param {Function} props.onClose - Function to call when drawer is closed
 * @param {Function} props.onSuccess - Function to call when chat is created successfully
 */
const NewChatDrawer = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [existingConversations, setExistingConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Handle ESC key press and prevent body scroll
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    // Add ESC key listener
    window.addEventListener('keydown', handleEsc);

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  // Fetch users when drawer opens
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    try {
      const [usersResponse, convResponse] = await Promise.all([
        api.get('/users'),
        api.get('/api/chat/conversations')
      ]);
      setUsers(usersResponse.data.users || []);
      setExistingConversations(convResponse.data.conversations || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load data');
    }
  };

  const handleUserToggle = (userId) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  // Check if a direct chat already exists with the selected user
  const checkExistingDirectChat = (userId) => {
    const existingChat = existingConversations.find(conv => {
      if (conv.is_group) {
        return false;
      }
      const hasUser = conv.participants?.some(p => p.user_id === userId);
      return hasUser;
    });
    return existingChat;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedUsers.length === 0) {
      setError('Please select at least one participant');
      return;
    }

    // Check for existing direct chat
    if (!isGroup && selectedUsers.length === 1) {
      const existingChat = checkExistingDirectChat(selectedUsers[0]);
      if (existingChat) {
        setError(`You already have a conversation with ${existingChat.name}. Please use the existing conversation.`);
        return;
      }
    }

    // Auto-generate name for direct chats (1 participant)
    let conversationName = name.trim();
    if (!isGroup && selectedUsers.length === 1) {
      const participant = users.find(u => u.id === selectedUsers[0]);
      conversationName = participant?.full_name || participant?.username || 'Unknown';
    } else if (isGroup && !conversationName) {
      setError('Please enter a conversation name for group chat');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.post('/api/chat/conversations', {
        name: conversationName,
        isGroup,
        participantIds: selectedUsers
      });

      // Reset form
      setName('');
      setIsGroup(false);
      setSelectedUsers([]);

      // Close drawer and call success callback
      onClose();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
      console.error('Error response:', err.response?.data);
      console.error('Error status:', err.response?.status);

      // If backend returned existing conversation info, show error and close drawer
      if (err.response?.data?.existingConversation) {
        const existingConv = err.response.data.existingConversation;
        setError(`A conversation already exists with this user. Please use the existing conversation.`);
        // Close drawer after a short delay to show the error
        setTimeout(() => {
          onClose();
          if (onSuccess) {
            onSuccess();
          }
        }, 2000);
        return;
      }

      setError(err.response?.data?.message || 'Failed to create conversation');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-40 animate-fade-in" onClick={onClose}></div>

      {/* Right-side slide-in modal */}
      <div className="fixed top-0 right-0 h-screen w-[520px] bg-white z-50 shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header - Sticky */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {isGroup ? 'New Group Chat' : 'New Direct Message'}
            </h2>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-500 focus:outline-none transition-colors"
              onClick={onClose}
            >
              <span className="sr-only">Close panel</span>
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Chat Information Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Chat Information</h3>

              {/* Error Message */}
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Group Chat Toggle */}
              <div className="mb-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={isGroup}
                    onChange={(e) => {
                      setIsGroup(e.target.checked);
                      // Clear name when switching to direct chat
                      if (!e.target.checked) {
                        setName('');
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Group Chat</span>
                </label>
              </div>

              {/* Conversation Name - Only for Group Chats */}
              {isGroup && (
                <div className="mb-4">
                  <label htmlFor="name" className="block text-sm font-medium" style={{ color: 'black' }}>
                    Conversation Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-2 block w-full bg-blue-50 border border-blue-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm placeholder-gray-400"
                    placeholder="Enter group name"
                  />
                </div>
              )}

              {/* Participants */}
              <div className="mb-4">
                <label className="block text-sm font-medium" style={{ color: 'black' }}>
                  Participants
                </label>
                <div className="max-h-64 overflow-y-auto border border-gray-300 rounded-lg p-3">
                  {users.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No users available</p>
                  ) : (
                    users.map(user => {
                      const hasExistingChat = checkExistingDirectChat(user.id);
                      const isDisabled = !isGroup && hasExistingChat;

                      return (
                        <label
                          key={user.id}
                          className={`flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer ${
                            isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(user.id)}
                            onChange={() => !isDisabled && handleUserToggle(user.id)}
                            disabled={isDisabled}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <div className="ml-3 flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-700">
                                {user.full_name || user.username}
                              </span>
                              {user.role_id && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  ROLE_COLORS[user.role_id] || 'bg-gray-100 text-gray-800'
                                }`}>
                                  {ROLE_NAMES[user.role_id] || 'Unknown'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 mt-1">
                              {hasExistingChat && (
                                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                  Chat exists
                                </span>
                              )}
                              <span className={`text-xs ${
                                user.is_online ? 'text-green-600' : 'text-gray-400'
                              }`}>
                                {user.is_online ? 'Online' : 'Offline'}
                              </span>
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer Actions - Sticky */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 z-10">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </>
              ) : (
                'Create Conversation'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default NewChatDrawer;
