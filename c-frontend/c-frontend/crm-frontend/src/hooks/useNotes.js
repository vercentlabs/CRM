
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchNotes as fetchNotesApi, createNote, updateNote, deleteNote as deleteNoteApi } from '../services/notesApi';

/**
 * Custom hook for managing notes state with optimistic updates
 * @returns {Object} Notes state and handlers
 */
export const useNotes = () => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true
  });
  const abortControllerRef = useRef(null);

  /**
   * Fetch notes with pagination and filters
   * @param {Object} filters - Optional filters (search, date, author, tags)
   * @param {boolean} reset - Whether to reset pagination
   */
  const fetchNotes = useCallback(async (filters = {}, reset = false) => {
    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      const { page = 1, pageSize = 20 } = pagination;
      const actualPage = reset ? 1 : page;
      const data = await fetchNotesApi(
        { page: actualPage, pageSize, ...filters },
        abortControllerRef.current.signal
      );

      setNotes(prev => reset ? data.notes : [...prev, ...data.notes]);
      setPagination(prev => ({
        ...prev,
        page: actualPage,
        total: data.total || prev.total,
        hasMore: data.notes.length >= pageSize
      }));
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error fetching notes:', err);
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize]);

  /**
   * Create a new note with optimistic update
   * @param {Object} noteData - Note data to create
   * @returns {Promise<Object>} Created note
   */
  const createNoteOptimistic = useCallback(async (noteData) => {
    // Generate temporary ID for optimistic update
    const tempId = `temp-${Date.now()}`;
    const optimisticNote = {
      ...noteData,
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      isOptimistic: true
    };

    // Optimistic update
    setNotes(prev => [optimisticNote, ...prev]);

    try {
      const createdNote = await createNote(noteData);

      // Replace optimistic note with real note
      setNotes(prev => prev.map(note => 
        note.id === tempId ? createdNote : note
      ));

      return createdNote;
    } catch (err) {
      // Rollback on error
      setNotes(prev => prev.filter(note => note.id !== tempId));
      throw err;
    }
  }, []);

  /**
   * Update a note with optimistic update
   * @param {number} id - Note ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated note
   */
  const updateNoteOptimistic = useCallback(async (id, updates) => {
    // Store original note for rollback
    const originalNote = notes.find(note => note.id === id);
    if (!originalNote) {
      throw new Error('Note not found');
    }

    // Optimistic update
    const optimisticNote = {
      ...originalNote,
      ...updates,
      updated_at: new Date().toISOString(),
      isOptimistic: true
    };

    setNotes(prev => prev.map(note => 
      note.id === id ? optimisticNote : note
    ));

    try {
      const updatedNote = await updateNote(id, updates);

      // Replace optimistic note with real note
      setNotes(prev => prev.map(note => 
        note.id === id ? updatedNote : note
      ));

      return updatedNote;
    } catch (err) {
      // Rollback on error
      setNotes(prev => prev.map(note => 
        note.id === id ? originalNote : note
      ));
      throw err;
    }
  }, [notes]);

  /**
   * Delete a note with optimistic update
   * @param {number} id - Note ID
   * @returns {Promise<void>}
   */
  const deleteNoteOptimistic = useCallback(async (id) => {
    // Store original note for rollback
    const originalNote = notes.find(note => note.id === id);
    if (!originalNote) {
      throw new Error('Note not found');
    }

    // Optimistic update - remove note from list
    setNotes(prev => prev.filter(note => note.id !== id));

    try {
      await deleteNoteApi(id);
    } catch (err) {
      // Rollback on error - restore note
      setNotes(prev => [...prev, originalNote]);
      throw err;
    }
  }, [notes]);

  /**
   * Load more notes for infinite scroll
   */
  const loadMore = useCallback(() => {
    if (!loading && pagination.hasMore) {
      setPagination(prev => ({ ...prev, page: prev.page + 1 }));
      fetchNotes({}, false);
    }
  }, [loading, pagination.hasMore, fetchNotes]);

  /**
   * Refresh notes list
   */
  const refresh = useCallback(() => {
    fetchNotes({}, true);
  }, [fetchNotes]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    notes,
    loading,
    error,
    pagination,
    fetchNotes,
    createNote: createNoteOptimistic,
    updateNote: updateNoteOptimistic,
    deleteNote: deleteNoteOptimistic,
    loadMore,
    refresh
  };
};
