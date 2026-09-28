-- Script to fix notes with invalid user references
-- Run this in pgAdmin Query Tool

-- First, let's see which notes have invalid user references
SELECT 
    n.id as note_id,
    n.title,
    n.created_by as invalid_user_id,
    n.created_at
FROM notes n
LEFT JOIN users u ON n.created_by = u.id
WHERE u.id IS NULL AND n.is_deleted = FALSE;

-- Check available users to assign notes to
SELECT id, full_name, email 
FROM users 
WHERE is_active = TRUE
ORDER BY id;

-- Replace USER_ID_HERE with the ID of the user you want to assign orphaned notes to
-- Get the first active user ID from the query above
-- Then run one of these UPDATE statements:

-- Option 1: Assign all orphaned notes to a specific user (replace USER_ID_HERE)
-- UPDATE notes 
-- SET created_by = USER_ID_HERE 
-- WHERE created_by NOT IN (SELECT id FROM users);

-- Option 2: Assign orphaned notes to the first active user
UPDATE notes 
SET created_by = (SELECT id FROM users WHERE is_active = TRUE ORDER BY id LIMIT 1)
WHERE created_by NOT IN (SELECT id FROM users);

-- Verify the fix
SELECT 
    n.id as note_id,
    n.title,
    u.full_name as author_name,
    u.email as author_email
FROM notes n
LEFT JOIN users u ON n.created_by = u.id
WHERE n.is_deleted = FALSE
ORDER BY n.updated_at DESC;
