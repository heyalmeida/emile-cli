import {
  DEFAULT_MEMORY_MODE,
  MAX_ACTIVE_RECORDS,
  MAX_EVIDENCE_SESSIONS,
  MAX_PENDING_RECORDS,
  MAX_RECORD_CHARS,
  MAX_TAG_CHARS,
  MAX_TAGS,
  MEMORY_ACTIVATIONS,
  MEMORY_MODES,
  MEMORY_SCHEMA_VERSION,
  MEMORY_SENSITIVITY,
  MEMORY_STATES,
  MEMORY_TYPES,
} from './constants.js';

const RECORD_KEYS = new Set([
  'schemaVersion', 'id', 'revision', 'type', 'state', 'key', 'text', 'tags',
  'activation', 'confidence', 'sourceKind', 'sourceSessionRef', 'createdAt',
  'updatedAt', 'lastUsedAt', 'useCount', 'evidenceSessionRefs', 'sensitivity',
  'conflictWith',
]);

export class MemoryValidationError extends Error {
  constructor(code) {
    super(`Invalid memory state (${code}).`);
    this.name = 'MemoryValidationError';
    this.code = code;
  }
}

function fail(code) { throw new MemoryValidationError(code); }
function isIsoDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function isMember(value, allowed) { return allowed.includes(value); }

function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('record-shape');
  for (const key of Object.keys(record)) if (!RECORD_KEYS.has(key)) fail('record-field');
  if (record.schemaVersion !== MEMORY_SCHEMA_VERSION) fail('record-version');
  if (!/^mem_[a-f0-9]{16}$/.test(record.id || '')) fail('record-id');
  if (!Number.isSafeInteger(record.revision) || record.revision < 1) fail('record-revision');
  if (!isMember(record.type, MEMORY_TYPES) || !isMember(record.state, MEMORY_STATES)) fail('record-kind');
  if (!/^[a-z0-9][a-z0-9._:-]{2,95}$/.test(record.key || '')) fail('record-key');
  if (typeof record.text !== 'string' || !record.text.trim() || record.text.length > MAX_RECORD_CHARS) fail('record-text');
  if (!Array.isArray(record.tags) || record.tags.length > MAX_TAGS ||
      record.tags.some(tag => typeof tag !== 'string' || !tag || tag.length > MAX_TAG_CHARS)) fail('record-tags');
  if (!isMember(record.activation, MEMORY_ACTIVATIONS)) fail('record-activation');
  if (typeof record.confidence !== 'number' || record.confidence < 0 || record.confidence > 1) fail('record-confidence');
  if (!['explicit', 'inferred'].includes(record.sourceKind)) fail('record-source');
  if (!/^sess_[a-f0-9]{16}$/.test(record.sourceSessionRef || '')) fail('record-session');
  if (!isIsoDate(record.createdAt) || !isIsoDate(record.updatedAt)) fail('record-date');
  if (record.lastUsedAt !== null && !isIsoDate(record.lastUsedAt)) fail('record-last-used');
  if (!Number.isSafeInteger(record.useCount) || record.useCount < 0) fail('record-use-count');
  if (!Array.isArray(record.evidenceSessionRefs) || record.evidenceSessionRefs.length > MAX_EVIDENCE_SESSIONS ||
      record.evidenceSessionRefs.some(ref => !/^sess_[a-f0-9]{16}$/.test(ref))) fail('record-evidence');
  if (!isMember(record.sensitivity, MEMORY_SENSITIVITY)) fail('record-sensitivity');
  if (record.conflictWith !== undefined && !/^mem_[a-f0-9]{16}$/.test(record.conflictWith)) fail('record-conflict');
  return record;
}

export function createEmptyMemoryState() {
  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    revision: 0,
    mode: DEFAULT_MEMORY_MODE,
    records: [],
  };
}

export function validateMemoryState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('state-shape');
  const keys = Object.keys(state).sort().join(',');
  if (keys !== 'mode,records,revision,schemaVersion') fail('state-field');
  if (state.schemaVersion !== MEMORY_SCHEMA_VERSION) fail('state-version');
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) fail('state-revision');
  if (!isMember(state.mode, MEMORY_MODES) || !Array.isArray(state.records)) fail('state-value');

  const ids = new Set();
  let active = 0;
  let pending = 0;
  for (const record of state.records) {
    validateRecord(record);
    if (ids.has(record.id)) fail('duplicate-id');
    ids.add(record.id);
    if (record.state === 'active') active += 1;
    else pending += 1;
  }
  if (active > MAX_ACTIVE_RECORDS || pending > MAX_PENDING_RECORDS) fail('record-cap');
  return state;
}

export function cloneMemoryState(state) {
  return JSON.parse(JSON.stringify(state));
}
