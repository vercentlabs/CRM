-- Insert Admin User Script
-- Run this in pgAdmin Query Tool

-- First, make sure the Admin role exists (id=1)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM roles WHERE id = 1) THEN
        INSERT INTO roles (id, name, description) VALUES (1, 'Admin', 'System administrator with full access');
    END IF;
END $$;

-- Insert the admin user with default password: Admin@123
INSERT INTO users (
    username,
    email,
    password_hash,
    full_name,
    role_id,
    is_active
) VALUES (
    'admin',
    'atharva.chavan907@gmail.com',
    '$2b$12$smGKqDQ2034PVbJv2yPbhOCxBKw2jJQjSRZVss/XqTlNyyc8QD6u6',
    'System Administrator',
    1,
    true
);

-- Verify the insertion
SELECT id, username, email, full_name, role_id, is_active 
FROM users 
WHERE username = 'admin';
