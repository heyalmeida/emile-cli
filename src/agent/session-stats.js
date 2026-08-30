// session-stats.js — session token/cost statistics and context math.
import { getModelInfo } from '../models.js';
import { buildSystemPrompt } from '../prompt.js';
import { toolDefinitions } from '../tools/index.js';
import { getMcpToolDefinitions } from '../mcp.js';

export const sessionStats = {
  promptTokens: 0,
  completionTokens: 0,
  totalCost: 0,
  // Prompt tokens served from the provider cache (when reported)
  cachedPromptTokens: 0,
  // Latest API response usage — authoritative current context size
  lastPromptTokens: 0,
  lastCompletionTokens: 0,
  // Pre-call char-based estimate (fallback before the first API response)
  estimatedContextTokens: 0,
  // Active model context window limit (tokens)
  contextLimit: 128000,
};

/**
 * Calculates the estimated cost of API calls in USD based on model pricing.
 * Prices come from the single MODEL_INFO table in models.js.
 */
export function calculateCost(model, promptTokens, completionTokens) {
  const info = getModelInfo(model);
  return ((promptTokens * info.inputPrice) + (completionTokens * info.outputPrice)) / 1000000;
}

/**
 * Returns the maximum context window (in tokens) for a given model.
 * Used to display context usage as a quota in the status bar.
 */
export function getContextLimit(model) {
  return getModelInfo(model).context;
}

/**
 * Estimates total context token consumption of a payload.
 * Counts System Prompt + Tool Schemas + Message history (incl. tool results),
 * then converts characters → tokens (~1 token ≈ 4 chars for PT/EN + code).
 *
 * This is a PRE-CALL fallback only: after the first API response the status
 * bar switches to authoritative `usage.prompt_tokens`.
 */
export function calculateContextUsage({ systemPrompt, tools, messages }) {
  const systemChars = (systemPrompt || '').length;
  const toolChars = JSON.stringify(tools || []).length;
  let messageChars = 0;
  for (const [index, msg] of (messages || []).entries()) {
    // Only the primary system message is represented by `systemPrompt`.
    // Compression summaries are additional system messages and remain part of
    // the request payload, so excluding every system role undercounts context.
    if (index === 0 && msg.role === 'system') continue;
    messageChars += JSON.stringify(msg).length;
  }
  const totalChars = systemChars + toolChars + messageChars;
  const estimatedTokens = Math.ceil(totalChars / 4);
  return { systemChars, toolChars, messageChars, totalChars, estimatedTokens };
}

/**
 * Initializes session statistics with a baseline context estimate and the
 * active model's context window limit. Called once at startup (and on session
 * switch) so the status bar can show context usage before the first API
 * response provides authoritative `prompt_tokens`.
 */
export function initSessionStats(model, plansMode, skills, messages = []) {
  const systemPrompt = buildSystemPrompt({ plansMode, skills });
  const allTools = [...toolDefinitions, ...getMcpToolDefinitions()];
  const usage = calculateContextUsage({ systemPrompt, tools: allTools, messages });
  sessionStats.estimatedContextTokens = usage.estimatedTokens;
  sessionStats.contextLimit = getContextLimit(model);
  return usage;
}
