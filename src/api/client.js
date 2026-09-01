import OpenAI from 'openai';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import { C } from '../ui/theme.js';

let openaiClient = null;
let currentClientKey = null;
let currentClientProvider = null;

// Retry-able HTTP status codes and network error codes
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_CODES    = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ERR_SOCKET_CONNECTION_TIMEOUT']);

const MAX_RETRIES = 3;

function getErrorStatus(err) {
  const candidates = [err?.status, err?.response?.status, err?.error?.status, err?.error?.code];
  for (const candidate of candidates) {
    const status = Number(candidate);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  return null;
}

/**
 * Get or initialize the OpenAI client configured for the active provider.
 * Re-initializes client if settings have changed.
 * @returns {OpenAI}
 */
export function getClient() {
  if (openaiClient && (currentClientKey !== config.apiKey || currentClientProvider !== config.provider)) {
    openaiClient = null;
  }

  if (!openaiClient) {
    currentClientKey = config.apiKey;
    currentClientProvider = config.provider;

    const options = { apiKey: config.apiKey };

    if (config.provider === 'openrouter') {
      options.baseURL = 'https://openrouter.ai/api/v1';
      options.defaultHeaders = {
        'HTTP-Referer': 'https://github.com/ArctisDev/emile-cli',
        'X-Title': 'Emile CLI',
      };
    } else if (config.provider === 'opencode') {
      // OpenCode Zen — OpenAI-compatible gateway (https://opencode.ai)
      options.baseURL = 'https://api.opencode.ai/v1';
      options.defaultHeaders = {
        'X-Title': 'Emile CLI',
      };
    } else if (config.provider === 'opencode-go') {
      // OpenCode Go — curated open-source models (https://opencode.ai)
      options.baseURL = 'https://opencode.ai/zen/go/v1';
      options.defaultHeaders = {
        'X-Title': 'Emile CLI',
      };
    } else {
      // Default to Requesty
      options.baseURL = 'https://router.requesty.ai/v1';
    }

    openaiClient = new OpenAI(options);
  }

  return openaiClient;
}

/**
 * Discards the current OpenAI client instance, forcing it to recreate on next call.
 */
export function resetClient() {
  openaiClient = null;
}

/**
 * Returns true if the error is worth retrying (rate-limit, network, server error).
 */
function isRetryable(err) {
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
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Builds the provider-specific reasoning request parameters.
 * OpenRouter uses the unified `reasoning` object; other OpenAI-compatible
 * providers keep the existing `reasoning_effort` compatibility path.
 */
export function buildReasoningParams({ provider, model, effort }) {
  const isAnthropicNative = provider === 'anthropic' ||
    (provider === 'requesty' && /^(?:anthropic\/|claude)/i.test(String(model || '')));
  if (isAnthropicNative) {
    if (effort === 'none') return { thinking: { type: 'disabled' } };
    const budgetByEffort = { min: 512, low: 1024, medium: 4096, high: 8192, max: 16384 };
    const budgetTokens = budgetByEffort[effort];
    if (budgetTokens) return { thinking: { type: 'enabled', budget_tokens: budgetTokens } };
    return {};
  }
  if (provider === 'openrouter') {
    if (effort === 'none') return { reasoning: { effort: 'none' } };
    if (effort) {
      const effortMap = { min: 'minimal', max: 'max' };
      return { reasoning: { effort: effortMap[effort] || effort } };
    }
    return { reasoning: { enabled: true } };
  }

  const info = getModelInfo(model);
  if (effort && info.reasoning && effort !== 'none') {
    const effortMap = { min: 'low', max: 'high' };
    return { reasoning_effort: effortMap[effort] || effort };
  }
  return {};
}

/**
 * Computes the retry delay in ms. Honors the server's Retry-After header
 * (seconds or HTTP-date) when present — a fixed backoff against an explicit
 * server hint just burns attempts. Falls back to linear backoff.
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

/** Maps common provider failures to an actionable, secret-free UI message. */
export function formatApiError(err, { model = '' } = {}) {
  const status = getErrorStatus(err);
  const rawMessage = String(err?.error?.message || err?.message || '');
  const errorCode = err?.code || err?.error?.code;
  const message = rawMessage.toLowerCase();
  const safeModel = String(model || 'selected model').replace(/[\r\n\t]/g, ' ').slice(0, 100);
  const safeDetail = rawMessage
    .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[-_ ]?key|token|secret)\s*[:=]\s*)\S+/gi, '$1[redacted]')
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
 * Iterates a streaming request with bounded retries for failures that happen
 * before any response chunk is received. Replaying a partially rendered stream
 * would duplicate reasoning, text or tool-call deltas in the terminal.
 */
async function* streamWithRetries(client, callArgs) {
  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let receivedChunk = false;
    try {
      const responseStream = await client.chat.completions.create({
        ...callArgs,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of responseStream) {
        receivedChunk = true;
        yield chunk;
      }
      return;
    } catch (err) {
      lastErr = err;
      const retryable = !receivedChunk && isRetryable(err) && attempt < MAX_RETRIES;
      if (!retryable) throw err;

      const waitMs = getRetryDelayMs(err, attempt);
      const status = getErrorStatus(err);
      const retryMessage = status === 429
        ? `Rate limited. Waiting ${Math.round(waitMs / 1000)}s before retrying stream...`
        : `Stream failed before output. Retrying (${attempt}/${MAX_RETRIES}) in ${Math.round(waitMs / 1000)}s...`;
      process.stdout.write(`\r\x1B[K  ${C.warn('⚠')} ${C.muted(retryMessage)}\n`);
      await sleep(waitMs);
      process.stdout.write(`\r\x1B[K  ${C.warn('⟳')} ${C.muted(`Stream attempt ${attempt + 1}/${MAX_RETRIES}...`)}\n`);
    }
  }

  throw lastErr;
}

/**
 * Creates a chat completion using the active provider's API.
 * Automatically retries up to MAX_RETRIES times on transient failures with
 * exponential backoff. Displays a discrete inline notice on each retry.
 *
 * @param {object} params
 * @param {string}        params.model
 * @param {Array<object>} params.messages
 * @param {Array<object>} [params.tools]
 * @param {boolean}       [params.useCache]
 * @param {string}        [params.effort]
 * @param {boolean}       [params.stream]
 * @param {string}        [params.overrideModel] — used internally by fallback logic
 * @returns {Promise<object|AsyncIterable>}
 */
export async function createChatCompletion({
  model,
  messages,
  tools = [],
  useCache = true,
  effort = null,
  stream = false,
  overrideModel,
}) {
  const client = getClient();
  const activeModel = overrideModel || model;

  const body = { model: activeModel, messages };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  // Reasoning effort is capability-gated and normalized per provider.
  Object.assign(body, buildReasoningParams({
    provider: config.provider,
    model: activeModel,
    effort,
  }));

  // Cache hint for providers with explicit cache control (Requesty auto-caches)
  const extraBody = {};
  if (config.provider === 'requesty' && useCache) {
    extraBody.requesty = { auto_cache: true };
  }

  const callArgs = {
    ...body,
    extra_body: Object.keys(extraBody).length > 0 ? extraBody : undefined,
  };

  if (stream) return streamWithRetries(client, callArgs);

  // ── Retry loop ────────────────────────────────────────────────
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await client.chat.completions.create(callArgs);
    } catch (err) {
      lastErr = err;

      if (!isRetryable(err) || attempt === MAX_RETRIES) {
        // Not retryable or exhausted — surface error
        process.stdout.write(`\r\x1B[K  ${C.red('✗')} ${C.muted(formatApiError(err, { model: activeModel }))}\n`);
        throw err;
      }

      const waitMs = getRetryDelayMs(err, attempt);
      const retryMessage = getErrorStatus(err) === 429
        ? `Rate limited. Waiting ${Math.round(waitMs / 1000)}s before retry...`
        : `Connection failed. Retrying (${attempt}/${MAX_RETRIES}) in ${Math.round(waitMs / 1000)}s...`;
      process.stdout.write(`\r\x1B[K  ${C.warn('⚠')} ${C.muted(retryMessage)}\n`);
      await sleep(waitMs);
      process.stdout.write(`\r\x1B[K  ${C.warn('⟳')} ${C.muted(`Attempt ${attempt + 1}/${MAX_RETRIES}...`)}\n`);
    }
  }

  throw lastErr;
}
