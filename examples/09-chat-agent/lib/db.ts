/**
 * SQLite session store using better-sqlite3.
 *
 * Maps each chat_id to its corresponding agent_id, environment_id, and
 * session_id so we can reuse them across messages.
 *
 * better-sqlite3 is synchronous, simple, and requires zero config.
 * Perfect for demos and local tools. For production, consider PostgreSQL
 * or another managed database.
 */

import Database from "better-sqlite3";
import path from "path";

// --- Types ---

export interface SessionRow {
  chat_id: string;
  agent_id: string;
  environment_id: string;
  session_id: string;
  created_at: string;
}

// --- Database initialization ---
// Store the DB file next to the project root so it persists across restarts

const dbPath = path.join(process.cwd(), "chat-sessions.db");
const db = new Database(dbPath);

// Create the sessions table on first run
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    chat_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    environment_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

// Prepared statements for fast lookups and inserts
const getStmt = db.prepare("SELECT * FROM sessions WHERE chat_id = ?");
const insertStmt = db.prepare(
  "INSERT INTO sessions (chat_id, agent_id, environment_id, session_id, created_at) VALUES (?, ?, ?, ?, ?)"
);

// --- Public API ---

/** Look up an existing session by chat_id. Returns undefined if not found. */
export function getSession(chatId: string): SessionRow | undefined {
  return getStmt.get(chatId) as SessionRow | undefined;
}

/** Store a new session mapping in the database. */
export function insertSession(session: SessionRow): void {
  insertStmt.run(
    session.chat_id,
    session.agent_id,
    session.environment_id,
    session.session_id,
    session.created_at
  );
}
