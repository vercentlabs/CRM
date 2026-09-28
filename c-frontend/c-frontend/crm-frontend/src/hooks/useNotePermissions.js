
import { useAuth } from '@/context/AuthContext';

/**
 * Custom hook for checking note permissions
 * @param {Object} note - Note object
 * @returns {Object} Permission flags
 */
export const useNotePermissions = (note) => {
  const { user } = useAuth();

  /**
   * Check if user can edit a note
   * Only note creator or admin can edit
   * @param {Object} note - Note object
   * @returns {boolean} True if user can edit
   */
  const canEdit = (note) => {
    if (!user || !note) return false;

    // Admin can edit any note
    if (user.roleId === 1) return true;

    // Note creator can edit their own note
    if (note.created_by === user.id) return true;

    return false;
  };

  /**
   * Check if user can delete a note
   * Only note creator or admin can delete
   * @param {Object} note - Note object
   * @returns {boolean} True if user can delete
   */
  const canDelete = (note) => {
    if (!user || !note) return false;

    // Admin can delete any note
    if (user.roleId === 1) return true;

    // Note creator can delete their own note
    if (note.created_by === user.id) return true;

    return false;
  };

  /**
   * Check if user can view a note
   * All authenticated users can view notes
   * @param {Object} note - Note object
   * @returns {boolean} True if user can view
   */
  const canView = (note) => {
    if (!user || !note) return false;

    // All authenticated users can view notes
    return true;
  };

  /**
   * Check if user has read-only access to a note
   * @param {Object} note - Note object
   * @returns {boolean} True if user has read-only access
   */
  const isReadOnly = (note) => {
    if (!user || !note) return true;

    // Admin and creator have full access
    if (user.roleId === 1 || note.created_by === user.id) {
      return false;
    }

    // Other roles have read-only access
    return true;
  };

  return {
    canEdit: canEdit(note),
    canDelete: canDelete(note),
    canView: canView(note),
    isReadOnly: isReadOnly(note),
    // Also return the functions for checking permissions on other notes
    canEditNote: canEdit,
    canDeleteNote: canDelete,
    canViewNote: canView,
    isNoteReadOnly: isReadOnly
  };
};
