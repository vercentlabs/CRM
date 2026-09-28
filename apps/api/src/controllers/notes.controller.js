
import pool from '../config/db.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { parseId, scopeFor, serverError, tenantOf } from '../platform/tenancy.js';

const NOTE_SELECT = `
  SELECT n.*, u.full_name as author_name, u.email as author_email
  FROM notes n
  LEFT JOIN users u ON n.created_by = u.id`;

const withTags = (note) => ({
  ...note,
  tags: Array.isArray(note.tags) ? note.tags : []
});

/**
 * Builds the shared WHERE clause for the list and count queries so they can
 * never drift apart (the pre-Phase-2 version reassigned a `const` count query
 * and threw for every Sales user; it also ignored dateRange in the count).
 */
export const buildNotesFilter = ({ organizationId, userId, ownOnly, search, author, tags, dateRange }) => {
  const conditions = ['n.organization_id = $1', 'n.is_deleted = FALSE'];
  const params = [organizationId];
  const add = (sql, value) => {
    params.push(value);
    conditions.push(sql.replace('?', `$${params.length}`));
  };

  if (ownOnly) add('n.created_by = ?', userId);

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(n.title ILIKE $${params.length} OR n.content ILIKE $${params.length})`);
  }

  if (author) add('n.created_by = ?', parseId(author) ?? 0);

  const tagList = Array.isArray(tags) ? tags : typeof tags === 'string' && tags ? [tags] : [];
  if (tagList.length > 0) add('n.tags && ?', tagList.map(String));

  if (dateRange && dateRange !== 'null') {
    try {
      const { start, end } = typeof dateRange === 'string' ? JSON.parse(dateRange) : dateRange;
      if (start) add('n.created_at >= ?', start);
      if (end) add('n.created_at <= ?', end);
    } catch {
      // Ignore malformed date ranges (historical behaviour).
    }
  }

  return { where: `WHERE ${conditions.join(' AND ')}`, params };
};

/**
 * @route   GET /notes
 * @access  crm.notes.read (own scope: notes I created)
 */
const getNotes = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const { page = 1, pageSize = 20, search, dateRange, author, tags } = req.query;
    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const size = Math.min(Math.max(parseInt(pageSize) || 20, 1), 100);
    const offset = (pageNumber - 1) * size;

    const { where, params } = buildNotesFilter({
      organizationId,
      userId,
      ownOnly: scopeFor(req, 'crm.notes.read') !== 'organization',
      search,
      author,
      tags,
      dateRange
    });

    const [countResults, results] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM notes n ${where}`, params),
      pool.query(
        `${NOTE_SELECT} ${where} ORDER BY n.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, size, offset]
      )
    ]);

    const total = parseInt(countResults.rows[0].count);
    res.status(200).json({
      message: 'Notes retrieved successfully',
      notes: results.rows.map(withTags),
      page: pageNumber,
      pageSize: size,
      total,
      hasMore: offset + results.rows.length < total
    });
  } catch (error) {
    return serverError(res, 'Error retrieving notes', error);
  }
};

/** Loads a live note inside the organization and checks the caller's scope. */
const loadScopedNote = async (req, permission) => {
  const { organizationId, userId } = tenantOf(req);
  const id = parseId(req.params.id);
  if (id === null) return { status: 404 };
  const result = await pool.query(
    `${NOTE_SELECT} WHERE n.id = $1 AND n.organization_id = $2 AND n.is_deleted = FALSE`,
    [id, organizationId]
  );
  const note = result.rows[0];
  if (!note) return { status: 404 };
  if (scopeFor(req, permission) !== 'organization' && note.created_by !== userId) return { status: 403, note };
  return { status: 200, note };
};

/**
 * @route   GET /notes/:id
 * @access  crm.notes.read
 */
const getNoteById = async (req, res) => {
  try {
    const loaded = await loadScopedNote(req, 'crm.notes.read');
    if (loaded.status === 404) return res.status(404).json({ message: 'Note not found' });
    if (loaded.status === 403) {
      return res.status(403).json({ message: 'You do not have permission to view this note' });
    }
    res.status(200).json({
      message: 'Note retrieved successfully',
      note: withTags(loaded.note)
    });
  } catch (error) {
    return serverError(res, 'Error retrieving note', error);
  }
};

/**
 * @route   POST /notes
 * @access  crm.notes.create
 */
const createNote = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const { title, content, color, tags } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        message: 'Title and content are required'
      });
    }

    const inserted = await pool.query(
      `INSERT INTO notes (organization_id, title, content, color, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [organizationId, title, content, color || 'blue', Array.isArray(tags) ? tags.map(String) : [], userId]
    );
    const noteId = inserted.rows[0].id;

    await logAuditEvent(userId, 'CREATE', 'notes', noteId, null, { title });

    const fetched = await pool.query(`${NOTE_SELECT} WHERE n.id = $1 AND n.organization_id = $2`, [noteId, organizationId]);
    res.status(201).json({
      message: 'Note created successfully',
      note: withTags(fetched.rows[0])
    });
  } catch (error) {
    return serverError(res, 'Error creating note', error);
  }
};

/**
 * @route   PUT /notes/:id
 * @access  crm.notes.update (own scope: notes I created)
 */
const updateNote = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const { title, content, color, tags } = req.body;

    const loaded = await loadScopedNote(req, 'crm.notes.update');
    if (loaded.status === 404) return res.status(404).json({ message: 'Note not found' });
    if (loaded.status === 403) {
      return res.status(403).json({ message: 'You do not have permission to update this note' });
    }
    const note = loaded.note;

    await pool.query(
      `UPDATE notes SET title = $1, content = $2, color = $3, tags = $4
       WHERE id = $5 AND organization_id = $6`,
      [
        title || note.title,
        content || note.content,
        color || note.color,
        tags !== undefined ? (Array.isArray(tags) ? tags.map(String) : []) : note.tags,
        note.id,
        organizationId
      ]
    );

    await logAuditEvent(userId, 'UPDATE', 'notes', note.id, { title: note.title }, { title: title || note.title });

    const fetched = await pool.query(`${NOTE_SELECT} WHERE n.id = $1 AND n.organization_id = $2`, [note.id, organizationId]);
    res.status(200).json({
      message: 'Note updated successfully',
      note: withTags(fetched.rows[0])
    });
  } catch (error) {
    return serverError(res, 'Error updating note', error);
  }
};

/**
 * @route   DELETE /notes/:id (soft delete)
 * @access  crm.notes.delete (own scope: notes I created)
 */
const deleteNote = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const loaded = await loadScopedNote(req, 'crm.notes.delete');
    if (loaded.status === 404) return res.status(404).json({ message: 'Note not found' });
    if (loaded.status === 403) {
      return res.status(403).json({ message: 'You do not have permission to delete this note' });
    }

    await pool.query('UPDATE notes SET is_deleted = TRUE WHERE id = $1 AND organization_id = $2', [
      loaded.note.id,
      organizationId
    ]);

    await logAuditEvent(userId, 'DELETE', 'notes', loaded.note.id, { title: loaded.note.title }, null);

    res.status(200).json({
      message: 'Note deleted successfully'
    });
  } catch (error) {
    return serverError(res, 'Error deleting note', error);
  }
};

export { getNotes, getNoteById, createNote, updateNote, deleteNote };
