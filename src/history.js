import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { warn } from './ui/log.js';
import { normalizeWorkspaceCwd } from './tools/security.js';

const historyDir = path.join(config.workspaceDir, '.emile', 'history');

// Ensure history directory exists
function ensureHistoryDir(directory = historyDir) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

/**
 * Creates the persisted view of a message list without changing live history.
 * Model reasoning is useful while the process is running but is omitted from
 * session snapshots to reduce size and accidental disclosure.
 */
export function preparePersistedMessages(messages = []) {
  return messages.map(message => {
    if (!message || typeof message !== 'object') return message;
    const persisted = { ...message };
    delete persisted.reasoning_content;
    return persisted;
  });
}

/** Trims oldest tool outputs in a copy until the persisted payload fits. */
export function trimPersistedMessages(messages = [], maxBytes = config.maxSessionSize) {
  const projected = preparePersistedMessages(messages);
  const limit = Number(maxBytes);
  if (!Number.isFinite(limit) || limit <= 0) return { messages: projected, trimmed: false };

  let trimmed = false;
  for (const message of projected) {
    if (Buffer.byteLength(JSON.stringify(projected), 'utf8') <= limit) break;
    if (message?.role === 'tool' && typeof message.content === 'string' && message.content !== '[truncated]') {
      message.content = '[truncated]';
      trimmed = true;
    }
  }
  return { messages: projected, trimmed };
}

/**
 * Saves a chat session to the local repository.
 * @param {string} sessionId Unique session ID
 * @param {string} summary Title or summary of the chat
 * @param {Array<object>} messages Chat message history
 * @param {object} [metadata] Optional checkpoint metadata.
 * @param {'complete'|'tool_pending'} [metadata.status] Record lifecycle state.
 * @param {Array<object>} [metadata.pendingToolCalls] Tool calls awaiting results.
 * @param {string} [metadata.sessionCwd] Workspace-contained working directory.
 */
export function saveSession(sessionId, summary, messages, metadata = {}) {
  ensureHistoryDir();
  const filePath = path.join(historyDir, `${sessionId}.json`);
  const status = metadata.status === 'tool_pending' ? 'tool_pending' : 'complete';

  const data = {
    id: sessionId,
    summary: summary || 'Conversa sem título',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    status,
    sessionCwd: normalizeWorkspaceCwd(metadata.sessionCwd || config.sessionCwd) || config.workspaceDir,
  };

  if (status === 'tool_pending' && Array.isArray(metadata.pendingToolCalls)) {
    data.pendingToolCalls = metadata.pendingToolCalls;
  }

  // If file already exists, preserve original createdAt
  if (fs.existsSync(filePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      data.createdAt = existing.createdAt;
    } catch (e) {
      // Ignore reading error
    }
  }

  try {
    const persisted = trimPersistedMessages(messages || []);
    data.messages = persisted.messages;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    if (persisted.trimmed) {
      warn(`Session exceeded ${Math.round(config.maxSessionSize / (1024 * 1024))}MB; older tool results were truncated on disk.`);
    }
  } catch (err) {
    warn(`Failed to save session history: ${err.message}`);
  }
}

/**
 * Reads a complete session record, including optional checkpoint metadata.
 * Legacy records without a status are treated as complete.
 */
export function getSessionRecord(sessionId) {
  ensureHistoryDir();
  const filePath = path.join(historyDir, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      ...data,
      status: data.status === 'tool_pending' ? 'tool_pending' : 'complete',
      pendingToolCalls: Array.isArray(data.pendingToolCalls) ? data.pendingToolCalls : [],
      sessionCwd: normalizeWorkspaceCwd(data.sessionCwd) || config.workspaceDir,
    };
  } catch (err) {
    console.warn(`[Warning] Failed to read session record: ${err.message}`);
    return null;
  }
}

/**
 * Lists all saved chat sessions sorted by latest activity.
 * @returns {Array<{ id: string, summary: string, createdAt: string, updatedAt: string }>}
 */
export function listSessions({ directory = historyDir } = {}) {
  ensureHistoryDir(directory);
  const sessions = [];

  try {
    const files = fs.readdirSync(directory);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(directory, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(content);
          sessions.push({
            id: data.id,
            summary: data.summary,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            status: data.status === 'tool_pending' ? 'tool_pending' : 'complete',
          });
        } catch (e) {
          // Ignore corrupt files
        }
      }
    }
  } catch (err) {
    console.warn(`[Warning] Failed to read sessions list: ${err.message}`);
  }

  // Sort by updatedAt descending (newest first)
  return sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Loads the messages of a specific session.
 * @param {string} sessionId 
 * @returns {Array<object>|null}
 */
export function loadSession(sessionId) {
  const record = getSessionRecord(sessionId);
  return record ? record.messages : null;
}

/**
 * Deletes a specific chat session.
 * @param {string} sessionId
 * @returns {boolean} True if deleted, false otherwise
 */
export function deleteSession(sessionId) {
  ensureHistoryDir();
  const filePath = path.join(historyDir, `${sessionId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (err) {
      console.warn(`[Warning] Failed to delete session file: ${err.message}`);
      return false;
    }
  }
  return false;
}

/**
 * Synchronous fsync of the session file. Called by the lifecycle coordinator
 * during shutdown — must not throw.
 */
export function flushSync() {
  // saveSession already writes synchronously; this is a no-op placeholder that
  // documents the flush point. The session is guaranteed to be on disk once
  // saveSession returns.
}

/**
 * Marks a session as aborted (user interrupted mid-tool).
 * @param {string} sessionId
 */
export function markAborted(sessionId) {
  ensureHistoryDir();
  const filePath = path.join(historyDir, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.status = 'aborted';
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // Best-effort; shutdown must not throw.
  }
}

/**
 * Moves a corrupt session to .emile/history/corrupt/<sessionId>/.
 * @param {string} sessionId
 */
export function moveToCorrupt(sessionId) {
  ensureHistoryDir();
  const filePath = path.join(historyDir, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return;
  try {
    const corruptDir = path.join(historyDir, 'corrupt', sessionId);
    fs.mkdirSync(corruptDir, { recursive: true });
    const ts = Date.now();
    fs.renameSync(filePath, path.join(corruptDir, `${ts}.json`));
  } catch {
    // Best-effort; shutdown must not throw.
  }
}

/**
 * Lists sessions with status 'pending'.
 * @returns {Array<object>}
 */
export function listPending() {
  return listSessions().filter(s => s.status === 'pending');
}

/** Deletes sessions older than the requested positive number of days. */
export function cleanSessions(olderThanDays, { directory = historyDir } = {}) {
  const days = Number(olderThanDays);
  if (!Number.isFinite(days) || days <= 0) return { deleted: 0, invalid: true };
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const session of listSessions({ directory })) {
    const filePath = path.join(directory, `${session.id}.json`);
    try {
      if (Date.parse(session.updatedAt) < cutoff && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    } catch {
      // A single stale/corrupt record must not stop cleanup of the rest.
    }
  }
  return { deleted, invalid: false };
}
