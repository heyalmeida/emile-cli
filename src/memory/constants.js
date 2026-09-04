export const MEMORY_SCHEMA_VERSION = 1;
export const DEFAULT_MEMORY_MODE = 'ask';

export const MEMORY_MODES = Object.freeze(['off', 'ask', 'auto']);
export const MEMORY_TYPES = Object.freeze(['user', 'workflow', 'feedback', 'fact', 'reference']);
export const MEMORY_STATES = Object.freeze(['active', 'pending', 'conflict']);
export const MEMORY_ACTIVATIONS = Object.freeze(['always', 'relevant']);
export const MEMORY_SENSITIVITY = Object.freeze(['normal', 'sensitive']);

export const MAX_ACTIVE_RECORDS = 500;
export const MAX_PENDING_RECORDS = 100;
export const MAX_RECORD_CHARS = 4096;
export const MAX_TAGS = 8;
export const MAX_TAG_CHARS = 32;
export const MAX_EVIDENCE_SESSIONS = 8;
export const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
export const MAX_OVERVIEW_BYTES = 25 * 1024;
export const MAX_OVERVIEW_LINES = 200;
export const MEMORY_CONTEXT_TOKENS = 1400;
export const MAX_ALWAYS_RESULTS = 10;
export const MAX_RELEVANT_RESULTS = 6;

export const MEMORY_FILES = Object.freeze({
  store: 'store.json',
  backup: 'store.json.bak',
  wal: 'wal.ndjson',
  overview: 'MEMORY.md',
  lock: '.lock',
  quarantine: 'quarantine',
});

export const MEMORY_TOOL_NAMES = Object.freeze(new Set(['proposeMemory', 'recallMemory']));
