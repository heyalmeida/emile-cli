/**
 * transports/base.js — shared HTTP mechanics for every provider transport.
 *
 * Responsibility (Rule 4, one responsibility per file): the format-agnostic
 * plumbing every transport in src/api/transports/ reuses — the retry policy
 * and its inline notices, the shared SSE parser and the non-streaming
 * aggregation. It performs no provider-specific request building and no
 * network calls of its own beyond consuming a body handed to it.
 *
 * Wire contract: specs/2026-10-09-provider-system (Stage B, Annex A — A.3
 * shared HTTP mechanics, and the frozen normalized chunk shape of the A.1 /
 * A.2 intros).
 */
import { C } from '../../ui/theme.js';

// Retry-able HTTP status codes and network error codes
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_CODES    = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ERR_SOCKET_CONNECTION_TIMEOUT']);

const MAX_RETRIES = 3;

export { RETRYABLE_STATUSES, RETRYABLE_CODES, MAX_RETRIES };

/**
 * Extracts the HTTP status an error carries, if any, from the candidate
 * locations the SDK and fetch paths use.
 * @param {any} err
 * @returns {number|null}
 */
export function getErrorStatus(err) {
  const candidates = [err?.status, err?.response?.status, err?.error?.status, err?.error?.code];
  for (const candidate of candidates) {
    const status = Number(candidate);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  return null;
}

/**
 * Returns true if the error is worth retrying (rate-limit, network, server error).
 * @param {any} err
 * @returns {boolean}
 */
export function isRetryable(err) {
  const status = getErrorStatus(err);
  if (status && RETRYABLE_STATUSES.has(status)) return true;
  if (err?.code  && RETRYABLE_CODES.has(err.code))       return true;
  if (err?.cause?.code && RETRYABLE_CODES.has(err.cause.code)) return true;
  // OpenAI SDK wraps network errors as APIConnectionError
  if (err?.constructor?.name === 'APIConnectionError') return true;
  return false;
}

/**
 * Sleep for `ms` milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Computes the retry delay in ms. Honors the server's Retry-After header
 * (seconds or HTTP-date) when present — a fixed backoff against an explicit
 * server hint just burns attempts. Falls back to linear backoff.
 * @param {any} err
 * @param {number} attempt
 * @returns {number}
 */
export function getRetryDelayMs(err, attempt) {
  const retryAfter = err?.headers?.['retry-after'] ?? err?.headers?.get?.('retry-after');
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (!Number.isNaN(secs)) return secs * 1000;
    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  }
  if (getErrorStatus(err) === 429) return 10_000;
  return attempt * 1500;
}

/**
 * Maps common provider failures to an actionable, secret-free UI message.
 * Moved here from client.js with Stage B so every transport and its callers
 * share one error-mapping chokepoint; client.js re-exports it unchanged. The
 * redaction passes are additive: bearer tokens, `key: value` shapes and raw
 * `sk-…`/`sk-ant-…` key material never reach the terminal (AC-31).
 */
export function formatApiError(err, { model = '' } = {}) {
  const status = getErrorStatus(err);
  const rawMessage = String(err?.error?.message || err?.message || '');
  const errorCode = err?.code || err?.error?.code;
  const message = rawMessage.toLowerCase();
  const safeModel = String(model || 'selected model').replace(/[\r\n\t]/g, ' ').slice(0, 100);
  const safeDetail = rawMessage
    .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[-_ ]?key|token|secret)\s*[:=]\s*)\S+/gi, '$1[redacted]')
    .replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  const detail = safeDetail && !/^(provider returned(?: an)? error|api request failed)$/i.test(safeDetail)
    ? ` Details: ${safeDetail}`
    : '';

  if (status === 401 || /invalid api key|unauthorized|authentication/.test(message)) {
    return 'Authentication failed. Check your API key with /connect.';
  }
  if (status === 404 || /model not found|unknown model/.test(message)) {
    return `Model "${safeModel}" not found for this provider. Use /model to switch.`;
  }
  if (status === 413 || (status === 400 && /context (length|size|window|too long)|maximum context|too many tokens|request too large|prompt too long/.test(message))) {
    return 'Context window exceeded. Compressing history and retrying...';
  }
  if (status === 402 || /insufficient (credits?|funds?)|payment required|quota exceeded|billing/.test(message)) {
    return `Provider quota or billing rejected the request${status ? ` (${status})` : ''}. Check the provider account, model limits and search/tool charges.`;
  }
  if (status === 403) {
    return `Provider denied this request (403). Check model access and account permissions.${detail}`;
  }
  if (status === 429) {
    return 'Rate limited. Waiting 10s before retry...';
  }
  if (errorCode === 'ETIMEDOUT' || errorCode === 'ERR_SOCKET_CONNECTION_TIMEOUT' || err?.cause?.code === 'ETIMEDOUT') {
    return 'Request timed out. Check your connection.';
  }
  if (status >= 500) {
    return `Provider server error (${status}). Try again or switch provider/model.${detail}`;
  }
  if (status >= 400) {
    return `Provider rejected the request (${status}). Check the model and tool parameters.${detail}`;
  }
  if (errorCode) {
    return `Provider connection failed (${String(errorCode).slice(0, 40)}). Check your network and provider settings.${detail}`;
  }
  return `API request failed. Check your provider settings and connection.${detail}`;
}

/**
 * The single retry driver every transport streams through.
 *
 * `start` is an async function returning an async iterable of already
 * normalized chunks. Retries are attempted only for failures that happen
 * before any chunk is received — replaying a partially rendered stream would
 * duplicate reasoning, text or tool-call deltas in the terminal.
 *
 * @param {object}   params
 * @param {Function} params.start   — async () => AsyncIterable<normalized chunk>
 * @param {AbortSignal} [params.signal]
 * @yields {object} normalized chunk
 */
export async function* streamWithRetries({ start, signal }) {
  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let receivedChunk = false;
    if (signal?.aborted) throw lastErr ?? new Error('Aborted');
    try {
      const responseStream = await start();

      for await (const chunk of responseStream) {
        receivedChunk = true;
        yield chunk;
      }
      return;
    } catch (err) {
      lastErr = err;
      // A cancel/signal abort must never be retried — throw immediately.
      if (signal?.aborted) throw err;
      const retryable = !receivedChunk && isRetryable(err) && attempt < MAX_RETRIES;
      if (!retryable) throw err;

      const waitMs = getRetryDelayMs(err, attempt);
      const status = getErrorStatus(err);
      const retryMessage = status === 429
        ? `Rate limited. Waiting ${Math.round(waitMs / 1000)}s before retrying stream...`
        : `Stream failed before output. Retrying (${attempt}/${MAX_RETRIES}) in ${Math.round(waitMs / 1000)}s...`;
      process.stdout.write(`\r\x1B[K  ${C.warn('⚠')} ${C.muted(retryMessage)}\n`);
      await sleep(waitMs);
      if (signal?.aborted) throw err;
      process.stdout.write(`\r\x1B[K  ${C.warn('⟳')} ${C.muted(`Stream attempt ${attempt + 1}/${MAX_RETRIES}...`)}\n`);
    }
  }

  throw lastErr;
}

/**
 * Normalizes one SSE event block into a payload string, or null when the
 * event carries no data (comment, keep-alive blank pair, id/retry/event only).
 * @param {string} block
 * @returns {string|null}
 */
function extractSsePayload(block) {
  const parts = [];
  for (const rawLine of block.split(/\r?\n/)) {
    if (rawLine === '' || rawLine.startsWith(':')) continue;
    if (!rawLine.startsWith('data:')) continue;
    const value = rawLine.slice(5);
    parts.push(value.startsWith(' ') ? value.slice(1) : value);
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Splits a text buffer into complete SSE event blocks on blank lines.
 * Kept separate so the same boundary rule is used by every caller of the
 * parser regardless of how the body is delivered.
 * @param {string} text
 * @returns {{ blocks: string[], rest: string }}
 */
function splitSseEvents(text) {
  const blocks = [];
  let rest = text;

  for (;;) {
    const match = /\r?\n[ \t]*\r?\n/.exec(rest);
    if (!match) break;
    blocks.push(rest.slice(0, match.index));
    rest = rest.slice(match.index + match[0].length);
  }

  return { blocks, rest };
}

/**
 * The shared SSE parser for the fetch transports. Accepts a ReadableStream
 * (a fetch response body) or any async iterable of Uint8Array/string chunks.
 * A data line whose JSON does not parse is skipped and counted, never fatal.
 *
 * @param {ReadableStream|AsyncIterable<Uint8Array|string>} body
 * @param {object} [options]
 * @param {(count:number)=>void} [options.onMalformed] — called with the running count of skipped payloads
 * @yields {any} the parsed JSON payload of each data-bearing event
 */
export async function* sseJsonLines(body, { onMalformed } = {}) {
  let malformedCount = 0;
  let pending = '';

  const handle = (block) => {
    const payload = extractSsePayload(block);
    if (payload === null) return null;
    try {
      return JSON.parse(payload);
    } catch {
      malformedCount++;
      if (onMalformed) onMalformed(malformedCount);
      return null;
    }
  };

  const drain = function* (flushTail) {
    const { blocks, rest } = splitSseEvents(pending);
    pending = rest;
    for (const block of blocks) {
      const event = handle(block);
      if (event !== null) yield event;
    }
    if (flushTail && pending !== '') {
      const tail = pending;
      pending = '';
      const event = handle(tail);
      if (event !== null) yield event;
    }
  };

  // One decoder for every source: a fresh TextDecoder per chunk would drop the
  // bytes of a multi-byte character split across a chunk boundary.
  const decoder = new TextDecoder();

  for await (const rawChunk of body) {
    if (typeof rawChunk === 'string') {
      pending += rawChunk;
    } else {
      pending += decoder.decode(rawChunk, { stream: true });
    }
    yield* drain(false);
  }

  // Flush the decoder once at the end so a trailing partial sequence is emitted.
  pending += decoder.decode();
  yield* drain(true);
}

/**
 * Collects SSE events from a body into an array. Convenience wrapper over
 * {@link sseJsonLines} for non-streaming reads.
 * @param {ReadableStream|AsyncIterable<Uint8Array|string>} body
 * @param {object} [options]
 * @param {(count:number)=>void} [options.onMalformed]
 * @returns {Promise<any[]>}
 */
export async function collectSseEvents(body, options = {}) {
  const events = [];
  for await (const event of sseJsonLines(body, options)) events.push(event);
  return events;
}

/**
 * Aggregates normalized chunks into an OpenAI-shaped non-streaming response,
 * so a `stream: false` fetch call stays interchangeable with the SDK path for
 * the agent, compression and session-summary consumers.
 *
 * @param {AsyncIterable<object>} chunks
 * @param {string} model
 * @returns {Promise<object>}
 */
export async function aggregateChunks(chunks, model) {
  let content = '';
  let reasoningContent = '';
  let finishReason = null;
  let usage = null;
  /** @type {Map<number, { id: string, type: string, function: { name: string, arguments: string } }>} */
  const toolCalls = new Map();

  for await (const chunk of chunks) {
    const choice = chunk?.choices?.[0];
    const delta = choice?.delta;
    if (delta) {
      if (typeof delta.content === 'string') content += delta.content;
      const reasoning = delta.reasoning_content ?? delta.reasoning;
      if (typeof reasoning === 'string') reasoningContent += reasoning;
      for (const call of delta.tool_calls || []) {
        const index = Number.isInteger(call.index) ? call.index : toolCalls.size;
        let entry = toolCalls.get(index);
        if (!entry) {
          entry = { id: call.id ?? '', type: call.type ?? 'function', function: { name: '', arguments: '' } };
          toolCalls.set(index, entry);
        }
        if (call.id) entry.id = call.id;
        if (call.type) entry.type = call.type;
        if (call.function?.name) entry.function.name += call.function.name;
        if (typeof call.function?.arguments === 'string') entry.function.arguments += call.function.arguments;
      }
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk?.usage) usage = chunk.usage;
  }

  const message = { role: 'assistant', content: content === '' ? null : content };
  if (reasoningContent !== '') message.reasoning_content = reasoningContent;
  if (toolCalls.size > 0) {
    message.tool_calls = [...toolCalls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, call]) => call);
  }

  return {
    id: `chatcmpl-${model}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message, finish_reason: finishReason ?? 'stop' }],
    ...(usage ? { usage } : {}),
  };
}
