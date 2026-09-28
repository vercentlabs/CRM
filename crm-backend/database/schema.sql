-- NOTE:
-- This schema is managed manually via pgAdmin.
-- This file is a reference snapshot of the production schema,
-- not an automated migration script.

-- Roles table
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$'),
    CONSTRAINT users_role_check CHECK (role_id IN (1, 2, 3))
);

-- Sales locations table
CREATE TABLE sales_locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    city VARCHAR(50),
    state VARCHAR(50),
    country VARCHAR(50) DEFAULT 'India',
    pin_code VARCHAR(10),
    contact_phone VARCHAR(20),
    manager_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leads table
CREATE TABLE leads (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    mobile_number VARCHAR(20) NOT NULL,
    alternate_number VARCHAR(20),
    address TEXT,
    city VARCHAR(50),
    state VARCHAR(50),
    pin_code VARCHAR(10),
    source VARCHAR(50),
    status VARCHAR(20) DEFAULT 'New',
    assigned_to INTEGER REFERENCES users(id),
    location_id INTEGER REFERENCES sales_locations(id),
    notes TEXT,
    age INTEGER,
    occupation VARCHAR(100),
    monthly_income DECIMAL(10, 2),
    is_aware_of_digital_gold BOOLEAN DEFAULT false,
    next_call_at TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT leads_status_check CHECK (status IN ('New', 'Contacted', 'Qualified', 'Converted', 'Lost')),
    CONSTRAINT leads_mobile_check CHECK (mobile_number ~ '^[0-9]{10}$'),
    CONSTRAINT leads_age_check CHECK (age >= 18 AND age <= 100)
);

-- Follow-ups table
CREATE TABLE followups (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    assigned_to INTEGER NOT NULL REFERENCES users(id),
    followup_date TIMESTAMP NOT NULL,
    followup_type VARCHAR(50) NOT NULL,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'Pending',
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT followups_status_check CHECK (status IN ('Pending', 'Completed', 'Cancelled')),
    CONSTRAINT followups_type_check CHECK (followup_type IN ('Call', 'Email', 'Meeting', 'SMS', 'WhatsApp')),
    CONSTRAINT followups_date_check CHECK (followup_date >= created_at)
);

-- Calls table
CREATE TABLE calls (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    call_status VARCHAR(20) NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_seconds INTEGER,
    notes TEXT,
    outcome VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    plivo_call_uuid VARCHAR(255),
    recording_url TEXT,
    recording_id VARCHAR(255),
    CONSTRAINT calls_status_check CHECK (call_status IN ('Scheduled', 'Completed', 'Missed', 'Cancelled')),
    CONSTRAINT calls_time_check CHECK (end_time IS NULL OR end_time >= start_time),
    CONSTRAINT calls_duration_check CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
);

-- Messages table
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    message_type VARCHAR(20) NOT NULL, -- SMS, Email, WhatsApp
    subject VARCHAR(100),
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Sent', -- Sent, Delivered, Failed
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT messages_type_check CHECK (message_type IN ('SMS', 'Email', 'WhatsApp')),
    CONSTRAINT messages_status_check CHECK (status IN ('Sent', 'Delivered', 'Failed'))
);

-- Audit logs table
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Password resets table
CREATE TABLE password_resets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User locations table (for tracking sales executives)
CREATE TABLE user_locations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    address TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_location_unique UNIQUE (user_id)
);

-- Create opportunities table
CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  value DECIMAL(12, 2),
  stage VARCHAR(50) DEFAULT 'Prospecting' CHECK (stage IN ('Prospecting', 'Qualification', 'Needs Analysis', 'Value Proposition', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost')),
  probability INTEGER CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER NOT NULL REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id)
);

-- Create index on lead_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_opportunities_lead_id ON opportunities(lead_id);

-- Create index on assigned_to for faster lookups
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned_to ON opportunities(assigned_to);

-- Create index on stage for filtering
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_opportunities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Check if trigger exists before creating it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_opportunities_updated_at' 
        AND tgrelid = 'opportunities'::regclass
    ) THEN
        CREATE TRIGGER update_opportunities_updated_at
        BEFORE UPDATE ON opportunities
        FOR EACH ROW
        EXECUTE FUNCTION update_opportunities_updated_at();
    END IF;
END $$;


-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    address TEXT,
    assigned_to INTEGER REFERENCES users(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- Create index on assigned_to for filtering by assigned user
CREATE INDEX IF NOT EXISTS idx_customers_assigned_to ON customers(assigned_to);


-- Insert default roles
INSERT INTO roles (name, description) VALUES 
('Admin', 'System administrator with full access'),
('Manager', 'Manager with access to reports and team management'),
('Sales', 'Sales executive with access to leads and follow-ups');

-- Create triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at columns
-- Check if trigger exists before creating it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_users_updated_at'
        AND tgrelid = 'users'::regclass
    ) THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_leads_updated_at'
        AND tgrelid = 'leads'::regclass
    ) THEN
        CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_followups_updated_at'
        AND tgrelid = 'followups'::regclass
    ) THEN
        CREATE TRIGGER update_followups_updated_at BEFORE UPDATE ON followups
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_calls_updated_at'
        AND tgrelid = 'calls'::regclass
    ) THEN
        CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Create trigger to automatically set completed_at when followup status changes to 'Completed'
CREATE OR REPLACE FUNCTION set_followup_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status != 'Completed' AND NEW.status = 'Completed' THEN
        NEW.completed_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Check if trigger exists before creating it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'set_followup_completed_at_trigger'
        AND tgrelid = 'followups'::regclass
    ) THEN
        CREATE TRIGGER set_followup_completed_at_trigger BEFORE UPDATE ON followups
            FOR EACH ROW EXECUTE FUNCTION set_followup_completed_at();
    END IF;
END $$;

-- Create views for common queries
-- Lead summary view with user and location details
CREATE VIEW lead_summary AS
SELECT 
    l.id,
    l.full_name,
    l.email,
    l.mobile_number,
    l.status,
    l.created_at,
    u.full_name as assigned_to_name,
    sl.name as location_name,
    COUNT(f.id) as followup_count,
    MAX(f.followup_date) as last_followup_date
FROM leads l
LEFT JOIN users u ON l.assigned_to = u.id
LEFT JOIN sales_locations sl ON l.location_id = sl.id
LEFT JOIN followups f ON l.id = f.lead_id
GROUP BY l.id, u.full_name, sl.name;

-- Follow-up summary view with lead details
CREATE VIEW followup_summary AS
SELECT 
    f.id,
    f.followup_date,
    f.followup_type,
    f.status,
    f.notes,
    l.full_name as lead_name,
    l.mobile_number as lead_mobile,
    u.full_name as assigned_to_name
FROM followups f
JOIN leads l ON f.lead_id = l.id
JOIN users u ON f.assigned_to = u.id;

-- User performance view
CREATE VIEW user_performance AS
SELECT 
    u.id,
    u.full_name,
    COUNT(DISTINCT l.id) as total_leads,
    COUNT(DISTINCT CASE WHEN l.status = 'Converted' THEN l.id END) as converted_leads,
    COUNT(DISTINCT f.id) as total_followups,
    COUNT(DISTINCT CASE WHEN f.status = 'Completed' THEN f.id END) as completed_followups
FROM users u
LEFT JOIN leads l ON u.id = l.assigned_to
LEFT JOIN followups f ON l.id = f.lead_id
GROUP BY u.id, u.full_name;

-- Create useful functions
-- Function to get leads with upcoming followups
CREATE OR REPLACE FUNCTION get_upcoming_followups(days_ahead INTEGER DEFAULT 1)
RETURNS TABLE (
    lead_id INTEGER,
    lead_name VARCHAR,
    lead_mobile VARCHAR,
    followup_id INTEGER,
    followup_date TIMESTAMP,
    followup_type VARCHAR,
    assigned_to_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.full_name,
        l.mobile_number,
        f.id,
        f.followup_date,
        f.followup_type,
        u.full_name
    FROM followups f
    JOIN leads l ON f.lead_id = l.id
    JOIN users u ON f.assigned_to = u.id
    WHERE f.status = 'Pending'
    AND f.followup_date BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + (days_ahead || ' days')::INTERVAL
    ORDER BY f.followup_date;
END;
$$ LANGUAGE plpgsql;

-- Function to get lead conversion rate for a date range
CREATE OR REPLACE FUNCTION get_conversion_rate(start_date DATE, end_date DATE)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    total_leads INTEGER;
    converted_leads INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_leads
    FROM leads
    WHERE created_at BETWEEN start_date AND end_date + INTERVAL '1 day';

    SELECT COUNT(*) INTO converted_leads
    FROM leads
    WHERE created_at BETWEEN start_date AND end_date + INTERVAL '1 day'
    AND status = 'Converted';

    RETURN CASE WHEN total_leads > 0 
        THEN ROUND((converted_leads::DECIMAL / total_leads) * 100, 2)
        ELSE 0
    END;
END;
$$ LANGUAGE plpgsql;

-- Create useful procedures
-- Procedure to assign leads to sales executives
CREATE OR REPLACE PROCEDURE assign_leads_to_sales(
    IN location_id INTEGER,
    IN max_leads_per_user INTEGER DEFAULT 10
)
LANGUAGE plpgsql
AS $$
DECLARE
    sales_user RECORD;
    unassigned_lead RECORD;
    lead_count INTEGER;
BEGIN
    -- Get sales executives for the location
    FOR sales_user IN 
        SELECT u.id 
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE r.name = 'Sales'
        AND u.is_active = true
    LOOP
        -- Count current leads for this user
        SELECT COUNT(*) INTO lead_count
        FROM leads
        WHERE assigned_to = sales_user.id
        AND status NOT IN ('Converted', 'Lost');

        -- If user has less than max leads, assign more
        WHILE lead_count < max_leads_per_user LOOP
            -- Get next unassigned lead for this location
            SELECT l.* INTO unassigned_lead
            FROM leads l
            WHERE l.location_id = location_id
            AND l.assigned_to IS NULL
            AND l.status NOT IN ('Converted', 'Lost')
            ORDER BY l.created_at
            LIMIT 1;

            -- Exit if no more unassigned leads
            IF unassigned_lead IS NULL THEN
                EXIT;
            END IF;

            -- Assign the lead
            UPDATE leads
            SET assigned_to = sales_user.id
            WHERE id = unassigned_lead.id;

            lead_count := lead_count + 1;
        END LOOP;
    END LOOP;
END;
$$;

-- Create indexes for frequently queried fields
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_followups_lead_id ON followups(lead_id);
CREATE INDEX idx_followups_assigned_to ON followups(assigned_to);
CREATE INDEX idx_followups_status ON followups(status);
CREATE INDEX idx_calls_lead_id ON calls(lead_id);
CREATE INDEX idx_calls_user_id ON calls(user_id);
CREATE INDEX idx_messages_lead_id ON messages(lead_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_password_resets_token_hash ON password_resets(token_hash);
CREATE INDEX idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX idx_password_resets_expires_at ON password_resets(expires_at);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_sales_locations_manager_id ON sales_locations(manager_id);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_followups_followup_date ON followups(followup_date);
CREATE INDEX idx_calls_start_time ON calls(start_time);
CREATE INDEX idx_messages_sent_at ON messages(sent_at);



-- Migration to add Plivo-related fields to calls table
-- Run this migration after updating the schema

-- Add Plivo call UUID field (only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calls' 
        AND column_name = 'plivo_call_uuid'
    ) THEN
        ALTER TABLE calls ADD COLUMN plivo_call_uuid VARCHAR(255);
    END IF;
END $$;

-- Add recording URL field (only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calls' 
        AND column_name = 'recording_url'
    ) THEN
        ALTER TABLE calls ADD COLUMN recording_url TEXT;
    END IF;
END $$;

-- Add recording ID field (only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calls' 
        AND column_name = 'recording_id'
    ) THEN
        ALTER TABLE calls ADD COLUMN recording_id VARCHAR(255);
    END IF;
END $$;

-- Create index on plivo_call_uuid for faster lookups
CREATE INDEX IF NOT EXISTS idx_calls_plivo_call_uuid ON calls(plivo_call_uuid);

-- Create index on recording_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_calls_recording_id ON calls(recording_id);




-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date TIMESTAMP NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  assigned_to INTEGER REFERENCES users(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on assigned_to for faster lookups
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Create index on due_date for sorting
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Check if trigger exists before creating it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_tasks_updated_at' 
        AND tgrelid = 'tasks'::regclass
    ) THEN
        CREATE TRIGGER update_tasks_updated_at
        BEFORE UPDATE ON tasks
        FOR EACH ROW
        EXECUTE FUNCTION update_tasks_updated_at();
    END IF;
END $$;


-- Chat tables for internal team communication

-- Chat conversations table
CREATE TABLE IF NOT EXISTS chat_conversations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    is_group BOOLEAN DEFAULT false,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat participants table (for group chats)
CREATE TABLE IF NOT EXISTS chat_participants (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMP,
    is_online BOOLEAN DEFAULT false,
    UNIQUE(conversation_id, user_id)
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text', -- text, image, file
    attachment_url TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_participants_conversation ON chat_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id);

-- Create trigger to update conversation's updated_at
CREATE OR REPLACE FUNCTION update_chat_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chat_conversations
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Check if trigger exists before creating it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_conversation_timestamp'
        AND tgrelid = 'chat_messages'::regclass
    ) THEN
        CREATE TRIGGER update_conversation_timestamp
        AFTER INSERT ON chat_messages
        FOR EACH ROW
        EXECUTE FUNCTION update_chat_conversation_updated_at();
    END IF;
END $$;



CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('site_name', 'CRM Enterprise'),
  ('site_description', 'Enterprise Customer Relationship Management System'),
  ('contact_email', 'admin@crmenterprise.com'),
  ('contact_phone', '+1 (555) 123-4567'),
  ('timezone', 'UTC'),
  ('date_format', 'MM/DD/YYYY'),
  ('time_format', '12h'),
  ('items_per_page', '20'),
  ('enable_notifications', 'true'),
  ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;



-- Create notes table
CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  color VARCHAR(20) DEFAULT 'blue',
  tags TEXT[] DEFAULT '{}',
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index on created_by for faster queries
CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_is_deleted ON notes(is_deleted);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
