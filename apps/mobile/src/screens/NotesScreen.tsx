import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { Button, Card, EmptyState, ErrorState, Input, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { ROLE_ADMIN } from '../config/constants';

type Note = {
  id: number;
  title: string;
  content: string;
  color?: string | null;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  created_by?: number | null;
  author_name?: string | null;
  author_email?: string | null;
};

type NotesResponse = {
  notes?: Note[];
  page?: number;
  pageSize?: number;
  total?: number;
  hasMore?: boolean;
};

type FormState = {
  title: string;
  content: string;
  color: string;
  tags: string;
};

const DATE_RANGE_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: '7d', value: '7' },
  { label: '30d', value: '30' },
  { label: '90d', value: '90' },
  { label: '365d', value: '365' }
];

const LIST_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Important', value: 'important' }
];

const PRIORITY_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' }
];

const FORM_PRIORITY_OPTIONS = [
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' }
];

const emptyForm: FormState = {
  title: '',
  content: '',
  color: 'blue',
  tags: ''
};

const buildDateRangeParam = (value: string) => {
  if (value === 'all') return null;
  const days = Number(value);
  if (Number.isNaN(days) || days <= 0) return null;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return JSON.stringify({ start: start.toISOString(), end: end.toISOString() });
};

const isImportantTag = (note: Note) =>
  (note.tags || []).some((tag) => String(tag).toLowerCase() === 'important');

const mapColorToPriority = (color?: string | null) => {
  switch (color) {
    case 'red':
      return 'high';
    case 'yellow':
      return 'medium';
    case 'green':
      return 'low';
    default:
      return 'normal';
  }
};

const mapPriorityToColor = (priority: string) => {
  switch (priority) {
    case 'high':
      return 'red';
    case 'medium':
      return 'yellow';
    case 'low':
      return 'green';
    default:
      return 'blue';
  }
};

const NotesScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('all');
  const [authorFilter, setAuthorFilter] = useState('all');
  const [listFilter, setListFilter] = useState<'all' | 'important'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>(
    'all'
  );
  const [showListPicker, setShowListPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAuthorPicker, setShowAuthorPicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showFormPriorityPicker, setShowFormPriorityPicker] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const canEdit = useCallback(
    (note: Note) => {
      if (!user) return false;
      if (user.roleId === ROLE_ADMIN) return true;
      return note.created_by === user.id;
    },
    [user]
  );

  const loadNotes = useCallback(
    async (pageNumber = 1, append = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('page', String(pageNumber));
        params.set('pageSize', '12');
        if (authorFilter !== 'all') params.set('author', authorFilter);
        const dateRangeParam = buildDateRangeParam(dateRange);
        if (dateRangeParam) {
          params.set('dateRange', dateRangeParam);
        }

        const data = await apiRequest<NotesResponse>(`/notes?${params.toString()}`);
        const nextNotes = data.notes || [];
        setNotes((prev) => (append ? [...prev, ...nextNotes] : nextNotes));
        setPage(data.page || pageNumber);
        setHasMore(Boolean(data.hasMore));
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError.message || 'Failed to load notes.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [dateRange, authorFilter]
  );

  useEffect(() => {
    void loadNotes(1);
  }, [loadNotes]);

  const uniqueTags = useMemo(() => {
    const tags = new Set<string>();
    notes.forEach((note) => {
      (note.tags || []).forEach((tag) => tags.add(tag));
    });
    return Array.from(tags);
  }, [notes]);

  const authors = useMemo(() => {
    const map = new Map<number, { id: number; label: string }>();
    notes.forEach((note) => {
      if (!note.created_by) return;
      if (map.has(note.created_by)) return;
      const label = note.author_name || note.author_email || `User ${note.created_by}`;
      map.set(note.created_by, { id: note.created_by, label });
    });
    return Array.from(map.values());
  }, [notes]);

  const listLabel =
    LIST_FILTERS.find((item) => item.value === listFilter)?.label || 'All';
  const dateLabel =
    DATE_RANGE_OPTIONS.find((item) => item.value === dateRange)?.label || 'All';
  const authorLabel =
    authorFilter === 'all'
      ? authors.length
        ? 'All Authors'
        : 'No Authors'
      : authors.find((author) => String(author.id) === authorFilter)?.label || 'Selected';
  const tagLabel =
    tagFilter || (uniqueTags.length ? 'All Tags' : 'No Tags');
  const priorityLabel =
    PRIORITY_FILTERS.find((item) => item.value === priorityFilter)?.label || 'All';
  const formPriorityValue = mapColorToPriority(form.color);
  const formPriorityLabel =
    FORM_PRIORITY_OPTIONS.find((item) => item.value === formPriorityValue)?.label || 'Normal';

  const handleResetFilters = () => {
    setListFilter('all');
    setDateRange('all');
    setAuthorFilter('all');
    setTagFilter(null);
    setPriorityFilter('all');
  };

  const visibleNotes = useMemo(() => {
    let filtered = notes;

    if (tagFilter) {
      filtered = filtered.filter((note) => (note.tags || []).includes(tagFilter));
    }

    if (listFilter === 'important') {
      filtered = filtered.filter((note) => isImportantTag(note));
    }

    if (priorityFilter !== 'all') {
      filtered = filtered.filter(
        (note) => mapColorToPriority(note.color) === priorityFilter
      );
    }

    if (authorFilter !== 'all') {
      filtered = filtered.filter(
        (note) => String(note.created_by || '') === authorFilter
      );
    }

    return filtered;
  }, [notes, tagFilter, listFilter, priorityFilter, authorFilter]);

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => visibleNotes.some((note) => note.id === id))
    );
  }, [visibleNotes]);

  const updateForm = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
  };

  const handleOpenForm = (note?: Note) => {
    if (note) {
      setEditingId(note.id);
      setForm({
        title: note.title,
        content: note.content,
        color: note.color || 'blue',
        tags: (note.tags || []).join(', ')
      });
    } else {
      resetForm();
    }
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setFormError('Title and content are required.');
      return;
    }
    setSaving(true);
    setFormError(null);

    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      color: form.color,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    };

    try {
      if (editingId) {
        await apiRequest(`/notes/${editingId}`, { method: 'PUT', body: payload });
      } else {
        await apiRequest('/notes', { method: 'POST', body: payload });
      }
      setShowForm(false);
      resetForm();
      await loadNotes(1);
    } catch (err) {
      const apiError = err as ApiError;
      setFormError(apiError.message || 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (note: Note) => {
    if (!canEdit(note)) return;
    try {
      await apiRequest(`/notes/${note.id}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((item) => item.id !== note.id));
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to delete note.');
    }
  };

  const handleToggleImportant = async (note: Note) => {
    if (!canEdit(note)) return;
    const currentTags = note.tags || [];
    const hasImportant = isImportantTag(note);
    const updatedTags = hasImportant
      ? currentTags.filter((tag) => String(tag).toLowerCase() !== 'important')
      : [...currentTags, 'Important'];

    try {
      await apiRequest(`/notes/${note.id}`, { method: 'PUT', body: { tags: updatedTags } });
      setNotes((prev) =>
        prev.map((item) => (item.id === note.id ? { ...item, tags: updatedTags } : item))
      );
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to update note tags.');
    }
  };

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedIds([]);
        setBulkError(null);
      }
      return !prev;
    });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkImportant = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    setBulkError(null);

    try {
      const updates = await Promise.all(
        visibleNotes
          .filter((note) => selectedIds.includes(note.id) && canEdit(note))
          .map(async (note) => {
            const currentTags = note.tags || [];
            const updatedTags = isImportantTag(note)
              ? currentTags
              : [...currentTags, 'Important'];
            await apiRequest(`/notes/${note.id}`, { method: 'PUT', body: { tags: updatedTags } });
            return { id: note.id, tags: updatedTags };
          })
      );

      setNotes((prev) =>
        prev.map((item) => {
          const update = updates.find((u) => u.id === item.id);
          return update ? { ...item, tags: update.tags } : item;
        })
      );
      setSelectedIds([]);
      setSelectionMode(false);
    } catch (err) {
      setBulkError('Failed to update selected notes.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    setBulkError(null);

    try {
      const deletable = visibleNotes.filter(
        (note) => selectedIds.includes(note.id) && canEdit(note)
      );
      await Promise.all(
        deletable.map((note) => apiRequest(`/notes/${note.id}`, { method: 'DELETE' }))
      );
      setNotes((prev) => prev.filter((note) => !selectedIds.includes(note.id)));
      setSelectedIds([]);
      setSelectionMode(false);
    } catch (err) {
      setBulkError('Failed to delete selected notes.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const rows = [['Title', 'Content', 'Tags', 'Updated At', 'Author']];
      visibleNotes.forEach((note) => {
        rows.push([
          note.title || '',
          note.content || '',
          (note.tags || []).join(', '),
          note.updated_at || note.created_at || '',
          note.author_name || note.author_email || ''
        ]);
      });
      const csv = rows
        .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      await Share.share({ message: csv, title: 'Notes Export' });
    } catch (err) {
      setExportError('Failed to export notes.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search notes..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Notes</Text>
                <Text style={styles.heroSubtitle}>Capture key details and follow-ups</Text>
                <View style={styles.heroChip}>
                  <Feather name="file-text" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{notes.length} Notes</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable style={styles.heroButton} onPress={() => loadNotes(1)}>
                  <Feather name="refresh-cw" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>Refresh</Text>
                </Pressable>
                <Pressable style={styles.heroButton} onPress={handleExport} disabled={exporting}>
                  <Feather name="download" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>
                    {exporting ? 'Exporting' : 'Export'}
                  </Text>
                </Pressable>
                <Pressable style={styles.heroPrimaryButton} onPress={() => handleOpenForm()}>
                  <Feather name="plus" size={12} color="#4f46e5" />
                  <Text style={styles.heroPrimaryText}>Add Note</Text>
                </Pressable>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.filterCard}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filters</Text>
              <Pressable style={styles.filterReset} onPress={handleResetFilters}>
                <Text style={styles.filterResetText}>Reset</Text>
              </Pressable>
            </View>
            <View style={styles.filterGrid}>
              <Pressable
                style={styles.filterItem}
                onPress={() => setShowListPicker(true)}
              >
                <Text style={styles.filterItemLabel}>List</Text>
                <View style={styles.filterItemValueRow}>
                  <Text style={styles.filterItemValue}>{listLabel}</Text>
                  <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
                </View>
              </Pressable>

              <Pressable
                style={styles.filterItem}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.filterItemLabel}>Date Range</Text>
                <View style={styles.filterItemValueRow}>
                  <Text style={styles.filterItemValue}>{dateLabel}</Text>
                  <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
                </View>
              </Pressable>

              <Pressable
                style={[styles.filterItem, authors.length === 0 && styles.filterItemDisabled]}
                onPress={() => setShowAuthorPicker(true)}
                disabled={authors.length === 0}
              >
                <Text style={styles.filterItemLabel}>Author</Text>
                <View style={styles.filterItemValueRow}>
                  <Text style={styles.filterItemValue}>{authorLabel}</Text>
                  <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
                </View>
              </Pressable>

              <Pressable
                style={[styles.filterItem, uniqueTags.length === 0 && styles.filterItemDisabled]}
                onPress={() => setShowTagPicker(true)}
                disabled={uniqueTags.length === 0}
              >
                <Text style={styles.filterItemLabel}>Tags</Text>
                <View style={styles.filterItemValueRow}>
                  <Text style={styles.filterItemValue}>{tagLabel}</Text>
                  <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
                </View>
              </Pressable>

              <Pressable
                style={styles.filterItem}
                onPress={() => setShowPriorityPicker(true)}
              >
                <Text style={styles.filterItemLabel}>Priority</Text>
                <View style={styles.filterItemValueRow}>
                  <Text style={styles.filterItemValue}>{priorityLabel}</Text>
                  <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
                </View>
              </Pressable>
            </View>

            {exportError ? <Text style={styles.inlineError}>{exportError}</Text> : null}
          </View>

          {showForm ? (
            <Modal
              visible={showForm}
              animationType="slide"
              onRequestClose={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              <LinearGradient
                colors={colors.screenGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalContainer}
              >
                <SafeAreaView style={styles.modalSafeArea}>
                  <View style={styles.formHeader}>
                    <Pressable
                      style={styles.backButton}
                      onPress={() => {
                        setShowForm(false);
                        resetForm();
                      }}
                    >
                      <Feather name="chevron-left" size={20} color={colors.foreground} />
                    </Pressable>
                    <View style={styles.headerTitles}>
                      <Text style={styles.headerTitle}>
                        {editingId ? 'Edit Note' : 'Add Note'}
                      </Text>
                      <Text style={styles.headerSubtitle}>
                        {editingId ? 'Update your note details' : 'Capture a new note quickly'}
                      </Text>
                    </View>
                  </View>

                  <ScrollView contentContainerStyle={styles.formContent}>
                    {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

                    <Card style={styles.formCard}>
                      <Text style={styles.formSectionTitle}>Note Details</Text>
                      <Input
                        label="Title *"
                        value={form.title}
                        onChangeText={(value) => updateForm('title', value)}
                      />
                      <Input
                        label="Content *"
                        value={form.content}
                        onChangeText={(value) => updateForm('content', value)}
                        multiline
                        style={styles.multilineInput}
                      />
                    </Card>

                    <Card style={styles.formCard}>
                      <Text style={styles.formSectionTitle}>Tags & Priority</Text>
                      <Input
                        label="Tags (comma separated)"
                        value={form.tags}
                        onChangeText={(value) => updateForm('tags', value)}
                      />
                      <Text style={styles.formLabel}>Priority</Text>
                      <Pressable
                        style={styles.selector}
                        onPress={() => setShowFormPriorityPicker(true)}
                      >
                        <Text style={styles.selectorText}>{formPriorityLabel}</Text>
                        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    </Card>

                    <View style={styles.formActions}>
                      <Button
                        label="Cancel"
                        variant="secondary"
                        onPress={() => {
                          setShowForm(false);
                          resetForm();
                        }}
                        style={styles.formButton}
                      />
                      <Button
                        label={saving ? 'Saving...' : 'Save'}
                        onPress={handleSave}
                        loading={saving}
                        disabled={saving}
                        style={styles.formButton}
                      />
                    </View>
                  </ScrollView>

                  {showFormPriorityPicker ? (
                    <View style={styles.overlay}>
                      <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                          <Text style={styles.modalTitle}>Priority</Text>
                          <Pressable onPress={() => setShowFormPriorityPicker(false)}>
                            <Feather name="x" size={18} color={colors.foreground} />
                          </Pressable>
                        </View>
                        <ScrollView style={styles.modalList}>
                          {FORM_PRIORITY_OPTIONS.map((option) => (
                            <Pressable
                              key={option.value}
                              style={styles.modalRow}
                              onPress={() => {
                                updateForm('color', mapPriorityToColor(option.value));
                                setShowFormPriorityPicker(false);
                              }}
                            >
                              <Text style={styles.modalText}>{option.label}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    </View>
                  ) : null}
                </SafeAreaView>
              </LinearGradient>
            </Modal>
          ) : null}

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Your Notes</Text>
              <Pressable style={styles.selectToggle} onPress={toggleSelectionMode}>
                <Feather
                  name={selectionMode ? 'x' : 'check-square'}
                  size={14}
                  color="#cbd5f5"
                />
                <Text style={styles.selectToggleText}>{selectionMode ? 'Done' : 'Select'}</Text>
              </Pressable>
            </View>

            {selectionMode ? (
              <View style={styles.bulkBar}>
                <Text style={styles.bulkCount}>{selectedIds.length} selected</Text>
                <View style={styles.bulkActions}>
                  <Button
                    label={bulkLoading ? 'Updating...' : 'Important'}
                    size="sm"
                    onPress={handleBulkImportant}
                    disabled={bulkLoading || selectedIds.length === 0}
                  />
                  <Button
                    label={bulkLoading ? 'Deleting...' : 'Delete'}
                    variant="danger"
                    size="sm"
                    onPress={handleBulkDelete}
                    disabled={bulkLoading || selectedIds.length === 0}
                  />
                  <Button
                    label="Clear"
                    variant="secondary"
                    size="sm"
                    onPress={() => setSelectedIds([])}
                    disabled={selectedIds.length === 0}
                  />
                </View>
                {bulkError ? <Text style={styles.inlineError}>{bulkError}</Text> : null}
              </View>
            ) : null}

            {loading ? (
              <LoadingState label="Loading notes..." />
            ) : error ? (
              <ErrorState title="Unable to load notes" message={error} onAction={() => loadNotes(1)} />
            ) : visibleNotes.length === 0 ? (
              <EmptyState title="No notes yet" message="Add a note to start tracking details." />
            ) : (
              visibleNotes.map((note) => {
                const selected = selectedIds.includes(note.id);
                const important = isImportantTag(note);
                return (
                  <Pressable
                    key={note.id}
                    style={[styles.noteCard, selected && styles.noteCardSelected]}
                    onPress={() => {
                      if (selectionMode) {
                        toggleSelect(note.id);
                      }
                    }}
                    onLongPress={() => {
                      if (!selectionMode) {
                        setSelectionMode(true);
                        setSelectedIds([note.id]);
                      }
                    }}
                  >
                    <View style={styles.noteHeader}>
                      <View style={styles.noteTitleRow}>
                        {selectionMode ? (
                          <Pressable
                            style={styles.selectIndicator}
                            onPress={() => toggleSelect(note.id)}
                          >
                            <Feather
                              name={selected ? 'check-circle' : 'circle'}
                              size={16}
                              color={selected ? '#5b3bff' : '#6f7896'}
                            />
                          </Pressable>
                        ) : null}
                        <Text style={styles.noteTitle}>{note.title}</Text>
                        <View style={[styles.noteDot, { backgroundColor: mapNoteColor(note.color) }]} />
                      </View>
                      <Text style={styles.noteMeta}>
                        {note.author_name || note.author_email || 'Unknown'}
                      </Text>
                    </View>
                    <Text style={styles.noteContent}>{note.content}</Text>
                    <View style={styles.noteTagsRow}>
                      {(note.tags || []).map((tag) => (
                        <View key={tag} style={styles.noteTag}>
                          <Text style={styles.noteTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                    {canEdit(note) ? (
                      <View style={styles.noteActions}>
                        <Pressable style={styles.iconButton} onPress={() => handleToggleImportant(note)}>
                          <Feather name="star" size={14} color={important ? '#fbbf24' : '#cbd5f5'} />
                        </Pressable>
                        <Pressable style={styles.iconButton} onPress={() => handleOpenForm(note)}>
                          <Feather name="edit" size={14} color="#cbd5f5" />
                        </Pressable>
                        <Pressable style={styles.iconButton} onPress={() => handleDelete(note)}>
                          <Feather name="trash" size={14} color="#f87171" />
                        </Pressable>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })
            )}
            {hasMore && !loading ? (
              <Button
                label={loadingMore ? 'Loading...' : 'Load More'}
                onPress={() => loadNotes(page + 1, true)}
                loading={loadingMore}
                disabled={loadingMore}
                style={styles.loadMore}
              />
            ) : null}
          </View>
        </ScrollView>

        {showListPicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>List</Text>
                <Pressable onPress={() => setShowListPicker(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                {LIST_FILTERS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={styles.modalRow}
                    onPress={() => {
                      setListFilter(option.value as 'all' | 'important');
                      setShowListPicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>{option.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}

        {showDatePicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Date Range</Text>
                <Pressable onPress={() => setShowDatePicker(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                {DATE_RANGE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={styles.modalRow}
                    onPress={() => {
                      setDateRange(option.value);
                      setShowDatePicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>{option.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}

        {showAuthorPicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Author</Text>
                <Pressable onPress={() => setShowAuthorPicker(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setAuthorFilter('all');
                    setShowAuthorPicker(false);
                  }}
                >
                  <Text style={styles.modalText}>All Authors</Text>
                </Pressable>
                {authors.length === 0 ? (
                  <Text style={styles.modalEmpty}>No authors available</Text>
                ) : (
                  authors.map((author) => (
                    <Pressable
                      key={author.id}
                      style={styles.modalRow}
                      onPress={() => {
                        setAuthorFilter(String(author.id));
                        setShowAuthorPicker(false);
                      }}
                    >
                      <Text style={styles.modalText}>{author.label}</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        ) : null}

        {showTagPicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Tags</Text>
                <Pressable onPress={() => setShowTagPicker(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setTagFilter(null);
                    setShowTagPicker(false);
                  }}
                >
                  <Text style={styles.modalText}>All Tags</Text>
                </Pressable>
                {uniqueTags.length === 0 ? (
                  <Text style={styles.modalEmpty}>No tags yet</Text>
                ) : (
                  uniqueTags.map((tag) => (
                    <Pressable
                      key={tag}
                      style={styles.modalRow}
                      onPress={() => {
                        setTagFilter(tag);
                        setShowTagPicker(false);
                      }}
                    >
                      <Text style={styles.modalText}>{tag}</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        ) : null}

        {showPriorityPicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Priority</Text>
                <Pressable onPress={() => setShowPriorityPicker(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                {PRIORITY_FILTERS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={styles.modalRow}
                    onPress={() => {
                      setPriorityFilter(option.value as 'all' | 'high' | 'medium' | 'low');
                      setShowPriorityPicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>{option.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  );
};

const mapNoteColor = (color?: string | null) => {
  switch (color) {
    case 'red':
      return '#f87171';
    case 'yellow':
      return '#fbbf24';
    case 'green':
      return '#34d399';
    case 'purple':
      return '#a78bfa';
    default:
      return '#60a5fa';
  }
};

export default NotesScreen;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24
  },
  heroCard: {
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
    marginBottom: 16
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  heroText: {
    flex: 1
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700'
  },
  heroSubtitle: {
    color: '#e0e7ff',
    fontSize: 12,
    marginTop: 4
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.2)'
  },
  heroChipText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600'
  },
  heroActions: {
    gap: 6
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)'
  },
  heroButtonText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600'
  },
  heroPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#ffffff'
  },
  heroPrimaryText: {
    color: '#4f46e5',
    fontSize: 10,
    fontWeight: '700'
  },
  filterCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  filterTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '600'
  },
  filterReset: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg
  },
  filterResetText: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600'
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  filterItem: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  filterItemDisabled: {
    opacity: 0.6
  },
  filterItemLabel: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6
  },
  filterItemValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  filterItemValue: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg
  },
  selectorText: {
    color: colors.foreground,
    fontSize: 12
  },
  inlineError: {
    color: colors.destructive,
    fontSize: 11,
    marginTop: 8
  },
  modalContainer: {
    flex: 1
  },
  modalSafeArea: {
    flex: 1
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card
  },
  headerTitles: {
    flex: 1
  },
  headerTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600'
  },
  headerSubtitle: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 2
  },
  formContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16
  },
  formSectionTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600'
  },
  formCard: {
    gap: 12
  },
  multilineInput: {
    height: 110,
    textAlignVertical: 'top'
  },
  formLabel: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600'
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  modalTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600'
  },
  modalList: {
    maxHeight: 320
  },
  modalRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  modalText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  modalEmpty: {
    color: colors.mutedForeground,
    fontSize: 12,
    paddingVertical: 12,
    textAlign: 'center'
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end'
  },
  formButton: {
    minWidth: 140
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600'
  },
  selectToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border
  },
  selectToggleText: {
    color: '#cbd5f5',
    fontSize: 10,
    fontWeight: '600'
  },
  bulkBar: {
    marginBottom: 12,
    gap: 8
  },
  bulkCount: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  bulkActions: {
    flexDirection: 'row',
    gap: 8
  },
  noteCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg
  },
  noteCardSelected: {
    borderColor: '#5b3bff',
    backgroundColor: 'rgba(91, 59, 255, 0.12)'
  },
  noteHeader: {
    marginBottom: 8
  },
  noteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  selectIndicator: {
    marginRight: 2
  },
  noteTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700'
  },
  noteDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 'auto'
  },
  noteMeta: {
    color: colors.mutedForeground,
    fontSize: 10,
    marginTop: 4
  },
  noteContent: {
    color: '#cbd5f5',
    fontSize: 12,
    marginBottom: 8
  },
  noteTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  noteTag: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(99, 102, 241, 0.2)'
  },
  noteTagText: {
    color: '#c7d2fe',
    fontSize: 10,
    fontWeight: '600'
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadMore: {
    marginTop: 8
  },
  errorText: {
    color: colors.destructive,
    fontSize: 11
  }
});
