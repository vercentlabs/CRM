-- Script to add a trigger that prevents orphaned notes
-- Run this in pgAdmin Query Tool

-- Create a function to get the first active user ID
CREATE OR REPLACE FUNCTION get_first_active_user_id()
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT id FROM users 
        WHERE is_active = TRUE 
        ORDER BY id 
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql;

-- Create a trigger function to validate and fix created_by before insert/update
CREATE OR REPLACE FUNCTION validate_note_author()
RETURNS TRIGGER AS $$
BEGIN
    -- If created_by is NULL or doesn't exist in users table, assign to first active user
    IF NEW.created_by IS NULL OR NOT EXISTS (
        SELECT 1 FROM users WHERE id = NEW.created_by
    ) THEN
        NEW.created_by := get_first_active_user_id();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS validate_note_author_trigger ON notes;

-- Create the trigger
CREATE TRIGGER validate_note_author_trigger
    BEFORE INSERT OR UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION validate_note_author();

-- Verify the trigger is created
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_name = 'validate_note_author_trigger';
