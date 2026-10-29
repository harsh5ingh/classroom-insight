import json
import sqlite3
from pathlib import Path
from uuid import uuid4
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
 confirmed_at TEXT, updated_at TEXT, source TEXT NOT NULL DEFAULT 'legacy',
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
CREATE TABLE IF NOT EXISTS attendance_changes (
 id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 previous_status TEXT NOT NULL, status TEXT NOT NULL, recorded_at TEXT NOT NULL,
 source TEXT NOT NULL, analysis_id INTEGER REFERENCES analyses(id) ON DELETE SET NULL,
 track_id INTEGER, actor TEXT NOT NULL DEFAULT 'Demo instructor');
CREATE UNIQUE INDEX IF NOT EXISTS attendance_track_review ON attendance_changes(analysis_id,track_id)
 WHERE analysis_id IS NOT NULL AND track_id IS NOT NULL;
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
    defaults = {'sample_seconds': 10, 'person_detection': True, 'face_detection': True}
    defaults.update({r['key']: json.loads(r['value']) for r in rows('SELECT * FROM settings')})
    return defaults


def record_attendance(session_id, student_id, status, source='manual', analysis_id=None, track_id=None):
    previous = db().execute('SELECT status,updated_at FROM attendance WHERE session_id=? AND student_id=?',
                            (session_id,student_id)).fetchone()
    if previous is None:
        raise ValueError('Student is not on this session roster.')
    if previous['status']==status and previous['updated_at'] and source=='manual':
        return
    timestamp = now()
    db().execute('INSERT INTO attendance_changes(session_id,student_id,previous_status,status,recorded_at,source,analysis_id,track_id) VALUES(?,?,?,?,?,?,?,?)',
                 (session_id,student_id,previous['status'],status,timestamp,source,analysis_id,track_id))
    db().execute('UPDATE attendance SET status=?,confirmed_at=?,updated_at=?,source=? WHERE session_id=? AND student_id=?',
                 (status,timestamp if status!='unconfirmed' else None,timestamp,source,session_id,student_id))


def migrate_attendance(app):
    """Additive v1 migration. Back up existing DB before any schema change.

    Legacy records retain unknown timestamps; no attendance is inferred/backfilled.
    A failed migration rolls back all added columns. Existing backup is never reused.
    """
    columns = {r['name'] for r in db().execute('PRAGMA table_info(attendance)')}
    missing = {'confirmed_at':'TEXT','updated_at':'TEXT','source':"TEXT NOT NULL DEFAULT 'legacy'"}
    missing = {k:v for k,v in missing.items() if k not in columns}
    if not columns or not missing:
        return
    target = Path(app.config['DATABASE'])
    backups = target.parent/'backups'
    backups.mkdir(exist_ok=True)
    backup = backups/(target.stem+'-before-attendance-history-'+uuid4().hex+'.sqlite3')
    with sqlite3.connect(backup) as destination:
        db().backup(destination)
    try:
        db().execute('BEGIN IMMEDIATE')
        for name,kind in missing.items():
            db().execute(f'ALTER TABLE attendance ADD COLUMN {name} {kind}')
        db().commit()
    except Exception:
        db().rollback()
        raise

def init_db(app):
    with app.app_context():
        migrate_attendance(app)
        db().executescript(SCHEMA)
        db().execute("UPDATE analyses SET status='failed',error='Processing was interrupted. Delete this analysis and upload again.' WHERE status IN ('queued','processing')")
        db().commit()
    @app.teardown_appcontext
    def close_db(_exception):
        conn = g.pop('db', None)
        if conn is not None:
            conn.close()
