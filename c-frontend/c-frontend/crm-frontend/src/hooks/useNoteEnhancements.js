
import { useState, useCallback } from 'react';

/**
 * Hook for linking notes to leads/customers
 * @returns {Object} Linking state and handlers
 */
export const useNoteLinking = () => {
  const [linkedEntities, setLinkedEntities] = useState({
    leads: [],
    customers: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Link a note to a lead
   * @param {number} noteId - Note ID
   * @param {number} leadId - Lead ID
   */
  const linkToLead = useCallback(async (noteId, leadId) => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Implement API call to link note to lead
      // const response = await fetch(`/api/notes/${noteId}/links/leads/${leadId}`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      //   }
      // });

      // Update local state optimistically
      setLinkedEntities(prev => ({
        ...prev,
        leads: [...prev.leads, { noteId, leadId }]
      }));

      console.log(`Linked note ${noteId} to lead ${leadId}`);
    } catch (err) {
      console.error('Error linking note to lead:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Link a note to a customer
   * @param {number} noteId - Note ID
   * @param {number} customerId - Customer ID
   */
  const linkToCustomer = useCallback(async (noteId, customerId) => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Implement API call to link note to customer
      // const response = await fetch(`/api/notes/${noteId}/links/customers/${customerId}`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      //   }
      // });

      // Update local state optimistically
      setLinkedEntities(prev => ({
        ...prev,
        customers: [...prev.customers, { noteId, customerId }]
      }));

      console.log(`Linked note ${noteId} to customer ${customerId}`);
    } catch (err) {
      console.error('Error linking note to customer:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Unlink a note from a lead
   * @param {number} noteId - Note ID
   * @param {number} leadId - Lead ID
   */
  const unlinkFromLead = useCallback(async (noteId, leadId) => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Implement API call to unlink note from lead
      // const response = await fetch(`/api/notes/${noteId}/links/leads/${leadId}`, {
      //   method: 'DELETE',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      //   }
      // });

      // Update local state
      setLinkedEntities(prev => ({
        ...prev,
        leads: prev.leads.filter(link => 
          !(link.noteId === noteId && link.leadId === leadId)
        )
      }));

      console.log(`Unlinked note ${noteId} from lead ${leadId}`);
    } catch (err) {
      console.error('Error unlinking note from lead:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Unlink a note from a customer
   * @param {number} noteId - Note ID
   * @param {number} customerId - Customer ID
   */
  const unlinkFromCustomer = useCallback(async (noteId, customerId) => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Implement API call to unlink note from customer
      // const response = await fetch(`/api/notes/${noteId}/links/customers/${customerId}`, {
      //   method: 'DELETE',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      //   }
      // });

      // Update local state
      setLinkedEntities(prev => ({
        ...prev,
        customers: prev.customers.filter(link => 
          !(link.noteId === noteId && link.customerId === customerId)
        )
      }));

      console.log(`Unlinked note ${noteId} from customer ${customerId}`);
    } catch (err) {
      console.error('Error unlinking note from customer:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    linkedEntities,
    loading,
    error,
    linkToLead,
    linkToCustomer,
    unlinkFromLead,
    unlinkFromCustomer
  };
};

/**
 * Hook for AI-powered note summaries
 * @returns {Object} Summary state and handlers
 */
export const useNoteSummary = () => {
  const [summaries, setSummaries] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Generate AI summary for a note
   * @param {number} noteId - Note ID
   * @param {string} content - Note content
   */
  const generateSummary = useCallback(async (noteId, content) => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Implement AI summary API call
      // const response = await fetch('/api/ai/summarize', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      //   },
      //   body: JSON.stringify({ content })
      // });
      // const data = await response.json();

      // Placeholder: Generate a simple summary
      const summary = content.length > 100 
        ? `${content.substring(0, 100)}...` 
        : content;

      // Update local state
      setSummaries(prev => ({
        ...prev,
        [noteId]: summary
      }));

      console.log(`Generated summary for note ${noteId}`);
      return summary;
    } catch (err) {
      console.error('Error generating summary:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get summary for a note
   * @param {number} noteId - Note ID
   * @returns {string|null} Summary or null if not generated
   */
  const getSummary = useCallback((noteId) => {
    return summaries[noteId] || null;
  }, [summaries]);

  return {
    summaries,
    loading,
    error,
    generateSummary,
    getSummary
  };
};

/**
 * Hook for user mentions in notes
 * @returns {Object} Mentions state and handlers
 */
export const useNoteMentions = () => {
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Search for users to mention
   * @param {string} query - Search query
   */
  const searchUsers = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setMentions([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // TODO: Implement user search API call
      // const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      //   }
      // });
      // const data = await response.json();

      // Placeholder: Use mock data
      const mockUsers = [
        { id: 1, name: 'Admin User', email: 'admin@example.com' },
        { id: 2, name: 'Manager User', email: 'manager@example.com' },
        { id: 3, name: 'Sales User', email: 'sales@example.com' }
      ];

      const filteredUsers = mockUsers.filter(user => 
        user.name.toLowerCase().includes(query.toLowerCase()) ||
        user.email.toLowerCase().includes(query.toLowerCase())
      );

      setMentions(filteredUsers);
    } catch (err) {
      console.error('Error searching users:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Parse mentions from note content
   * @param {string} content - Note content
   * @returns {Array} Array of mentioned user IDs
   */
  const parseMentions = useCallback((content) => {
    // TODO: Implement proper mention parsing
    // This is a placeholder that looks for @username patterns
    const mentionPattern = /@(\w+)/g;
    const matches = content.match(mentionPattern) || [];
    return matches.map(match => match.substring(1));
  }, []);

  return {
    mentions,
    loading,
    error,
    searchUsers,
    parseMentions
  };
};

/**
 * Hook for note activity logs
 * @returns {Object} Activity state and handlers
 */
export const useNoteActivity = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch activity logs for a note
   * @param {number} noteId - Note ID
   */
  const fetchActivities = useCallback(async (noteId) => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Implement activity logs API call
      // const response = await fetch(`/api/notes/${noteId}/activities`, {
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      //   }
      // });
      // const data = await response.json();

      // Placeholder: Use mock data
      const mockActivities = [
        {
          id: 1,
          noteId,
          action: 'created',
          userId: 1,
          userName: 'Admin User',
          timestamp: new Date().toISOString()
        }
      ];

      setActivities(mockActivities);
      return mockActivities;
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Add an activity log entry
   * @param {number} noteId - Note ID
   * @param {string} action - Action type
   * @param {Object} metadata - Additional metadata
   */
  const logActivity = useCallback(async (noteId, action, metadata = {}) => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Implement activity log API call
      // const response = await fetch(`/api/notes/${noteId}/activities`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      //   },
      //   body: JSON.stringify({ action, metadata })
      // });

      // Update local state optimistically
      const newActivity = {
        id: Date.now(),
        noteId,
        action,
        userId: 1, // TODO: Get from auth context
        userName: 'Current User', // TODO: Get from auth context
        timestamp: new Date().toISOString(),
        ...metadata
      };

      setActivities(prev => [newActivity, ...prev]);

      console.log(`Logged activity ${action} for note ${noteId}`);
      return newActivity;
    } catch (err) {
      console.error('Error logging activity:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    activities,
    loading,
    error,
    fetchActivities,
    logActivity
  };
};
