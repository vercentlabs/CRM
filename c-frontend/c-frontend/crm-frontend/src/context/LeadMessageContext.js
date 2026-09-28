
'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { leadMessageApi } from '@/lib/api/lead-messages';

const LeadMessageContext = createContext();

export const LeadMessageProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch all lead messages
  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await leadMessageApi.getMessages();
      setMessages(response.data.messages || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch messages');
      console.error('Error fetching messages:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Send a message to a lead
  const sendMessage = useCallback(async (data) => {
    try {
      setLoading(true);
      setError(null);
      const response = await leadMessageApi.sendMessage(data);
      setMessages(prev => [response.data.message, ...prev]);
      return response.data.message;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send message');
      console.error('Error sending message:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update message status
  const updateStatus = useCallback(async (messageId, status) => {
    try {
      await leadMessageApi.updateStatus(messageId, status);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === messageId ? { ...msg, status } : msg
        )
      );
    } catch (err) {
      console.error('Error updating message status:', err);
    }
  }, []);

  // Send bulk messages to multiple leads
  const sendBulk = useCallback(async (data) => {
    try {
      setLoading(true);
      setError(null);
      const response = await leadMessageApi.sendBulk(data);
      // Refresh messages after bulk send
      await fetchMessages();
      return response.data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send bulk messages');
      console.error('Error sending bulk messages:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchMessages]);

  const value = {
    messages,
    loading,
    error,
    fetchMessages,
    sendMessage,
    updateStatus,
    sendBulk
  };

  return (
    <LeadMessageContext.Provider value={value}>
      {children}
    </LeadMessageContext.Provider>
  );
};

export const useLeadMessages = () => {
  const context = useContext(LeadMessageContext);
  if (!context) {
    throw new Error('useLeadMessages must be used within a LeadMessageProvider');
  }
  return context;
};
