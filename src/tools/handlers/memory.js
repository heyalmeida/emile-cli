import { config } from '../../config.js';
import { formatMemoryContext } from '../../memory/context.js';
import { proposeGlobalMemory, recallGlobalMemories } from '../../memory/index.js';

const PROPOSAL_KEYS = new Set(['evidence', 'key', 'type', 'activation', 'tags']);
const PROPOSAL_TYPES = new Set(['user', 'workflow', 'feedback']);
const ACTIVATIONS = new Set(['always', 'relevant']);

function validProposal(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
  if (Object.keys(args).some(key => !PROPOSAL_KEYS.has(key))) return false;
  if (typeof args.evidence !== 'string' || !args.evidence || args.evidence.length > 4096) return false;
  if (typeof args.key !== 'string' || args.key.length < 3 || args.key.length > 96) return false;
  if (args.type !== undefined && !PROPOSAL_TYPES.has(args.type)) return false;
  if (args.activation !== undefined && !ACTIVATIONS.has(args.activation)) return false;
  return args.tags === undefined || (
    Array.isArray(args.tags) && args.tags.length <= 8 &&
    args.tags.every(tag => typeof tag === 'string' && tag.length > 0 && tag.length <= 32)
  );
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
  if (!validProposal(args)) return 'Memory proposal rejected (invalid arguments).';
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
