import express from 'express';
const router = express.Router();
import {
  getConversations,
  getMessages,
  createConversation,
  sendMessage,
  markAsRead,
  updateOnlineStatus,
  getConversationParticipants
} from '../controllers/chat.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

/**
 * @route   GET /api/chat/conversations
 * @desc    Get all conversations for the logged-in user
 * @access  Private
 */
router.get('/conversations', authenticateToken, getConversations);

/**
 * @route   POST /api/chat/conversations
 * @desc    Create a new conversation
 * @access  Private
 */
router.post('/conversations', authenticateToken, createConversation);

/**
 * @route   GET /api/chat/conversations/:conversationId/messages
 * @desc    Get all messages for a conversation
 * @access  Private
 */
router.get('/conversations/:conversationId/messages', authenticateToken, getMessages);

/**
 * @route   POST /api/chat/conversations/:conversationId/messages
 * @desc    Send a message to a conversation
 * @access  Private
 */
router.post('/conversations/:conversationId/messages', authenticateToken, sendMessage);

/**
 * @route   PUT /api/chat/conversations/:conversationId/read
 * @desc    Mark all messages in conversation as read
 * @access  Private
 */
router.put('/conversations/:conversationId/read', authenticateToken, markAsRead);

/**
 * @route   PUT /api/chat/online-status
 * @desc    Update user's online status
 * @access  Private
 */
router.put('/online-status', authenticateToken, updateOnlineStatus);

/**
 * @route   GET /api/chat/conversations/:conversationId/participants
 * @desc    Get all participants in a conversation
 * @access  Private
 */
router.get('/conversations/:conversationId/participants', authenticateToken, getConversationParticipants);

export default router;
