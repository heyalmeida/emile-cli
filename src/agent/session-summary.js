// session-summary.js — bounded, periodic session-title refresh.
import { createChatCompletion } from '../api/index.js';

const SUMMARY_TRIGGER_TURNS = new Set([2]);
const SUMMARY_INTERVAL = 10;
const SUMMARY_MAX_CHARS = 120;
const SUMMARY_INPUT_MAX_CHARS = 24_000;

export function countCompletedTurns(messages) {
  if (!Array.isArray(messages)) return 0;
  return messages.filter(message => message?.role === 'user').length;
}

function shouldRefresh(turnCount) {
  return SUMMARY_TRIGGER_TURNS.has(turnCount) || (turnCount > 2 && turnCount % SUMMARY_INTERVAL === 0);
}

function compactMessages(messages) {
  const recent = (Array.isArray(messages) ? messages : [])
    .filter(message => message?.role !== 'system')
    .slice(-10)
    .map(message => ({
      role: message.role,
      content: typeof message.content === 'string' ? message.content.slice(-2_000) : message.content,
      tool_calls: Array.isArray(message.tool_calls)
        ? message.tool_calls.map(call => ({
          name: call?.function?.name,
          arguments: typeof call?.function?.arguments === 'string'
            ? call.function.arguments.slice(0, 500)
            : undefined,
        }))
        : undefined,
    }));

  return JSON.stringify(recent).slice(-SUMMARY_INPUT_MAX_CHARS);
}

/**
 * Refreshes a session title only at the documented cadence. Summary failures
 * are intentionally non-fatal and return the current title.
 */
export async function refreshSessionSummary({
  model,
  messages,
  currentSummary = '',
  turnCount,
  createCompletion = createChatCompletion,
}) {
  if (!shouldRefresh(turnCount)) return currentSummary;

  try {
    const response = await createCompletion({
      model,
      messages: [
        {
          role: 'system',
          content: 'Summarize this coding session in one concise title of at most 120 characters. Mention the main objective, files or subsystem involved, and current outcome. Do not include credentials, secrets, or tool argument values.',
        },
        { role: 'user', content: compactMessages(messages) },
      ],
      useCache: false,
      effort: 'low',
      stream: false,
    });
    const summary = response?.choices?.[0]?.message?.content;
    if (typeof summary !== 'string' || summary.trim().length === 0) return currentSummary;
    return summary.replace(/\s+/g, ' ').trim().slice(0, SUMMARY_MAX_CHARS);
  } catch {
    return currentSummary;
  }
}

export const SESSION_SUMMARY_INTERVAL = SUMMARY_INTERVAL;
