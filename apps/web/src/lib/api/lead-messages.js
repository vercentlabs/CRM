
import api from '../api';

/**
 * Lead Messages API module for communication with leads
 * All endpoints related to lead messaging functionality
 */
export const leadMessageApi = {
  /**
   * Send a message to a single lead
   * @param {Object} data - Message data
   * @param {number} data.leadId - ID of the lead
   * @param {string} data.channel - Channel type (whatsapp, sms)
   * @param {string} data.content - Message content
   * @returns {Promise} API response with sent message
   */
  sendMessage: (data) => api.post('/api/lead-messages/send', data),

  /**
   * Get all lead messages based on user role
   * @returns {Promise} API response with messages list
   */
  getMessages: () => api.get('/api/lead-messages'),

  /**
   * Update the delivery status of a message
   * @param {number} messageId - ID of the message
   * @param {string} status - New status (Sent, Delivered, Failed)
   * @returns {Promise} API response
   */
  updateStatus: (messageId, status) => api.put(`/api/lead-messages/${messageId}/status`, { status }),

  /**
   * Send bulk messages to multiple leads
   * @param {Object} data - Bulk message data
   * @param {Array<number>} data.leadIds - Array of lead IDs
   * @param {string} data.channel - Channel type (whatsapp, sms)
   * @param {string} data.content - Message content
   * @returns {Promise} API response with sent messages count
   */
  sendBulk: (data) => api.post('/api/lead-messages/bulk', data)
};
