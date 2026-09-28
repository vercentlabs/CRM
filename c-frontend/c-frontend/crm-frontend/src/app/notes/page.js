
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import NotesPageHeader from '@/components/notes/NotesPageHeader';
import NotesDrawer from '@/components/notes/NotesDrawer';
import NoteCard from '@/components/notes/NoteCard';
import NotesFilterBar from '@/components/notes/NotesFilterBar';
import NoteSkeleton from '@/components/notes/NoteSkeleton';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import {
  fetchNotes,
  createNoteThunk,
  updateNoteThunk,
  deleteNoteThunk,
  setSelectedNote,
  setFilters,
  clearFilters
} from '@/store/slices/notesSlice';
import {
  selectNotes,
  selectSelectedNote,
  selectNotesLoading,
  selectNotesError,
  selectNotesPagination,
  selectNotesFilters,
  selectFilteredNotes
} from '@/store/slices/notesSlice';

const NotesPage = () => {
  const dispatch = useDispatch();
  const { user, token } = useAuth();

  // Redux state
  const notes = useSelector(selectNotes);
  const selectedNote = useSelector(selectSelectedNote);
  const loading = useSelector(selectNotesLoading);
  const error = useSelector(selectNotesError);
  const pagination = useSelector(selectNotesPagination);
  const filters = useSelector(selectNotesFilters);
  const filteredNotes = useSelector(selectFilteredNotes);

  // Local state
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [authorFilter, setAuthorFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [listFilter, setListFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkMenu, setShowBulkMenu] = useState(false);

  // Custom hooks
  const debouncedSearch = useDebounce(searchQuery, 500);
  const { observerRef, isNearBottom } = useInfiniteScroll(() => {
    if (!loading && pagination.hasMore) {
      dispatch(fetchNotes({
        page: pagination.page + 1,
        pageSize: pagination.pageSize,
        filters: {
          search: debouncedSearch,
          dateRange: dateFilter !== 'all' ? dateFilter : null,
          author: authorFilter !== 'all' ? authorFilter : null,
          tags: tagFilter !== 'all' ? [tagFilter] : []
        }
      }));
    }
  }, { enabled: true });

  // Fetch notes on mount and when filters change
  useEffect(() => {
    if (token) {
      dispatch(fetchNotes({
        page: 1,
        pageSize: pagination.pageSize,
        filters: {
          search: debouncedSearch,
          dateRange: dateFilter !== 'all' ? dateFilter : null,
          author: authorFilter !== 'all' ? authorFilter : null,
          tags: tagFilter !== 'all' ? [tagFilter] : []
        }
      }));
    }
  }, [token, debouncedSearch, dateFilter, authorFilter, tagFilter, dispatch, pagination.pageSize]);

  // Update Redux filters when local state changes
  useEffect(() => {
    dispatch(setFilters({
      search: debouncedSearch,
      dateRange: dateFilter !== 'all' ? dateFilter : null,
      author: authorFilter !== 'all' ? authorFilter : null,
      tags: tagFilter !== 'all' ? [tagFilter] : []
    }));
  }, [debouncedSearch, dateFilter, authorFilter, tagFilter, dispatch]);

  // Handle note selection
  const handleNoteClick = (note, options = {}) => {
    if (options.toggleSelection) {
      setSelectedIds((prev) => (
        prev.includes(note.id)
          ? prev.filter((id) => id !== note.id)
          : [...prev, note.id]
      ));
      return;
    }
    dispatch(setSelectedNote(note));
  };

  // Handle create note
  const handleCreateNote = () => {
    setEditingNote(null);
    setIsCreatingNote(true);
    setShowDrawer(true);
  };

  // Handle edit note
  const handleEditNote = (note) => {
    setEditingNote(note);
    setIsCreatingNote(false);
    setShowDrawer(true);
  };

  // Handle drawer close
  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setEditingNote(null);
    setIsCreatingNote(false);
  };

  // Handle drawer submit (create/update)
  const handleDrawerSubmit = async (formData) => {
    try {
      if (isCreatingNote) {
        // Create new note
        await dispatch(createNoteThunk({
          ...formData,
          created_by: user.id
        })).unwrap();
      } else {
        // Update existing note
        await dispatch(updateNoteThunk({
          id: editingNote.id,
          ...formData
        })).unwrap();
      }

      handleCloseDrawer();
    } catch (err) {
      console.error('Failed to save note:', err);
      // Error is handled by Redux
    }
  };

  // Handle delete note
  const handleDeleteNote = (note) => {
    setDeleteConfirm(note);
  };

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await dispatch(deleteNoteThunk(deleteConfirm.id)).unwrap();
      setDeleteConfirm(null);

      // Clear selected note if it's the one being deleted
      if (selectedNote?.id === deleteConfirm.id) {
        dispatch(setSelectedNote(null));
      }
    } catch (err) {
      console.error('Failed to delete note:', err);
      // Error is handled by Redux
    }
  };

  const isImportantTag = (note) => {
    return (note.tags || []).some((tag) => String(tag).toLowerCase() === 'important');
  };

  const mapColorToPriority = (color) => {
    if (color === 'red') return 'high';
    if (color === 'yellow') return 'medium';
    if (color === 'green') return 'low';
    return 'normal';
  };

  const visibleNotes = useMemo(() => {
    return filteredNotes
      .filter((note) => {
        if (listFilter === 'important') {
          return isImportantTag(note);
        }
        if (listFilter === 'trash') {
          return false;
        }
        return true;
      })
      .filter((note) => {
        if (priorityFilter === 'all') return true;
        return mapColorToPriority(note.color) === priorityFilter;
      });
  }, [filteredNotes, listFilter, priorityFilter]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = prev.filter((id) => visibleNotes.some((note) => note.id === id));
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [visibleNotes]);

  const tagPalette = [
    { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500' },
    { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
    { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-500' },
    { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
    { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' }
  ];

  const getTagTone = (tag) => {
    if (!tag) return tagPalette[0];
    const normalized = String(tag).trim().toLowerCase();
    if (normalized === 'important') {
      return tagPalette[2];
    }
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash + normalized.charCodeAt(i) * (i + 1)) % tagPalette.length;
    }
    return tagPalette[hash];
  };

  const handleToggleImportant = async (note) => {
    if (!canEditOrDelete(note)) return;
    const tags = Array.isArray(note.tags) ? note.tags : [];
    const hasImportant = isImportantTag(note);
    const updatedTags = hasImportant
      ? tags.filter((tag) => String(tag).toLowerCase() !== 'important')
      : [...tags, 'Important'];

    try {
      await dispatch(updateNoteThunk({
        id: note.id,
        tags: updatedTags
      })).unwrap();
    } catch (err) {
      console.error('Failed to update note tags:', err);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map((id) => dispatch(deleteNoteThunk(id)).unwrap()));
      setSelectedIds([]);
    } catch (err) {
      console.error('Failed to delete selected notes:', err);
    }
  };

  const handleBulkImportant = async () => {
    if (selectedIds.length === 0) return;
    const notesToUpdate = visibleNotes.filter((note) => selectedIds.includes(note.id));
    try {
      await Promise.all(notesToUpdate.map((note) => handleToggleImportant(note)));
    } finally {
      setSelectedIds([]);
    }
  };

  const handleExportNotes = () => {
    const rows = [
      ['Title', 'Content', 'Tags', 'Updated At', 'Author']
    ];
    visibleNotes.forEach((note) => {
      rows.push([
        note.title || '',
        note.content || '',
        (note.tags || []).join(', '),
        note.updated_at || note.created_at || '',
        note.author_name || ''
      ]);
    });
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `notes-export-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Handle clear filters
  const handleClearFilters = () => {
    setSearchQuery('');
    setDateFilter('all');
    setAuthorFilter('all');
    setTagFilter('all');
    dispatch(clearFilters());
  };

  // Extract unique authors and tags from notes
  const uniqueAuthors = useMemo(
    () => [...new Set(notes.map(note => note.created_by))],
    [notes]
  );
  const uniqueTags = useMemo(
    () => [...new Set(notes.flatMap(note => note.tags || []))],
    [notes]
  );

  // Get author function
  const getAuthor = (note) => {
    return {
      id: note.created_by,
      name: note.author_name || 'Unknown User',
      email: note.author_email || ''
    };
  };

  // Check if user can edit or delete a note
  const canEditOrDelete = (note) => {
    if (!user || !note) return false;

    // Admin can edit/delete any note
    if ((user.roleId ?? user.role_id) === ROLE_ADMIN) return true;

    // Note creator can edit/delete their own note
    if (note.created_by === user.id) return true;

    return false;
  };

  // Render loading skeleton
  const renderSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[...Array(6)].map((_, index) => (
        <NoteSkeleton key={index} />
      ))}
    </div>
  );

  // Render empty state
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center h-96 text-gray-500">
      <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-lg font-medium">No notes found</p>
      <p className="text-sm">Create a new note or adjust your filters</p>
    </div>
  );

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          {/* Page Header */}
          <NotesPageHeader
            count={filteredNotes.length}
            onAddNote={handleCreateNote}
          />

          {/* Filter Bar */}
          <NotesFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            authorFilter={authorFilter}
            onAuthorFilterChange={setAuthorFilter}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
            authors={uniqueAuthors.map(id => ({ id, name: getAuthor(notes.find(n => n.created_by === id))?.name || 'Unknown' }))}
            tags={uniqueTags}
            onClearFilters={handleClearFilters}
            hasActiveFilters={searchQuery || dateFilter !== 'all' || authorFilter !== 'all' || tagFilter !== 'all'}
          />

          {/* Notes Layout */}
          <div className="mt-3 sm:mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
            {/* Sidebar */}
            <div className="lg:col-span-3 space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
                  <svg className="h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
                  Notes List
                </h3>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setListFilter('all');
                      setTagFilter('all');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      listFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>All Notes</span>
                    <span className={`text-xs ${listFilter === 'all' ? 'text-indigo-100' : 'text-gray-500'}`}>{notes.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setListFilter('important');
                      setTagFilter('Important');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      listFilter === 'important' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>Important</span>
                    <span className="text-xs text-gray-500">
                      {notes.filter((note) => isImportantTag(note)).length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setListFilter('trash')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      listFilter === 'trash' ? 'bg-gray-100 text-gray-700 border border-gray-200' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <span>Trash</span>
                    <span className="text-xs text-gray-400">0</span>
                  </button>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Tags</h3>
                <div className="space-y-2">
                  {uniqueTags.length === 0 ? (
                    <p className="text-xs text-gray-500">No tags available</p>
                  ) : (
                    uniqueTags.map((tag) => {
                      const tone = getTagTone(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setTagFilter(tag)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                            tagFilter === tag ? `${tone.bg} ${tone.text}` : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${tone.dot}`}></span>
                          {tag}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Priority</h3>
                <div className="space-y-2">
                  {[
                    { value: 'high', label: 'High', dot: 'bg-red-500' },
                    { value: 'medium', label: 'Medium', dot: 'bg-amber-500' },
                    { value: 'low', label: 'Low', dot: 'bg-green-500' }
                  ].map((priority) => (
                    <button
                      key={priority.value}
                      type="button"
                      onClick={() => setPriorityFilter(priority.value)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                        priorityFilter === priority.value ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${priority.dot}`} />
                      {priority.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPriorityFilter('all')}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                      priorityFilter === 'all' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-indigo-400" />
                    All Priorities
                  </button>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-9 space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowBulkMenu((prev) => !prev)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Bulk Actions
                      <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showBulkMenu && (
                      <div className="absolute left-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                        <button
                          type="button"
                          onClick={handleBulkImportant}
                          disabled={selectedIds.length === 0}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Mark Important
                        </button>
                        <button
                          type="button"
                          onClick={handleBulkDelete}
                          disabled={selectedIds.length === 0}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Delete Selected
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedIds([])}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Clear Selection
                        </button>
                      </div>
                    )}
                  </div>
                  {selectedIds.length > 0 && (
                    <span className="text-sm text-gray-500">{selectedIds.length} selected</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportNotes}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-8m0 0l-3 3m3-3l3 3m-6 5h6a2 2 0 002-2V7a2 2 0 00-2-2h-6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateNote}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                  >
                    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Note
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  {listFilter === 'important' ? 'Important Notes' : listFilter === 'trash' ? 'Trash' : 'Notes'}
                </h2>
                <span className="text-sm text-gray-500">{visibleNotes.length} items</span>
              </div>

              {loading && notes.length === 0 ? (
                renderSkeleton()
              ) : visibleNotes.length === 0 ? (
                renderEmptyState()
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {visibleNotes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      author={getAuthor(note)}
                      onClick={handleNoteClick}
                      onEdit={() => handleEditNote(note)}
                      onDelete={() => handleDeleteNote(note)}
                      onToggleImportant={handleToggleImportant}
                      canEditOrDelete={canEditOrDelete(note)}
                      isSelected={selectedNote?.id === note.id}
                      isChecked={selectedIds.includes(note.id)}
                      isSelectable={true}
                      isImportant={isImportantTag(note)}
                    />
                  ))}

                  {/* Infinite scroll trigger */}
                  <div ref={observerRef} className="h-4" />

                  {/* Loading indicator for infinite scroll */}
                  {loading && notes.length > 0 && (
                    <div className="flex justify-center py-4 col-span-full">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Notes Drawer */}
          {showDrawer && (
            <NotesDrawer
              note={editingNote}
              onSuccess={handleDrawerSubmit}
              onCancel={handleCloseDrawer}
              isLoading={loading}
            />
          )}

          {/* Delete Confirmation Modal */}
          {deleteConfirm && (
            <div className="fixed inset-0 bg-gray-900 bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Delete Note
                </h3>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to delete &quot;{deleteConfirm.title}&quot;? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error Toast */}
          {error && (
            <div className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg z-50">
              {error}
            </div>
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default NotesPage;
