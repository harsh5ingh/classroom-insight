import json
import sqlite3
from datetime import datetime, timezone
from flask import current_app, g

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS students (
 id INTEGER PRIMARY KEY, identifier TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL, cohort TEXT NOT NULL DEFAULT '', is_demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, instructor TEXT NOT NULL,
 is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attendance (
 session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'unconfirmed' CHECK(status IN ('present','absent','unconfirmed')),
 PRIMARY KEY(session_id,student_id));
CREATE TABLE IF NOT EXISTS analyses (
 id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 filename TEXT NOT NULL, stored_name TEXT, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
 result TEXT, error TEXT, is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recommendations (
 id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 source TEXT NOT NULL, items TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, message TEXT NOT NULL, created_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS demo_sessions (
 token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS institutional_enquiries (
 id INTEGER PRIMARY KEY, reference TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
 idempotency_hash TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL,
 contact_name TEXT NOT NULL, work_email TEXT NOT NULL, organization_name TEXT NOT NULL,
 details TEXT NOT NULL, consent INTEGER NOT NULL CHECK(consent IN (0,1)),
 status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Reviewed','Closed')));
CREATE TABLE IF NOT EXISTS public_rate_limits (
 scope TEXT NOT NULL, window INTEGER NOT NULL, hits INTEGER NOT NULL,
 PRIMARY KEY(scope,window));
"""

def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def db():
    if 'db' not in g:
        g.db = sqlite3.connect(current_app.config['DATABASE'], timeout=15)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys=ON')
    return g.db

def rows(query, args=()):
    return [dict(row) for row in db().execute(query, args).fetchall()]

def event(message, demo=0):
    db().execute('INSERT INTO events(message,created_at,is_demo) VALUES(?,?,?)', (message, now(), demo))

def preferences():
    defaults = {'sample_seconds': 10, 'person_detection': True}
    defaults.update({r['key']: json.loads(r['value']) for r in rows('SELECT * FROM settings')})
    return defaults

def init_db(app):
    with app.app_context():
        db().executescript(SCHEMA)
        db().execute("UPDATE analyses SET status='failed',error='Processing was interrupted. Delete this analysis and upload again.' WHERE status IN ('queued','processing')")
        db().commit()
    @app.teardown_appcontext
    def close_db(_exception):
        conn = g.pop('db', None)
        if conn is not None:
            conn.close()
