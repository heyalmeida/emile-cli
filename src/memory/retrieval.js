import {
  MAX_ALWAYS_RESULTS,
  MAX_RELEVANT_RESULTS,
  MEMORY_CONTEXT_TOKENS,
} from './constants.js';
import { estimateMemoryTokens, memorySimilarity, tokenizeMemory } from './tokens.js';

const TYPE_WEIGHT = { user: 1.2, workflow: 1.15, feedback: 1.1, fact: 1, reference: 0.9 };

function overlapScore(queryTokens, record) {
  const terms = new Set(tokenizeMemory(`${record.key} ${record.tags.join(' ')} ${record.text}`));
  if (queryTokens.length === 0 || terms.size === 0) return 0;
  let matches = 0;
  for (const token of queryTokens) if (terms.has(token)) matches += 1;
  return matches / Math.sqrt(queryTokens.length * terms.size);
}

function scoreRecord(queryTokens, record, now) {
  let score = overlapScore(queryTokens, record) * (TYPE_WEIGHT[record.type] || 1);
  if (record.activation === 'always') score += 2;
  if (record.type === 'feedback') {
    const ageDays = Math.max(0, now - Date.parse(record.updatedAt)) / 86_400_000;
    score *= Math.max(0.5, Math.exp(-ageDays / 180));
  }
  score += Math.min(record.useCount, 20) * 0.005;
  return score;
}

function diverseSelect(scored, limit, selected = []) {
  const remaining = [...scored];
  const result = [];
  while (remaining.length > 0 && result.length < limit) {
    let bestIndex = 0;
    let best = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const prior = [...selected, ...result];
      const redundancy = prior.length
        ? Math.max(...prior.map(item => memorySimilarity(item.record.text, candidate.record.text)))
        : 0;
      const mmr = 0.75 * candidate.score - 0.25 * redundancy;
      if (mmr > best || (mmr === best && candidate.record.id < remaining[bestIndex].record.id)) {
        best = mmr;
        bestIndex = index;
      }
    }
    result.push(remaining.splice(bestIndex, 1)[0]);
  }
  return result;
}

export function retrieveMemories(state, query, { tokenBudget = MEMORY_CONTEXT_TOKENS } = {}) {
  const active = state.records.filter(record => record.state === 'active');
  const queryTokens = tokenizeMemory(query);
  const now = Date.now();
  const scored = active.map(record => ({ record, score: scoreRecord(queryTokens, record, now) }));
  const always = diverseSelect(scored.filter(item => item.record.activation === 'always'), MAX_ALWAYS_RESULTS);
  const relevant = diverseSelect(
    scored.filter(item => item.record.activation !== 'always' && item.score > 0)
      .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id)),
    MAX_RELEVANT_RESULTS,
    always,
  );
  const chosen = [];
  let tokens = 0;
  for (const item of [...always, ...relevant]) {
    const cost = estimateMemoryTokens(item.record.text) + 12;
    if (tokens + cost > tokenBudget) continue;
    chosen.push(item.record);
    tokens += cost;
  }
  return { records: chosen, estimatedTokens: tokens };
}

export function searchMemoryRecords(state, query, { states } = {}) {
  const allowed = states ? new Set(states) : null;
  const tokens = tokenizeMemory(query);
  return state.records
    .filter(record => !allowed || allowed.has(record.state))
    .map(record => ({ record, score: query ? scoreRecord(tokens, record, Date.now()) : 1 }))
    .filter(item => !query || item.score > 0 || recordMatches(item.record, query))
    .sort((a, b) => b.score - a.score || b.record.updatedAt.localeCompare(a.record.updatedAt))
    .map(item => item.record);
}

function recordMatches(record, query) {
  const normalized = String(query).toLowerCase();
  return record.id.toLowerCase().startsWith(normalized) || record.key.toLowerCase().includes(normalized);
}
