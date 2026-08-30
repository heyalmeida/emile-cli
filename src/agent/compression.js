// compression.js — history compression gate (spec 2026-08-25-model-system).
import { createChatCompletion } from '../api/index.js';
import { getModelInfo } from '../models.js';
import { setTerminalActivity } from '../ui/title.js';
import { C } from '../ui/theme.js';

const COMPRESSION_CONTEXT_RATIO = 0.8;
const COMPRESSION_GROWTH_RATIO = 1.4;
const ESTIMATED_CHARS_PER_TOKEN = 4;
const FALLBACK_CONTEXT_RATIO = 0.7;

// Per live message list: avoids one session's compression affecting another
// and lets abandoned sessions be garbage-collected.
const compressedHistorySizes = new WeakMap();

function resolvePositiveNumber(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : fallback;
}

/**
 * Removes the oldest complete user-turn groups until history is within the
 * fallback target. The primary system message and newest group are retained.
 */
export function hardTruncateHistory(messages, contextLimit) {
  if (!Array.isArray(messages) || messages.length <= 2) return false;
  const limit = resolvePositiveNumber(contextLimit, 128_000);
  const targetChars = Math.floor(limit * FALLBACK_CONTEXT_RATIO * ESTIMATED_CHARS_PER_TOKEN);
  const groups = [];
  let current = [];

  for (const message of messages.slice(1)) {
    if (message?.role === 'user' && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.length > 0) groups.push(current);

  let changed = false;
  while (groups.length > 1 && JSON.stringify(messages).length > targetChars) {
    const oldest = groups.shift();
    messages.splice(1, oldest.length);
    changed = true;
  }
  return changed;
}

/**
 * When the estimated request reaches 80% of the model context window,
 * summarizes the older history into a compact block and swaps it in. Mutates
 * `messages` in place.
 * @returns {Promise<boolean>} true when compression ran
 */
export async function compressContextIfNeeded({
  model,
  messages,
  contextTokens,
  contextLimit,
  createCompletion = createChatCompletion,
  force = false,
}) {
  if (!Array.isArray(messages) || messages.length <= 8) return false;

  const historyStr = JSON.stringify(messages);
  const modelContextLimit = resolvePositiveNumber(
    contextLimit,
    resolvePositiveNumber(getModelInfo(model).context, 128_000)
  );
  const estimatedContextTokens = resolvePositiveNumber(
    contextTokens,
    Math.ceil(historyStr.length / ESTIMATED_CHARS_PER_TOKEN)
  );
  const compressionLimit = Math.floor(modelContextLimit * COMPRESSION_CONTEXT_RATIO);
  // IMPROVEMENTS.md §3.3: a forced pass (triggered on a context-overflow error)
  // skips the 80% threshold and compresses immediately instead of retrying the
  // same oversized payload.
  if (!force && estimatedContextTokens < compressionLimit) return false;

  const lastCompressedSize = compressedHistorySizes.get(messages);
  if (
    lastCompressedSize &&
    historyStr.length <= lastCompressedSize * COMPRESSION_GROWTH_RATIO
  ) {
    return false;
  }

  setTerminalActivity('compressing context');
  process.stdout.write(`[K  ${C.dim('⚙ compressing context...')}
`);
  try {
    const systemMessage = messages[0];
    let splitIdx = Math.max(1, messages.length - 6);
    while (splitIdx > 1 && messages[splitIdx].role === 'tool') splitIdx--;
    while (splitIdx > 1 && messages[splitIdx].role === 'assistant' && messages[splitIdx].tool_calls) {
      if (messages[splitIdx - 1] && messages[splitIdx - 1].role === 'user') { splitIdx = splitIdx - 1; break; }
      splitIdx--;
    }
    const messagesToSummarize = messages.slice(1, splitIdx);
    const messagesToKeep = messages.slice(splitIdx);
    const summaryMessages = [
      { role: 'system', content: 'You are a concise technical summarizer. Summarize the following coding session history. Focus on decisions made, code changes applied, files modified, and current system state. Keep it dense, structured, and under 500 words.' },
      { role: 'user', content: JSON.stringify(messagesToSummarize) },
    ];
    const summaryResponse = await createCompletion({ model, messages: summaryMessages, useCache: false, effort: 'low', stream: false });
    const summaryText = summaryResponse.choices[0].message.content;
    messages.length = 0;
    messages.push(systemMessage);
    messages.push({ role: 'system', content: `=== COMPRESSED HISTORICAL CONVERSATION CONTEXT ===
Below is a summary of the earlier part of this conversation (which has been compressed to save token usage):

${summaryText}
=================================================` });
    messages.push(...messagesToKeep);
    compressedHistorySizes.set(messages, JSON.stringify(messages).length);
    process.stdout.write(`[K  ${C.success('✔')} ${C.dim('context compressed')}
`);
    return true;
  } catch (compressErr) {
    const fallbackApplied = hardTruncateHistory(messages, modelContextLimit);
    if (fallbackApplied) {
      compressedHistorySizes.set(messages, JSON.stringify(messages).length);
      process.stdout.write(`[K  ${C.warn('⚠')} ${C.dim('context summary failed; oldest history truncated')}
`);
      return true;
    }
    process.stdout.write(`[K  ${C.warn('⚠')} ${C.dim('context compression failed, continuing')}
`);
    return false;
  }
}
