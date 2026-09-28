
import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import api from '@/lib/api';

// Async thunks (use the shared cookie-session API client; no tokens in JS)
const failure = (error, fallback) =>
  error?.response?.data?.error?.message || error?.response?.data?.message || fallback;

export const fetchNotes = createAsyncThunk(
  'notes/fetchNotes',
  async ({ page = 1, pageSize = 20, filters = {} }, { rejectWithValue }) => {
    try {
      // Filter out null/empty values
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([, value]) =>
          value !== null && value !== undefined && value !== '' &&
          (Array.isArray(value) ? value.length > 0 : true)
        )
      );

      const response = await api.get('/notes', { params: { page, pageSize, ...cleanFilters } });
      return response.data;
    } catch (error) {
      return rejectWithValue(failure(error, 'Failed to fetch notes'));
    }
  }
);

export const createNoteThunk = createAsyncThunk(
  'notes/createNote',
  async (noteData, { rejectWithValue }) => {
    try {
      const response = await api.post('/notes', noteData);
      return response.data.note || response.data;
    } catch (error) {
      return rejectWithValue(failure(error, 'Failed to create note'));
    }
  }
);

export const updateNoteThunk = createAsyncThunk(
  'notes/updateNote',
  async ({ id, ...noteData }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/notes/${id}`, noteData);
      return response.data.note || response.data;
    } catch (error) {
      return rejectWithValue(failure(error, 'Failed to update note'));
    }
  }
);

export const deleteNoteThunk = createAsyncThunk(
  'notes/deleteNote',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/notes/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(failure(error, 'Failed to delete note'));
    }
  }
);

// Initial state
const initialState = {
  notes: [],
  selectedNote: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true
  },
  filters: {
    search: '',
    dateRange: null,
    author: null,
    tags: []
  }
};

// Notes slice
const notesSlice = createSlice({
  name: 'notes',
  initialState,
  reducers: {
    setSelectedNote: (state, action) => {
      state.selectedNote = action.payload;
    },
    clearSelectedNote: (state) => {
      state.selectedNote = null;
    },
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters: (state) => {
      state.filters = initialState.filters;
    },
    resetNotes: (state) => {
      state.notes = [];
      state.pagination = initialState.pagination;
    },
    // Optimistic updates
    optimisticCreateNote: (state, action) => {
      const tempId = `temp-${Date.now()}`;
      const optimisticNote = {
        ...action.payload,
        id: tempId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        isOptimistic: true
      };
      state.notes.unshift(optimisticNote);
      return optimisticNote.id;
    },
    optimisticUpdateNote: (state, action) => {
      const { id, ...updates } = action.payload;
      const index = state.notes.findIndex(note => note.id === id);
      if (index !== -1) {
        state.notes[index] = {
          ...state.notes[index],
          ...updates,
          updated_at: new Date().toISOString(),
          isOptimistic: true
        };
      }
    },
    optimisticDeleteNote: (state, action) => {
      state.notes = state.notes.filter(note => note.id !== action.payload);
    }
  },
  extraReducers: (builder) => {
    // Fetch notes
    builder
      .addCase(fetchNotes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotes.fulfilled, (state, action) => {
        state.loading = false;
        state.notes = action.payload.notes;
        state.pagination = {
          page: action.payload.page || 1,
          pageSize: action.payload.pageSize || 20,
          total: action.payload.total || 0,
          hasMore: action.payload.hasMore !== undefined
            ? action.payload.hasMore
            : action.payload.notes.length >= (action.payload.pageSize || 20)
        };
      })
      .addCase(fetchNotes.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Create note
    builder
      .addCase(createNoteThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createNoteThunk.fulfilled, (state, action) => {
        state.loading = false;
        // Replace optimistic note with real note
        const note = action.payload.note || action.payload;
        const tempId = action.payload.tempId;
        if (tempId) {
          const index = state.notes.findIndex(note => note.id === tempId);
          if (index !== -1) {
            state.notes[index] = note;
          }
        } else {
          state.notes.unshift(note);
        }
        state.pagination.total += 1;
      })
      .addCase(createNoteThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        // Remove optimistic note on error
        state.notes = state.notes.filter(note => !note.isOptimistic);
      });

    // Update note
    builder
      .addCase(updateNoteThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateNoteThunk.fulfilled, (state, action) => {
        state.loading = false;
        // Replace optimistic note with real note
        const index = state.notes.findIndex(note => note.id === action.payload.id);
        if (index !== -1) {
          state.notes[index] = action.payload;
        }
        // Update selected note if it's the one being updated
        if (state.selectedNote?.id === action.payload.id) {
          state.selectedNote = action.payload;
        }
      })
      .addCase(updateNoteThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        // Reload notes to revert optimistic updates
        // This will be handled by the component
      });

    // Delete note
    builder
      .addCase(deleteNoteThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteNoteThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.notes = state.notes.filter(note => note.id !== action.payload);
        state.pagination.total -= 1;
        // Clear selected note if it's the one being deleted
        if (state.selectedNote?.id === action.payload) {
          state.selectedNote = null;
        }
      })
      .addCase(deleteNoteThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        // Reload notes to revert optimistic deletion
        // This will be handled by the component
      });
  }
});

// Export actions
export const {
  setSelectedNote,
  clearSelectedNote,
  setFilters,
  clearFilters,
  resetNotes,
  optimisticCreateNote,
  optimisticUpdateNote,
  optimisticDeleteNote
} = notesSlice.actions;

// Export selectors
export const selectNotes = (state) => state.notes.notes;
export const selectSelectedNote = (state) => state.notes.selectedNote;
export const selectNotesLoading = (state) => state.notes.loading;
export const selectNotesError = (state) => state.notes.error;
export const selectNotesPagination = (state) => state.notes.pagination;
export const selectNotesFilters = (state) => state.notes.filters;

// Memoized selector for filtered notes
export const selectFilteredNotes = createSelector(
  [selectNotes, selectNotesFilters],
  (notes, filters) => {
    return notes.filter(note => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesTitle = note.title?.toLowerCase().includes(searchLower);
        const matchesContent = note.content?.toLowerCase().includes(searchLower);
        if (!matchesTitle && !matchesContent) {
          return false;
        }
      }

      // Date range filter
      if (filters.dateRange) {
        const noteDate = new Date(note.created_at);
        const startDate = new Date(filters.dateRange.start);
        const endDate = new Date(filters.dateRange.end);
        if (noteDate < startDate || noteDate > endDate) {
          return false;
        }
      }

      // Author filter
      if (filters.author && note.created_by !== filters.author) {
        return false;
      }

      // Tags filter
      if (filters.tags && filters.tags.length > 0) {
        const hasAllTags = filters.tags.every(tag =>
          note.tags?.includes(tag)
        );
        if (!hasAllTags) {
          return false;
        }
      }

      return true;
    });
  }
);

// Export reducer
export default notesSlice.reducer;
