// /api/lead-messages shares the single tenant-safe implementation with /messages
// (the two controllers were byte-for-byte duplicates before Phase 2).
export {
  sendMessage as sendLeadMessage,
  getMessages as getLeadMessages,
  updateMessageStatus as updateLeadMessageStatus,
  sendBulkMessage as sendBulkLeadMessages
} from './message.controller.js';
