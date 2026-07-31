import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const historyDir = path.join(config.workspaceDir, '.emile', 'history');

// Ensure history directory exists
function ensureHistoryDir() {
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }
}

/**
 * Saves a chat session to the local repository.
 * @param {string} sessionId Unique session ID
 * @param {string} summary Title or summary of the chat
 * @param {Array<object>} messages Chat message history
 */
export function saveSession(sessionId, summary, messages) {
  ensureHistoryDir();
  const filePath = path.join(historyDir, `${sessionId}.json`);
  
  const data = {
    id: sessionId,
    summary: summary || 'Conversa sem título',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: messages || [],
  };

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
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[Warning] Failed to save session history: ${err.message}`);
  }
}

/**
 * Lists all saved chat sessions sorted by latest activity.
 * @returns {Array<{ id: string, summary: string, createdAt: string, updatedAt: string }>}
 */
export function listSessions() {
  ensureHistoryDir();
  const sessions = [];

  try {
    const files = fs.readdirSync(historyDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(historyDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(content);
          sessions.push({
            id: data.id,
            summary: data.summary,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
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
  ensureHistoryDir();
  const filePath = path.join(historyDir, `${sessionId}.json`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    return data.messages;
  } catch (err) {
    console.warn(`[Warning] Failed to load session: ${err.message}`);
    return null;
  }
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
