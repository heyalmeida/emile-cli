import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { warn } from './ui/log.js';
import { normalizeWorkspaceCwd } from './tools/security.js';
import { MEMORY_TOOL_NAMES } from './memory/constants.js';

const historyDir = path.join(config.workspaceDir, '.emile', 'history');

// Ensure history directory exists
function ensureHistoryDir(directory = historyDir) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

/**
 * True unless the message is an assistant turn that carries NOTHING the wire
 * accepts: no content and no tool calls.
 *
 * Why this exists (deep-dive § 10, P0-6): a stream that errors or ends empty
 * used to push `{role:'assistant', content:null}` into the live history, and
 * `preparePersistedMessages` then stripped the reasoning fields that were the
 * turn's only payload — so exactly that record landed on disk. Every following
 * request resends the whole history, the provider rejects it with
 * `400 messages[i] needs content or tool_calls`, and because 400 is neither
 * retryable nor a context overflow, compression never triggers: the session is
 * permanently dead and each new user turn appends another poisoned record.
 *
 * The predicate guards all three boundaries — generation (`agent.js`), persist
 * and load — so the shape can neither be created nor survive a round trip.
 *
 * `content: null` WITH `tool_calls` is a valid shape (it is what providers
 * themselves return for a tool-only turn) and is deliberately preserved, as is
 * any structured/multimodal content. Non-assistant roles and non-object
 * entries are never judged here: orphan `tool`/`tool_calls` repair belongs to
 * the compression sanitizer (P1-11), not to this boundary.
 *
 * @param {object} message
 * @returns {boolean}
 */
export function isValidAssistantMessage(message) {
  if (!message || typeof message !== 'object') return true;
  if (message.role !== 'assistant') return true;
  const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  if (hasToolCalls) return true;
  if (typeof message.content === 'string') return message.content.length > 0;
  return message.content !== null && message.content !== undefined;
}

/**
 * Creates the persisted view of a message list without changing live history.
 * Model reasoning is useful while the process is running but is omitted from
 * session snapshots to reduce size and accidental disclosure.
 *
 * Empty assistant turns are dropped here as well: `reasoning_content` never
 * reaches disk, so keeping such a message would persist exactly the shape that
 * kills every later request (see `isValidAssistantMessage`).
 */
export function preparePersistedMessages(messages = []) {
  const memoryCallIds = new Set();
  for (const message of messages) {
    for (const toolCall of message?.tool_calls || []) {
      if (MEMORY_TOOL_NAMES.has(toolCall?.function?.name)) memoryCallIds.add(toolCall.id);
    }
  }
  return messages.map(message => {
    if (!message || typeof message !== 'object') return message;
    const persisted = { ...message };
    delete persisted.reasoning_content;
    if (Array.isArray(message.tool_calls)) {
      persisted.tool_calls = message.tool_calls.map(toolCall => {
        if (!MEMORY_TOOL_NAMES.has(toolCall?.function?.name)) return { ...toolCall, function: { ...toolCall.function } };
        return { ...toolCall, function: { ...toolCall.function, arguments: '{"omitted":true}' } };
      });
    }
    if (persisted.role === 'tool' && memoryCallIds.has(persisted.tool_call_id)) {
      persisted.content = '[global memory tool result omitted from session storage]';
    }
    return persisted;
  }).filter(isValidAssistantMessage);
}

function preparePersistedToolCalls(toolCalls = []) {
  return toolCalls.map(toolCall => MEMORY_TOOL_NAMES.has(toolCall?.function?.name)
    ? { ...toolCall, function: { ...toolCall.function, arguments: '{"omitted":true}' } }
    : toolCall);
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
 * Writes a session file durably: temp file beside the target → fsync → rename.
 *
 * A bare write in place can be interrupted (forced exit, power loss) and leave
 * truncated JSON behind — which the boot scan then reports as a corrupt session.
 * The persistence layer must not manufacture the corruption the recovery layer
 * exists to repair, so the previous file is only replaced once the new bytes are
 * on disk, and the temp file is always cleaned up.
 *
 * The pattern mirrors src/memory/io.js (open → write → fsync → close → rename).
 */
function writeFileAtomically(filePath, contents) {
  const tempPath = `${filePath}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tempPath, 'w');
    fs.writeFileSync(fd, contents, 'utf8');
    // Durable BEFORE the rename replaces the good file.
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* best-effort */ } }
    if (fs.existsSync(tempPath)) { try { fs.unlinkSync(tempPath); } catch { /* best-effort */ } }
  }
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
    data.pendingToolCalls = preparePersistedToolCalls(metadata.pendingToolCalls);
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
    writeFileAtomically(filePath, JSON.stringify(data, null, 2));
    liveSessionPath = filePath;
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
 *
 * Sanitizes on read (deep-dive § 10 invariant, P0-6): empty assistant messages
 * left by sessions written before the generation guard are filtered out so a
 * poisoned transcript cannot resume into a permanent `400 … needs content or
 * tool_calls`. This is deliberately **read-time only** — the file on disk is
 * never rewritten here; the next `saveSession` persists the clean projection.
 * Consecutive `user` messages left behind are valid on the chat-completions
 * wire, so they are neither merged nor reordered.
 */
export function getSessionRecord(sessionId) {
  ensureHistoryDir();
  const filePath = path.join(historyDir, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const record = {
      ...data,
      status: data.status === 'tool_pending' ? 'tool_pending' : 'complete',
      pendingToolCalls: Array.isArray(data.pendingToolCalls) ? data.pendingToolCalls : [],
      sessionCwd: normalizeWorkspaceCwd(data.sessionCwd) || config.workspaceDir,
    };
    // Sanitize only a real array: a record without `messages` keeps its previous
    // (falsy) shape so callers that treat it as "failed to load" still do.
    if (Array.isArray(data.messages)) {
      const kept = data.messages.filter(isValidAssistantMessage);
      if (kept.length !== data.messages.length) {
        warn(`Session ${sessionId}: dropped ${data.messages.length - kept.length} empty assistant message(s) on load.`);
      }
      record.messages = kept;
    }
    return record;
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
 * Sets the record used by flushSync() so the flush phase has something real to
 * sync. Set by saveSession on every successful write.
 */
let liveSessionPath = null;

/**
 * Synchronous durability step for the lifecycle coordinator's flush phase.
 *
 * fsyncs the live session file and its directory (a rename is only durable once
 * the directory entry is synced). Best-effort by contract: the phase runs during
 * shutdown, where a throw would abort the remaining phases, so every failure is
 * swallowed deliberately.
 */
export function flushSync() {
  try {
    if (liveSessionPath && fs.existsSync(liveSessionPath)) {
      const fd = fs.openSync(liveSessionPath, 'r');
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    // Directory entry: unsupported on some platforms (Windows), hence best-effort.
    let dirFd;
    try {
      dirFd = fs.openSync(historyDir, 'r');
      fs.fsyncSync(dirFd);
    } catch { /* directory fsync is not portable */ } finally {
      if (dirFd !== undefined) { try { fs.closeSync(dirFd); } catch { /* best-effort */ } }
    }
  } catch {
    // Shutdown must never throw from here.
  }
}

/**
 * Records that a turn was interrupted, WITHOUT destroying resumability.
 *
 * Additive by design: `status` is never touched and `pendingToolCalls` is never
 * dropped, so a `tool_pending` checkpoint stays replayable by
 * `resumePendingTools` while the record now also says why the turn stopped. The
 * previous body set `status = 'aborted'`, which erased the pending batch — that
 * would have killed exactly the recovery this module exists to support.
 *
 * @param {string} sessionId
 * @param {string} [reason] Why the turn was interrupted (e.g. 'shutdown').
 */
export function markAborted(sessionId, reason = 'shutdown') {
  ensureHistoryDir();
  const filePath = path.join(historyDir, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.aborted = true;
    data.abortReason = typeof reason === 'string' && reason.length > 0 ? reason : 'shutdown';
    data.updatedAt = new Date().toISOString();
    writeFileAtomically(filePath, JSON.stringify(data, null, 2));
  } catch {
    // Best-effort; shutdown must not throw.
  }
}

/**
 * Moves a corrupt session to .emile/history/corrupt/<sessionId>/.
 *
 * `directory` lets the boot scan quarantine inside the directory it actually
 * scanned (it can be pointed elsewhere); the default is this module's history
 * directory. Best-effort: a locked or vanished file is left where it is.
 *
 * @param {string} sessionId
 * @param {{ directory?: string }} [opts]
 */
export function moveToCorrupt(sessionId, { directory = historyDir } = {}) {
  ensureHistoryDir();
  const filePath = path.join(directory, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return;
  try {
    const corruptDir = path.join(directory, 'corrupt', sessionId);
    fs.mkdirSync(corruptDir, { recursive: true });
    const ts = Date.now();
    fs.renameSync(filePath, path.join(corruptDir, `${ts}.json`));
  } catch {
    // Best-effort; shutdown must not throw.
  }
}

/**
 * Lists sessions holding a `tool_pending` checkpoint (a turn interrupted
 * mid-tool). Named after the status it filters: the previous `listPending`
 * looked for `'pending'`, a value no writer ever produced.
 * @returns {Array<object>}
 */
export function listToolPending() {
  return listSessions().filter(s => s.status === 'tool_pending');
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
