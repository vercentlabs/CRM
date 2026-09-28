
import api from '@/lib/api';

/**
 * Notes API service for CRUD operations
 */

/**
 * Fetch all notes
 * @returns {Promise<Array>} Array of notes
 */
export const fetchNotes = async (params = {}, signal) => {
  const response = await api.get('/notes', { params, signal });
  return response.data;
};

/**
 * Fetch a single note by ID
 * @param {number} id - Note ID
 * @returns {Promise<Object>} Note object
 */
export const fetchNoteById = async (id) => {
  const response = await api.get(`/notes/${id}`);
  return response.data;
};

/**
 * Create a new note
 * @param {Object} noteData - Note data
 * @returns {Promise<Object>} Created note
 */
export const createNote = async (noteData) => {
  const response = await api.post('/notes', noteData);
  return response.data;
};

/**
 * Update an existing note
 * @param {number} id - Note ID
 * @param {Object} noteData - Updated note data
 * @returns {Promise<Object>} Updated note
 */
export const updateNote = async (id, noteData) => {
  const response = await api.put(`/notes/${id}`, noteData);
  return response.data;
};

/**
 * Delete a note (soft delete)
 * @param {number} id - Note ID
 * @returns {Promise<Object>} Response
 */
export const deleteNote = async (id) => {
  const response = await api.delete(`/notes/${id}`);
  return response.data;
};
