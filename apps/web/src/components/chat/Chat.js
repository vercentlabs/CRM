/**
 * Chat component for internal team communication
 * Features professional team-style layout with smaller, more enterprise-grade design
 */
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { ROLE_NAMES, ROLE_COLORS } from '@/lib/constants';
import UserInfo from './UserInfo';
import MessageReceipts from './MessageReceipts';
import ParticipantAvatars from './ParticipantAvatars';
import FileUpload from './FileUpload';
import MessageAttachment from './MessageAttachment';

const normalizeOnline = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 't' || normalized === '1' || normalized === 'yes';
  }
  return false;
};

const normalizeParticipants = (participants = []) =>
  participants.map((participant) => ({
    ...participant,
    is_online: normalizeOnline(participant.is_online)
  }));

const Chat = ({ onShowParticipants }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [lastMessageId, setLastMessageId] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const messagesEndRef = useRef(null);
  const pollingIntervalRef = useRef(null);

  // Format timestamp to readable time
  const formatTime = useCallback((dateString) => {
    if (!dateString) return null;
    
    const date = new Date(dateString);
    // Check if date is invalid
    if (isNaN(date.getTime())) return null;
    
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
  }, []);

  // Transform API conversation data to component format
  const handleConversationClick = useCallback((conv) => {
    setActiveConversation(conv);
    setShowMobileChat(true);
  }, []);

  const transformConversation = useCallback((conv) => {
    // Ensure both IDs are numbers for comparison
    const lastMessageSenderId = parseInt(conv.last_message_sender_id);
    const currentUserId = parseInt(user.id);
    const isOwnLastMessage = lastMessageSenderId === currentUserId;
    const senderName = isOwnLastMessage
      ? 'You'
      : (conv.last_message_sender_name || conv.last_message_sender_username || 'Unknown');

    // Truncate sender name if it's too long
    const truncatedSenderName = senderName.length > 15 ? senderName.substring(0, 15) + '...' : senderName;

    // For one-to-one conversations, display the other participant's name
    // For group chats, display the conversation name
    const otherParticipant = conv.participants?.find(p => {
      const participantUserId = parseInt(p.user_id);
      const currentUserId = parseInt(user.id);
      return participantUserId !== currentUserId;
    });
    
    // Use conversation name for direct messages if:
    // 1. It's not a group AND (other participant exists OR conversation name is not the current user)
    const displayName = conv.is_group
      ? conv.name
      : (otherParticipant
          ? (otherParticipant.full_name || otherParticipant.username || 'Unknown')
          : `User ${conv.id}`); // Fallback to a generic name if other participant is not found

    return {
      id: conv.id,
      name: conv.name,
      displayName: displayName,
      isGroup: conv.is_group,
      participants: conv.participants || [],
      online: conv.is_group 
        ? conv.participants?.some(p => parseInt(p.user_id) !== parseInt(user.id) && normalizeOnline(p.is_online)) || false
        : normalizeOnline(otherParticipant?.is_online),
      lastMessage: conv.last_message || 'No messages yet',
      lastMessagePreview: conv.last_message?.length > 30 
        ? conv.last_message.substring(0, 30) + '...'
        : conv.last_message || 'No messages yet',
      lastMessageSender: truncatedSenderName,
      lastMessageSenderRoleId: conv.last_message_sender_role_id,
      isOwnLastMessage: isOwnLastMessage,
      time: conv.last_message_time ? formatTime(conv.last_message_time) : 'Just now',
      unread: conv.unread_count || 0
    };
  }, [user.id, formatTime]);

  // Transform API message data to component format
  const transformMessage = useCallback((msg) => {
    // Ensure sender information is correctly mapped
    // The backend returns sender_name, sender_username, and sender_role_id
    return {
      id: msg.id,
      senderId: parseInt(msg.sender_id),
      senderName: msg.sender_name || msg.sender_username || 'Unknown',
      senderUsername: msg.sender_username || 'Unknown',
      senderRoleId: parseInt(msg.sender_role_id),
      content: msg.content,
      timestamp: formatTime(msg.created_at),
      createdAt: msg.created_at, // Store original timestamp for date separators
      isRead: msg.is_read,
      attachmentUrl: msg.attachment_url,
      fileType: msg.file_type
    };
  }, [formatTime]);

  // Load conversations from API
  useEffect(() => {
    const fetchConversations = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get('/api/chat/conversations');
        const conversations = response.data.conversations || [];
        
        // Fetch participants for each conversation
        const conversationsWithParticipants = await Promise.all(
          conversations.map(async (conv) => {
            try {
              const participantsResponse = await api.get(`/api/chat/conversations/${conv.id}/participants`);
              return {
                ...conv,
                participants: normalizeParticipants(participantsResponse.data.participants || [])
              };
            } catch (err) {
              console.error(`Failed to fetch participants for conversation ${conv.id}:`, err);
              return {
                ...conv,
                participants: normalizeParticipants(conv.participants || [])
              };
            }
          })
        );
        
        const transformedConversations = conversationsWithParticipants.map(transformConversation);
        setConversations(transformedConversations);
        setLoading(false);
      } catch (err) {
        setError('Failed to load conversations');
        setLoading(false);
      }
    };

    fetchConversations();
  }, []);

  // Load messages for active conversation
  useEffect(() => {
    const fetchMessages = async () => {
      if (!activeConversation) return;
      try {
        const response = await api.get(`/api/chat/conversations/${activeConversation.id}/messages`);
        const transformedMessages = response.data.messages.map(transformMessage);
        setMessages(transformedMessages);

        // Mark messages as read
        await api.put(`/api/chat/conversations/${activeConversation.id}/read`);

        // Update unread count to 0 for this conversation
        setConversations(prev => prev.map(conv =>
          conv.id === activeConversation.id ? { ...conv, unread: 0 } : conv
        ));
      } catch (err) {
        setError('Failed to load messages');
      }
    };

    fetchMessages();
  }, [activeConversation]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update online status when component mounts
  useEffect(() => {
    const updateOnlineStatus = async () => {
      try {
        await api.put('/api/chat/online-status', { isOnline: true });
      } catch (err) {
        console.error('Error updating online status:', err);
      }
    };

    updateOnlineStatus();

    // Set offline when component unmounts
    return () => {
      api.put('/api/chat/online-status', { isOnline: false }).catch(err => {
        console.error('Error updating offline status:', err);
      });
    };
  }, []);

  // Poll for new messages and conversations
  useEffect(() => {
    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Set up polling interval (every 5 seconds)
    pollingIntervalRef.current = setInterval(async () => {
      try {
        // Fetch conversations to check for updates
        const convResponse = await api.get('/api/chat/conversations');
        const conversations = convResponse.data.conversations || [];
        
        // Fetch participants for each conversation
        const conversationsWithParticipants = await Promise.all(
          conversations.map(async (conv) => {
            try {
              const participantsResponse = await api.get(`/api/chat/conversations/${conv.id}/participants`);
              return {
                ...conv,
                participants: normalizeParticipants(participantsResponse.data.participants || [])
              };
            } catch (err) {
              console.error(`Failed to fetch participants for conversation ${conv.id}:`, err);
              return {
                ...conv,
                participants: normalizeParticipants(conv.participants || [])
              };
            }
          })
        );
        
        const transformedConversations = conversationsWithParticipants.map(transformConversation);
        setConversations(transformedConversations);
        
        // Update activeConversation if it exists in the updated conversations
        let currentConversation = activeConversation;
        if (activeConversation) {
          const updatedConv = transformedConversations.find(c => c.id === activeConversation.id);
          if (updatedConv) {
            setActiveConversation(updatedConv);
            currentConversation = updatedConv;
          }
        }

        // If there's an active conversation, fetch new messages
        if (currentConversation) {
          const msgResponse = await api.get(`/api/chat/conversations/${currentConversation.id}/messages`);
          const newMessages = msgResponse.data.messages.map(transformMessage);

          // Always update messages to ensure we have the latest data
          // This ensures sender information is always correct
          setMessages(newMessages);
          if (newMessages.length > 0) {
            setLastMessageId(newMessages[newMessages.length - 1].id);
          }
        }
      } catch (err) {
        console.error('Error polling for updates:', err);
      }
    }, 5000);

    // Cleanup interval on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [activeConversation]);

  // Separate Team conversation and individual conversations
  const teamConversation = conversations.find(conv => conv.name === 'Team');
  const individualConversations = conversations.filter(conv => conv.name !== 'Team');

  // Sort individual conversations by last activity (newest first)
  const sortedIndividualConversations = [...individualConversations].sort((a, b) => {
    if (a.unread > 0 && b.unread === 0) return -1;
    if (a.unread === 0 && b.unread > 0) return 1;
    return 0;
  });

  // Filter conversations based on search term
  const filteredTeam = teamConversation ? [teamConversation].filter(conv =>
    conv.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.lastMessage?.toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  const filteredIndividuals = sortedIndividualConversations.filter(conv =>
    conv.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.lastMessage?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Validate message content
  const validateMessage = (message) => {
    if (!message || message.trim().length === 0) {
      return 'Message cannot be empty';
    }
    if (message.length > 5000) {
      return 'Message is too long (max 5000 characters)';
    }
    return null;
  };

  // Send new message
  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!activeConversation) {
      setError('Please select a conversation first');
      return;
    }

    // Validate that either message content or attachment is provided
    if (!newMessage.trim() && !attachment) {
      setError('Please enter a message or attach a file');
      return;
    }

    // Only validate message content if there is a message (not just attachment)
    if (newMessage.trim()) {
      const validationError = validateMessage(newMessage);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setSending(true);
    setError(null);

    try {
      const messageData = {
        content: newMessage.trim() || 'Shared a file',
        messageType: attachment ? 'file' : 'text',
        attachmentUrl: attachment?.url || null,
        fileType: attachment?.fileType || null
      };

      const response = await api.post(
        `/api/chat/conversations/${activeConversation.id}/messages`,
        messageData
      );

      const newMsg = transformMessage(response.data.data);
      setMessages(prev => [...prev, newMsg]);
      setNewMessage('');
      setAttachment(null);

      // Update conversation's last message
      setConversations(prev => prev.map(conv =>
        conv.id === activeConversation.id
          ? { ...conv, lastMessage: newMessage.trim(), lastMessagePreview: newMessage.trim().length > 30 
              ? newMessage.trim().substring(0, 30) + '...'
              : newMessage.trim(),
            time: 'Just now', unread: 0 }
          : conv
      ));
    } catch (err) {
      setError('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Clear search
  const handleClearSearch = () => {
    setSearchTerm('');
    setShowSearch(false);
  };

  return (
    <div className="h-full flex bg-[var(--chat-shell)] overflow-hidden scrollbar-hide">
      {/* Error Toast */}
      {error && (
        <div className="absolute top-4 right-4 bg-red-50 border border-red-200 rounded-lg shadow-sm px-4 py-2.5 z-50 flex items-center space-x-3 animate-slide-in">
          <div className="flex-shrink-0">
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-red-800">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Sidebar - Conversations List */}
      <div className={`w-72 border-r border-[var(--border)] bg-[var(--chat-sidebar)] flex flex-col ${
        activeConversation && showMobileChat ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Sidebar Header */}
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-4">
            {/* <h2 className="text-sm font-semibold text-gray-900">Messages</h2> */}
            <div className="flex items-center space-x-2">
              {showSearch ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-md focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    autoFocus
                  />
                  <button
                    onClick={handleClearSearch}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setShowSearch(true)}
                    className="text-gray-500 hover:text-gray-700"
                    title="Search"
                  >
                    {/* <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg> */}
                  </button>
                  <button className="text-gray-500 hover:text-gray-700" title="New conversation">
                    {/* <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg> */}
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* Current User Info */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-gray-500">{ROLE_NAMES[user?.role_id] || 'Team Member'}</p>
            </div>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
              <p className="text-xs text-gray-500">Loading conversations...</p>
            </div>
          ) : (
            <>
              {/* Team Chat Section */}
              {filteredTeam.length > 0 && (
                <div className="px-4 py-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Team</h3>
                  {filteredTeam.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => handleConversationClick(conv)}
                      className={`flex items-start space-x-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 mb-1 ${
                        activeConversation?.id === conv.id 
                          ? 'bg-indigo-50 border border-indigo-200 shadow-sm' 
                          : 'hover:bg-gray-50 hover:shadow-sm'
                      }`}
                    >
                      <div className="relative flex-shrink-0 mt-0.5">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-sm">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                          <span className="text-[9px] font-semibold text-white">{conv.participants?.length || 1}</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{conv.displayName}</p>
                          <div className="flex items-center justify-between mt-0.5">
                            <p className="text-xs text-gray-500 truncate leading-tight flex-1">{conv.lastMessagePreview}</p>
                            <div className="flex items-center ml-2 flex-shrink-0">
                              <span className="text-[10px] text-gray-400 mr-1.5">{conv.time}</span>
                              {conv.unread > 0 && (
                                <span className="inline-flex items-center justify-center min-w-[18px] h-4.5 px-1.5 bg-indigo-600 text-[10px] font-semibold text-white rounded-full shadow-sm">
                                  {conv.unread}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Individual Chats Section */}
              <div className="px-4 py-2 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Direct Messages</h3>
                {filteredIndividuals.length > 0 ? (
                  filteredIndividuals.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => handleConversationClick(conv)}
                      className={`flex items-start space-x-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 mb-1 ${
                        activeConversation?.id === conv.id 
                          ? 'bg-indigo-50 border border-indigo-200 shadow-sm' 
                          : 'hover:bg-gray-50 hover:shadow-sm'
                      }`}
                    >
                      <div className="relative flex-shrink-0 mt-0.5">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                          {conv.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-white rounded-full ${
                          conv.online ? 'bg-green-500' : 'bg-gray-400'
                        }`}></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${
                            conv.unread > 0 ? 'text-gray-900' : 'text-gray-700'
                          }`}>{conv.displayName}</p>
                          <div className="flex items-center justify-between mt-0.5">
                            <p className="text-xs text-gray-500 truncate leading-tight flex-1">{conv.lastMessagePreview}</p>
                            <div className="flex items-center ml-2 flex-shrink-0">
                              <span className="text-[10px] text-gray-400 mr-1.5">{conv.time}</span>
                              {conv.unread > 0 && (
                                <span className="inline-flex items-center justify-center min-w-[18px] h-4.5 px-1.5 bg-indigo-600 text-[10px] font-semibold text-white rounded-full shadow-sm">
                                  {conv.unread}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-8 text-center">
                    <svg className="mx-auto h-8 w-8 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-xs text-gray-500">No conversations found</p>
                    {searchTerm && (
                      <button
                        onClick={handleClearSearch}
                        className="text-xs text-indigo-600 hover:text-indigo-800 mt-1"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col ${
        !activeConversation || !showMobileChat ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Chat Header */}
        {activeConversation ? (
          <>
            <div className="px-4 py-2 md:px-6 md:py-4 border-b border-[var(--border)] bg-[var(--chat-header)] min-h-[60px]">
              <div className="flex items-center justify-between h-full">
                <div className="flex items-center space-x-2 md:space-x-3 h-full">
                  <button
                    onClick={() => setShowMobileChat(false)}
                    className="md:hidden p-1.5 -ml-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  {activeConversation.isGroup ? (
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                      <svg className="w-4 h-4 md:w-5 md:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-white text-xs md:text-sm font-medium">
                        {(activeConversation.participants?.find(p => parseInt(p.user_id) !== parseInt(user.id))?.full_name || activeConversation.participants?.find(p => parseInt(p.user_id) !== parseInt(user.id))?.username || activeConversation.displayName).charAt(0).toUpperCase()}
                      </div>
                      <div className={`absolute bottom-0 right-0 w-2 h-2 md:w-2.5 md:h-2.5 border-2 border-white rounded-full ${
                        activeConversation.online ? 'bg-green-500' : 'bg-gray-400'
                      }`}></div>
                    </div>
                  )}
                  <div className="flex items-center space-x-1.5 md:space-x-2">
                    <span className="text-xs md:text-sm font-semibold text-gray-900 truncate max-w-[180px] md:max-w-[250px]">{activeConversation.isGroup ? activeConversation.displayName : (activeConversation.participants?.find(p => parseInt(p.user_id) !== parseInt(user.id))?.full_name || activeConversation.participants?.find(p => parseInt(p.user_id) !== parseInt(user.id))?.username || activeConversation.displayName)}</span>
                    {activeConversation.isGroup && (
                      <span className="inline-flex items-center px-1.5 md:px-2 py-0.5 rounded text-[10px] md:text-xs font-medium bg-gray-100 text-gray-800">
                        {activeConversation.participants?.length || 1} members
                      </span>
                    )}
                    <span className="text-xs md:text-sm text-gray-600 flex items-center">
                      {activeConversation.online ? (
                        <>
                          <span className="w-1 h-1 md:w-1.5 md:h-1.5 bg-green-500 rounded-full mr-1 md:mr-1.5"></span>
                          Online
                        </>
                      ) : (
                        <>
                          <span className="w-1 h-1 md:w-1.5 md:h-1.5 bg-gray-400 rounded-full mr-1 md:mr-1.5"></span>
                          Offline
                        </>
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <button
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="More options"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto chat-message-bg px-3 md:px-6 py-2 md:py-4 scrollbar-hide">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-3 md:mb-4">
                    <svg className="w-6 h-6 md:w-8 md:h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-1 md:mb-2">Start the conversation</h3>
                  <p className="text-xs md:text-sm text-gray-600 max-w-md">
                    Send your first message to begin chatting with {activeConversation.displayName}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 md:space-y-4">
                  {messages.map((msg, index) => {
                    // Ensure both senderId and user.id are numbers for comparison
                    const senderId = parseInt(msg.senderId);
                    const currentUserId = parseInt(user.id);
                    const isOwnMessage = senderId === currentUserId;
                    // Show sender info only in Team chat
                    const showSenderInfo = activeConversation.isGroup;
                    const previousMessage = messages[index - 1];
                    // Only show date separator if we have a valid date and it's different from previous message
                    const showTimeSeparator = msg.createdAt && 
                      (!previousMessage || 
                        (previousMessage.createdAt && 
                          new Date(msg.createdAt).getDate() !== new Date(previousMessage.createdAt).getDate()));

                    return (
                      <React.Fragment key={msg.id}>
                        {showTimeSeparator && (
                          <div className="flex items-center justify-center my-3 md:my-4">
                            <div className="px-2.5 md:px-3 py-0.5 md:py-1 bg-gray-100 rounded-full">
                              <span className="text-[10px] md:text-xs text-gray-600">
                                {new Date(msg.createdAt).toLocaleDateString('en-US', { 
                                  weekday: 'long', 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                })}
                              </span>
                            </div>
                          </div>
                        )}
                        <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-lg md:max-w-lg max-w-[90%] ${isOwnMessage ? '' : 'mr-1 md:mr-2'}`}>
                            {showSenderInfo && (
                              <div className="flex items-center space-x-1 md:space-x-2 mb-0.5 md:mb-1 ml-1">
                                <div className="w-4 h-4 md:w-6 md:h-6 rounded-full bg-gray-300 flex items-center justify-center text-[9px] md:text-xs font-medium text-gray-700">
                                  {msg.senderName.charAt(0)}
                                </div>
                                <div>
                                  <p className="text-[10px] md:text-xs font-medium text-gray-900">{msg.senderName}</p>
                                  <p className="hidden md:block text-xs text-gray-500">
                                    {ROLE_NAMES[msg.senderRoleId] || 'Team Member'}
                                  </p>
                                </div>
                              </div>
                            )}
                            <div className={`px-2 md:px-3 py-1 md:py-2 rounded-lg md:rounded-xl ${isOwnMessage
                                ? 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-br-none'
                                : 'bg-white text-gray-900 border border-gray-200 rounded-bl-none shadow-sm'
                              }`}>
                              <p className="text-[11px] md:text-sm">{msg.content}</p>
                              {msg.attachmentUrl && (
                                <div className="mt-1">
                                  <MessageAttachment
                                    attachment={msg.attachmentUrl}
                                    type={msg.fileType}
                                  />
                                </div>
                              )}
                              <div className={`flex items-center justify-end space-x-1 md:space-x-2 mt-0.5 md:mt-1 ${
                                isOwnMessage ? 'text-blue-100' : 'text-gray-500'
                              }`}>
                                {msg.timestamp && <span className="text-[9px] md:text-xs">{msg.timestamp}</span>}
                                {isOwnMessage && (
                                  <MessageReceipts
                                    status={msg.isRead ? 'read' : 'sent'}
                                    isOwnMessage={true}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className="border-t border-[var(--border)] bg-[var(--chat-input)] px-3 md:px-6 py-2 md:py-4">
              <form onSubmit={handleSendMessage} className="flex items-center space-x-2 md:space-x-3 h-full">
                <FileUpload 
                  onUploadComplete={(data) => setAttachment(data)}
                  disabled={!activeConversation}
                />
                <div className="flex-1 h-full flex flex-col justify-center">
                  {attachment && (
                    <div className="mb-0.5 flex items-center space-x-0.5 p-0.5 bg-gray-50 rounded">
                      <div className="flex-1 flex items-center space-x-0.5">
                        <svg className="w-2.5 h-2.5 md:w-3 md:h-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <span className="text-[8px] md:text-[10px] text-gray-700 truncate">{attachment.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachment(null)}
                        className="p-0.5 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                      >
                        <svg className="w-2 h-2 md:w-2.5 md:h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                  <textarea
                    placeholder="Message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    className="w-full px-3 md:px-4 py-2 md:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none h-[40px] md:h-auto"
                    rows={1}
                    style={{ minHeight: '40px', maxHeight: '120px' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={sending || (!newMessage.trim() && !attachment)}
                  className={`px-2 md:px-4 py-1.5 md:py-2.5 rounded-lg flex items-center space-x-1 md:space-x-2 transition-all h-[40px] md:h-auto border border-gray-300 ${
                    sending || (!newMessage.trim() && !attachment)
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-indigo-500 text-white hover:bg-indigo-600'
                  }`}
                >
                  {sending ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 md:h-4 md:w-4 border-b-2 border-white"></div>
                      <span className="text-xs md:text-sm">Sending...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs md:text-sm">Send</span>
                      <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center chat-empty-bg">
            <div className="text-center px-8">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-r from-indigo-100 to-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
                <svg className="w-8 h-8 md:w-10 md:h-10 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-2 md:mb-3">Welcome to Team Chat</h3>
              <p className="text-sm md:text-base text-gray-600 max-w-md mb-4 md:mb-6">
                Select a conversation from the sidebar to start messaging with your team members or create a new conversation.
              </p>
              <div className="inline-flex items-center space-x-2 text-xs md:text-sm text-indigo-600">
                <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Click on any conversation to get started</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
