
import pool from '../config/db.js';
import { logAuditEvent } from '../utils/auditLogger.js';

/**
 * Get all notes based on user role
 * @route   GET /notes
 * @desc    Get notes based on user role
 * @access  Private
 */
const getNotes = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    const { page = 1, pageSize = 20, search, dateRange, author, tags } = req.query;
    const offset = (page - 1) * pageSize;
    
    let query = `
      SELECT n.*, u.full_name as author_name, u.email as author_email
      FROM notes n
      LEFT JOIN users u ON n.created_by = u.id
      WHERE n.is_deleted = FALSE
    `;

    let queryParams = [];
    let paramCount = 1;

    // Role-based filtering
    if (role === 3) { // Sales - only their own notes
      query += ` AND n.created_by = $${paramCount}`;
      queryParams.push(userId);
      paramCount++;
    }

    // Search filter
    if (search) {
      query += ` AND (n.title ILIKE $${paramCount} OR n.content ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Author filter
    if (author) {
      query += ` AND n.created_by = $${paramCount}`;
      queryParams.push(author);
      paramCount++;
    }

    // Tags filter
    if (tags && Array.isArray(tags) && tags.length > 0) {
      query += ` AND n.tags && $${paramCount}`;
      queryParams.push(tags);
      paramCount++;
    }

    // Date range filter
    if (dateRange && dateRange !== 'null' && dateRange !== null) {
      try {
        const { start, end } = JSON.parse(dateRange);
        if (start) {
          query += ` AND n.created_at >= $${paramCount}`;
          queryParams.push(start);
          paramCount++;
        }
        if (end) {
          query += ` AND n.created_at <= $${paramCount}`;
          queryParams.push(end);
          paramCount++;
        }
      } catch (e) {
        console.error('Error parsing dateRange:', e);
      }
    }

    // Order by updated_at
    query += ` ORDER BY n.updated_at DESC`;
    
    // Add pagination
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(pageSize, offset);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as count
      FROM notes n
      LEFT JOIN users u ON n.created_by = u.id
      WHERE n.is_deleted = FALSE
    `;
    let countParams = [];
    let countParamCount = 1;

    // Apply same filters to count query
    if (role === 3) {
      countQuery += ` AND n.created_by = $${countParamCount}`;
      countParams.push(userId);
      countParamCount++;
    }
    if (search) {
      countQuery += ` AND (n.title ILIKE $${countParamCount} OR n.content ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
      countParamCount++;
    }
    if (author) {
      countQuery += ` AND n.created_by = $${countParamCount}`;
      countParams.push(author);
      countParamCount++;
    }
    if (tags && Array.isArray(tags) && tags.length > 0) {
      countQuery += ` AND n.tags && $${countParamCount}`;
      countParams.push(tags);
      countParamCount++;
    }

    // Execute both queries
    pool.query(countQuery, countParams, (countError, countResults) => {
      if (countError) {
        return res.status(500).json({
          message: 'Error counting notes',
          error: countError.message
        });
      }

      const total = parseInt(countResults.rows[0].count);
      
      pool.query(query, queryParams, (error, results) => {
        if (error) {
          return res.status(500).json({
            message: 'Error retrieving notes',
            error: error.message
          });
        }

        // Ensure tags are properly serialized as arrays
        const notes = results.rows.map(note => ({
          ...note,
          tags: Array.isArray(note.tags) ? note.tags : []
        }));

        res.status(200).json({
          message: 'Notes retrieved successfully',
          notes,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total,
          hasMore: offset + results.rows.length < total
        });
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get a single note by ID
 * @route   GET /notes/:id
 * @desc    Get a single note by ID
 * @access  Private
 */
const getNoteById = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, roleId: role } = req.user;

    const query = `
      SELECT n.*, u.full_name as author_name, u.email as author_email
      FROM notes n
      LEFT JOIN users u ON n.created_by = u.id
      WHERE n.id = $1 AND n.is_deleted = FALSE
    `;

    pool.query(query, [id], (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error retrieving note',
          error: error.message
        });
      }

      if (results.rows.length === 0) {
        return res.status(404).json({
          message: 'Note not found'
        });
      }

      const note = results.rows[0];

      // Check if user has permission to view this note
      if (role === 3 && note.created_by !== userId) {
        return res.status(403).json({
          message: 'You do not have permission to view this note'
        });
      }

      // Ensure tags are properly serialized as arrays
      const noteWithTags = {
        ...note,
        tags: Array.isArray(note.tags) ? note.tags : []
      };

      res.status(200).json({
        message: 'Note retrieved successfully',
        note: noteWithTags
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Create a new note
 * @route   POST /notes
 * @desc    Create a new note
 * @access  Private
 */
const createNote = async (req, res) => {
  try {
    const { userId, roleId: role, userName } = req.user;
    const { title, content, color, tags } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        message: 'Title and content are required'
      });
    }

    const query = `
      INSERT INTO notes (title, content, color, tags, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;

    const values = [
      title,
      content,
      color || 'blue',
      tags || [],
      userId
    ];

    pool.query(query, values, (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error creating note',
          error: error.message
        });
      }

      const noteId = results.rows[0].id;

      // Log audit event
      logAuditEvent(userId, 'CREATE', 'notes', noteId, `Created note: ${title}`);

      // Fetch the complete note with author information
      const fetchQuery = `
        SELECT n.*, u.full_name as author_name, u.email as author_email
        FROM notes n
        LEFT JOIN users u ON n.created_by = u.id
        WHERE n.id = $1
      `;

      pool.query(fetchQuery, [noteId], (fetchError, fetchResults) => {
        if (fetchError) {
          return res.status(500).json({
            message: 'Error fetching created note',
            error: fetchError.message
          });
        }

        // Ensure tags are properly serialized as arrays
        const noteWithTags = {
          ...fetchResults.rows[0],
          tags: Array.isArray(fetchResults.rows[0].tags) ? fetchResults.rows[0].tags : []
        };

        res.status(201).json({
          message: 'Note created successfully',
          note: noteWithTags
        });
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Update a note
 * @route   PUT /notes/:id
 * @desc    Update a note
 * @access  Private
 */
const updateNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, roleId: role } = req.user;
    const { title, content, color, tags } = req.body;

    // First, check if note exists and user has permission
    const checkQuery = `
      SELECT * FROM notes
      WHERE id = $1 AND is_deleted = FALSE
    `;

    pool.query(checkQuery, [id], (checkError, checkResults) => {
      if (checkError) {
        return res.status(500).json({
          message: 'Error checking note',
          error: checkError.message
        });
      }

      if (checkResults.rows.length === 0) {
        return res.status(404).json({
          message: 'Note not found'
        });
      }

      const note = checkResults.rows[0];

      // Check if user has permission to update this note
      if (role === 3 && note.created_by !== userId) {
        return res.status(403).json({
          message: 'You do not have permission to update this note'
        });
      }

      // Update the note
      const updateQuery = `
        UPDATE notes
        SET title = $1, content = $2, color = $3, tags = $4
        WHERE id = $5
        RETURNING id
      `;

      const values = [
        title || note.title,
        content || note.content,
        color || note.color,
        tags !== undefined ? tags : note.tags,
        id
      ];

      pool.query(updateQuery, values, (updateError, updateResults) => {
        if (updateError) {
          return res.status(500).json({
            message: 'Error updating note',
            error: updateError.message
          });
        }

        // Log audit event
        logAuditEvent(userId, 'UPDATE', 'notes', id, `Updated note: ${title || note.title}`);

        // Fetch the complete note with author information
        const fetchQuery = `
          SELECT n.*, u.full_name as author_name, u.email as author_email
          FROM notes n
          LEFT JOIN users u ON n.created_by = u.id
          WHERE n.id = $1
        `;

        pool.query(fetchQuery, [id], (fetchError, fetchResults) => {
          if (fetchError) {
            return res.status(500).json({
              message: 'Error fetching updated note',
              error: fetchError.message
            });
          }

          // Ensure tags are properly serialized as arrays
          const noteWithTags = {
            ...fetchResults.rows[0],
            tags: Array.isArray(fetchResults.rows[0].tags) ? fetchResults.rows[0].tags : []
          };

          res.status(200).json({
            message: 'Note updated successfully',
            note: noteWithTags
          });
        });
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Delete a note (soft delete)
 * @route   DELETE /notes/:id
 * @desc    Delete a note (soft delete)
 * @access  Private
 */
const deleteNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, roleId: role } = req.user;

    // First, check if note exists and user has permission
    const checkQuery = `
      SELECT * FROM notes
      WHERE id = $1 AND is_deleted = FALSE
    `;

    pool.query(checkQuery, [id], (checkError, checkResults) => {
      if (checkError) {
        return res.status(500).json({
          message: 'Error checking note',
          error: checkError.message
        });
      }

      if (checkResults.rows.length === 0) {
        return res.status(404).json({
          message: 'Note not found'
        });
      }

      const note = checkResults.rows[0];

      // Check if user has permission to delete this note
      if (role === 3 && note.created_by !== userId) {
        return res.status(403).json({
          message: 'You do not have permission to delete this note'
        });
      }

      // Soft delete the note
      const deleteQuery = `
        UPDATE notes
        SET is_deleted = TRUE
        WHERE id = $1
        RETURNING *
      `;

      pool.query(deleteQuery, [id], (deleteError, deleteResults) => {
        if (deleteError) {
          return res.status(500).json({
            message: 'Error deleting note',
            error: deleteError.message
          });
        }

        // Log audit event
        logAuditEvent(userId, 'DELETE', 'notes', id, `Deleted note: ${note.title}`);

        res.status(200).json({
          message: 'Note deleted successfully'
        });
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

export { getNotes, getNoteById, createNote, updateNote, deleteNote };
