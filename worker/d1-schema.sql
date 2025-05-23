-- D1 Database Schema for InstaReveal QR Draw System

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS sessions;
DROP INDEX IF EXISTS idx_status;
DROP INDEX IF EXISTS idx_created_at;
DROP INDEX IF EXISTS idx_session_status;

-- Create sessions table
CREATE TABLE sessions (
    session_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    drawn_at DATETIME,
    result_image_url TEXT,
    client_ip TEXT,
    last_polled_at DATETIME
);

-- Create indexes for better query performance
CREATE INDEX idx_status ON sessions(status);
CREATE INDEX idx_created_at ON sessions(created_at);
CREATE INDEX idx_session_status ON sessions(session_id, status);

-- Optional: Create a cleanup trigger (Note: D1 might not support triggers yet)
-- This would automatically delete sessions older than 24 hours
-- CREATE TRIGGER cleanup_old_sessions
-- AFTER INSERT ON sessions
-- BEGIN
--   DELETE FROM sessions WHERE created_at < datetime('now', '-24 hours');
-- END;
