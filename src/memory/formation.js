import crypto from 'node:crypto';
import { MAX_TAGS, MEMORY_ACTIVATIONS, MEMORY_TYPES } from './constants.js';
import { assessMemoryText } from './privacy.js';
import { memorySimilarity, tokenizeMemory } from './tokens.js';

function id(prefix) { return `${prefix}_${crypto.randomBytes(8).toString('hex')}`; }
export function sessionReference(sessionId) {
  return `sess_${crypto.createHash('sha256').update(String(sessionId || '')).digest('hex').slice(0, 16)}`;
}

export function normalizeMemoryKey(value, fallbackText = '') {
  const supplied = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9._:-]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 96);
  if (/^[a-z0-9][a-z0-9._:-]{2,95}$/.test(supplied)) return supplied;
  const tokens = [...new Set(tokenizeMemory(fallbackText))].slice(0, 6).join('.').replace(/[^a-z0-9.]+/g, '');
  return `user.${tokens || crypto.createHash('sha256').update(fallbackText).digest('hex').slice(0, 12)}`.slice(0, 96);
}

function normalizeTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).map(tag =>
    String(tag).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 32)
  ).filter(Boolean))].slice(0, MAX_TAGS);
}

function createRecord({ text, key, type, activation, sourceKind, sessionRef, state, sensitivity, conflictWith }, revision, tags = []) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1, id: id('mem'), revision, type, state, key, text,
    tags: normalizeTags(tags), activation, confidence: sourceKind === 'explicit' ? 1 : 0.5,
    sourceKind, sourceSessionRef: sessionRef, createdAt: now, updatedAt: now,
    lastUsedAt: null, useCount: 0, evidenceSessionRefs: [sessionRef], sensitivity,
    ...(conflictWith ? { conflictWith } : {}),
  };
}

export function addExplicitMemory(draft, input, { sessionId, allowSensitive = false } = {}) {
  const assessed = assessMemoryText(input);
  if (assessed.level === 'denied') return { status: 'rejected', code: assessed.code };
  if (assessed.level === 'sensitive' && !allowSensitive) return { status: 'confirmation-required', code: assessed.code };
  const key = normalizeMemoryKey('', assessed.text);
  const duplicate = draft.records.find(record => record.state === 'active' && memorySimilarity(record.text, assessed.text) >= 0.8);
  if (duplicate) return { status: 'duplicate', id: duplicate.id };
  const record = createRecord({
    text: assessed.text, key, type: 'user', activation: 'relevant', sourceKind: 'explicit',
    sessionRef: sessionReference(sessionId), state: 'active', sensitivity: assessed.level,
  }, draft.revision + 1);
  draft.records.push(record);
  return { status: 'active', id: record.id };
}

export function proposeMemoryCandidate(draft, proposal, { currentUserText, sessionId } = {}) {
  const evidence = typeof proposal?.evidence === 'string' ? proposal.evidence : '';
  if (!sessionId || !evidence || !String(currentUserText || '').includes(evidence)) return { status: 'rejected', code: 'invalid-source' };
  const assessed = assessMemoryText(evidence);
  if (assessed.level !== 'normal') return { status: 'rejected', code: assessed.code };
  const type = MEMORY_TYPES.slice(0, 3).includes(proposal.type) ? proposal.type : 'user';
  const activation = MEMORY_ACTIVATIONS.includes(proposal.activation) ? proposal.activation : 'relevant';
  const key = normalizeMemoryKey(proposal.key, assessed.text);
  const sessionRef = sessionReference(sessionId);
  const sameKey = draft.records.filter(record => record.key === key);
  const active = sameKey.find(record => record.state === 'active');
  if (active && memorySimilarity(active.text, assessed.text) < 0.35) {
    const duplicateConflict = sameKey.find(record => record.state === 'conflict' && memorySimilarity(record.text, assessed.text) >= 0.8);
    if (duplicateConflict) return { status: 'conflict', id: duplicateConflict.id, conflictWith: active.id };
    const conflict = createRecord({ text: assessed.text, key, type, activation, sourceKind: 'inferred', sessionRef,
      state: 'conflict', sensitivity: 'normal', conflictWith: active.id }, draft.revision + 1, proposal.tags);
    draft.records.push(conflict);
    return { status: 'conflict', id: conflict.id, conflictWith: active.id };
  }
  const candidate = sameKey.find(record => record.state === 'pending' && memorySimilarity(record.text, assessed.text) >= 0.35);
  const target = active || candidate;
  if (target) {
    if (target.evidenceSessionRefs.includes(sessionRef)) return { status: target.state, id: target.id };
    target.evidenceSessionRefs.push(sessionRef);
    target.updatedAt = new Date().toISOString();
    target.revision = draft.revision + 1;
    target.confidence = Math.min(1, 0.5 + target.evidenceSessionRefs.length * 0.2);
    if (target.state === 'pending' && draft.mode === 'auto' && target.evidenceSessionRefs.length >= 2) target.state = 'active';
    return { status: target.state === 'active' ? 'active' : 'pending', id: target.id };
  }
  const record = createRecord({ text: assessed.text, key, type, activation, sourceKind: 'inferred', sessionRef,
    state: 'pending', sensitivity: 'normal' }, draft.revision + 1, proposal.tags);
  draft.records.push(record);
  return { status: 'pending', id: record.id };
}
