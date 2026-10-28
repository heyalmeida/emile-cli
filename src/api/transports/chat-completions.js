/**
 * transports/chat-completions.js — the Chat Completions transport.
 *
 * Responsibility (Rule 4, one responsibility per file): every call to
 * `POST {baseURL}/chat/completions` through the OpenAI-compatible SDK, both
 * the streaming path (normalized chunks, yielded through the shared retry
 * driver) and the non-streaming path. All retry policy and SSE handling live
 * in ./base.js; this module holds only the SDK-specific request call.
 *
 * Wire contract: specs/2026-10-09-provider-system (Stage B, Annex A — A.3
 * shared HTTP mechanics, and the frozen normalized chunk shape of the A.1 /
 * A.2 intros).
 */
import { MAX_RETRIES, isRetryable, sleep, getRetryDelayMs, getErrorStatus, streamWithRetries } from './base.js';
import { C } from '../../ui/theme.js';

/**
 * Streams a Chat Completions request, yielding the SDK's chunks unchanged
 * (they already match the frozen normalized chunk shape). Retries only
 * happen before the first chunk.
 *
 * @param {import('openai').OpenAI} client
 * @param {object} callArgs — the request body (model, messages, tools, …)
 * @param {AbortSignal} [signal]
 * @yields {object} normalized chunk
 */
export async function* streamChatCompletions(client, callArgs, signal = null) {
  return yield* streamWithRetries({
    start: () => client.chat.completions.create({
      ...callArgs,
      stream: true,
      stream_options: { include_usage: true },
    }, signal ? { signal } : undefined),
    signal,
  });
}

/**
 * Creates a non-streaming Chat Completions request with the same bounded
 * retry loop and inline notices the streaming path uses.
 *
 * `formatError` exists to keep this module free of a circular import with
 * ../client.js (client.js will dispatch here once the transports are wired):
 * when omitted, formatApiError is loaded lazily on first use.
 *
 * @param {import('openai').OpenAI} client
 * @param {object} callArgs
 * @param {AbortSignal} [signal]
 * @param {(err:any, opts?:{model?:string})=>string} [formatError]
 * @returns {Promise<object>}
 */
export async function requestChatCompletions(client, callArgs, signal = null, formatError = null) {
  const format = formatError || (await import('../client.js')).formatApiError;

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw lastErr ?? new Error('Aborted');
    try {
      return await client.chat.completions.create(callArgs, signal ? { signal } : undefined);
    } catch (err) {
      lastErr = err;

      if (signal?.aborted || !isRetryable(err) || attempt === MAX_RETRIES) {
        // Aborted, not retryable, or exhausted — surface error (the abort
        // path is handled by the caller as a cancel, so stay silent here).
        if (!signal?.aborted) {
          process.stdout.write(`\r\x1B[K  ${C.red('✗')} ${C.muted(format(err, { model: callArgs?.model }))}\n`);
        }
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
