import OpenAI from 'openai';
import { config } from './config.js';

let openaiClient = null;
let currentClientKey = null;
let currentClientProvider = null;

// Retry-able HTTP status codes and network error codes
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_CODES    = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ERR_SOCKET_CONNECTION_TIMEOUT']);

const MAX_RETRIES = 3;

// Tokyo Night amber for inline warning (no ui.js dep here to avoid circular)
const ESC   = '\x1B';
const amber = (s) => `${ESC}[38;2;224;175;104m${s}${ESC}[0m`;
const muted = (s) => `${ESC}[38;2;86;95;137m${s}${ESC}[0m`;
const green = (s) => `${ESC}[38;2;158;206;106m${s}${ESC}[0m`;
const red   = (s) => `${ESC}[38;2;247;118;142m${s}${ESC}[0m`;

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
  if (err?.status && RETRYABLE_STATUSES.has(err.status)) return true;
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

  if (config.provider === 'openrouter') {
    body.include_reasoning = true;
  }

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  if (effort) {
    body.reasoning_effort = effort;
  }

  const extraBody = {};
  if (config.provider === 'requesty' && useCache) {
    extraBody.requesty = { auto_cache: true };
  }

  const callArgs = {
    ...body,
    extra_body: Object.keys(extraBody).length > 0 ? extraBody : undefined,
  };

  // ── Retry loop ────────────────────────────────────────────────
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (stream) {
        return await client.chat.completions.create({
          ...callArgs,
          stream: true,
          stream_options: { include_usage: true },
        });
      }
      return await client.chat.completions.create(callArgs);
    } catch (err) {
      lastErr = err;

      if (!isRetryable(err) || attempt === MAX_RETRIES) {
        // Not retryable or exhausted — surface error
        process.stdout.write(`\r\x1B[K  ${red('✗')} ${muted(`API error: ${err.message}`)}\n`);
        throw err;
      }

      const waitSecs = attempt * 1.5;
      process.stdout.write(
        `\r\x1B[K  ${amber('⚠')} ${muted(`Connection failed. Retrying (${attempt}/${MAX_RETRIES}) in ${waitSecs}s...`)}\n`
      );
      await sleep(waitSecs * 1000);
      process.stdout.write(`\r\x1B[K  ${amber('⟳')} ${muted(`Attempt ${attempt + 1}/${MAX_RETRIES}...`)}\n`);
    }
  }

  throw lastErr;
}
