import { config } from '../../config.js';
import { formatMemoryContext } from '../../memory/context.js';
import { proposeGlobalMemory, recallGlobalMemories } from '../../memory/index.js';

// Accept 'omitted' as a no-op parameter (some models try to use it)
const PROPOSAL_KEYS = new Set(['evidence', 'key', 'type', 'activation', 'tags', 'omitted']);
const PROPOSAL_TYPES = new Set(['user', 'workflow', 'feedback']);
const ACTIVATIONS = new Set(['always', 'relevant']);

function validProposal(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
  const invalidKeys = Object.keys(args).filter(key => !PROPOSAL_KEYS.has(key));
  if (invalidKeys.length > 0) return { valid: false, reason: `unknown parameter(s): ${invalidKeys.join(', ')}` };
  if (typeof args.evidence !== 'string' || !args.evidence) return { valid: false, reason: 'evidence is required and must be a non-empty string' };
  if (args.evidence.length > 4096) return { valid: false, reason: 'evidence exceeds 4096 character limit' };
  if (typeof args.key !== 'string' || args.key.length < 3) return { valid: false, reason: 'key is required and must be at least 3 characters' };
  if (args.key.length > 96) return { valid: false, reason: 'key exceeds 96 character limit' };
  if (args.type !== undefined && !PROPOSAL_TYPES.has(args.type)) return { valid: false, reason: `type must be one of: ${[...PROPOSAL_TYPES].join(', ')}` };
  if (args.activation !== undefined && !ACTIVATIONS.has(args.activation)) return { valid: false, reason: `activation must be one of: ${[...ACTIVATIONS].join(', ')}` };
  if (args.tags !== undefined) {
    if (!Array.isArray(args.tags)) return { valid: false, reason: 'tags must be an array' };
    if (args.tags.length > 8) return { valid: false, reason: 'tags exceeds 8 item limit' };
    const invalidTags = args.tags.filter(tag => typeof tag !== 'string' || tag.length === 0 || tag.length > 32);
    if (invalidTags.length > 0) return { valid: false, reason: 'each tag must be a string with 1-32 characters' };
  }
  return { valid: true };
}

function validationError(reason) {
  return `Memory proposal rejected: ${reason}. Required: evidence (exact quote from user message) and key (e.g., user.delivery-style).`;
}

function options(memory = {}) {
  return {
    root: memory.root,
    dryRun: config.dryRun,
    currentUserText: memory.currentUserText,
    sessionId: memory.sessionId,
  };
}

export async function proposeMemory(args = {}, context = {}) {
  const validation = validProposal(args);
  if (!validation.valid) return validationError(validation.reason);
  try {
    const result = await proposeGlobalMemory(args, options(context.memory));
    const value = result.value || { status: 'rejected', code: 'unavailable' };
    if (value.status === 'rejected') return `Memory proposal rejected (${value.code || 'invalid'}).`;
    if (value.status === 'disabled') return 'Memory is disabled or paused; nothing was stored.';
    if (result.simulated) return `Memory proposal simulated (${value.status}); nothing was stored.`;
    return `Memory proposal ${value.status} (${value.id || 'no id'}).`;
  } catch {
    return 'Memory proposal unavailable; the coding task may continue.';
  }
}

export async function recallMemory(args = {}, context = {}) {
  const { query } = args || {};
  if (!args || typeof args !== 'object' || Array.isArray(args) ||
      Object.keys(args).some(key => key !== 'query') ||
      typeof query !== 'string' || !query.trim() || query.length > 512) {
    return 'Memory recall rejected (invalid query).';
  }
  try {
    const result = recallGlobalMemories(query, options(context.memory));
    if (result.records.length === 0) return 'No confirmed global memory matched the query.';
    return {
      content: formatMemoryContext(result.records),
      persistContent: '[global memory recall omitted from session storage]',
    };
  } catch {
    return 'Memory recall unavailable; continue without it.';
  }
}
