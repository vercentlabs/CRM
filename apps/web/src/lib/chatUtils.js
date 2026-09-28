/**
 * Chat utility functions
 */

/**
 * Format message timestamp
 */
export const formatMessageTime = (dateString) => {
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

/**
 * Format full message timestamp
 */
export const formatFullMessageTime = (dateString) => {
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

/**
 * Get user initials
 */
export const getUserInitials = (name) => {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

/**
 * Check if message should be grouped with previous message
 */
export const shouldGroupMessages = (currentMessage, previousMessage, thresholdMinutes = 5) => {
  if (!previousMessage || !currentMessage) return false;

  // Messages must be from the same sender
  if (currentMessage.senderId !== previousMessage.senderId) return false;

  // Check time difference
  const currentTime = new Date(currentMessage.created_at).getTime();
  const previousTime = new Date(previousMessage.created_at).getTime();
  const diffMinutes = (currentTime - previousTime) / 60000;

  return diffMinutes <= thresholdMinutes;
};

/**
 * Get conversation display name
 */
export const getConversationDisplayName = (conversation, currentUserId) => {
  if (conversation.is_group) {
    return conversation.name;
  }

  // For direct chats, show the other participant's name
  const otherParticipant = conversation.participants?.find(p => p.user_id !== currentUserId);
  if (otherParticipant) {
    return otherParticipant.full_name || otherParticipant.username || 'Unknown';
  }

  return conversation.name || 'Unknown';
};

/**
 * Check if user is online
 */
export const isUserOnline = (participant) => {
  return participant?.is_online || false;
};

/**
 * Get unread message count
 */
export const getUnreadCount = (conversation) => {
  return conversation?.unread_count || 0;
};

/**
 * Validate message content
 */
export const validateMessage = (message, maxLength = 5000) => {
  if (!message || message.trim().length === 0) {
    return { isValid: false, error: 'Message cannot be empty' };
  }
  if (message.length > maxLength) {
    return { isValid: false, error: `Message is too long (max ${maxLength} characters)` };
  }
  return { isValid: true, error: null };
};

/**
 * Format file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Get file type from MIME type
 */
export const getFileType = (mimeType) => {
  if (!mimeType) return 'unknown';

  const type = mimeType.toLowerCase();

  if (type.includes('image')) return 'image';
  if (type.includes('video')) return 'video';
  if (type.includes('audio')) return 'audio';
  if (type.includes('pdf')) return 'pdf';
  if (type.includes('word') || type.includes('document')) return 'document';
  if (type.includes('sheet') || type.includes('excel')) return 'spreadsheet';
  if (type.includes('presentation') || type.includes('powerpoint')) return 'presentation';
  if (type.includes('zip') || type.includes('archive')) return 'archive';

  return 'file';
};

/**
 * Check if file type is supported
 */
export const isFileTypeSupported = (mimeType, maxSizeMB = 10) => {
  const supportedTypes = [
    'image/',
    'video/',
    'audio/',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed'
  ];

  if (!mimeType) return false;

  const isSupported = supportedTypes.some(type => mimeType.toLowerCase().startsWith(type));
  return isSupported;
};

/**
 * Sort conversations by last message time
 */
export const sortConversations = (conversations) => {
  return [...conversations].sort((a, b) => {
    const timeA = new Date(a.last_message_time || a.updated_at).getTime();
    const timeB = new Date(b.last_message_time || b.updated_at).getTime();
    return timeB - timeA;
  });
};

/**
 * Filter conversations by search term
 */
export const filterConversations = (conversations, searchTerm) => {
  if (!searchTerm) return conversations;

  const term = searchTerm.toLowerCase();
  return conversations.filter(conv => {
    const nameMatch = conv.name?.toLowerCase().includes(term);
    const messageMatch = conv.last_message?.toLowerCase().includes(term);
    return nameMatch || messageMatch;
  });
};

/**
 * Get online participants count
 */
export const getOnlineParticipantsCount = (participants) => {
  return participants?.filter(p => p.is_online).length || 0;
};
