/**
 * transports/anthropic-messages.js — the Anthropic Messages transport.
 *
 * Responsibility (Rule 4, one responsibility per file): the wire translation
 * for `POST {baseURL}/messages` — the effort → thinking-budget table, the
 * stop-reason mapping and the pure request builder that turns the internal
 * OpenAI-shaped conversation into an Anthropic body. Every export of that
 * request layer is a function of its arguments: no network, no output, no
 * module state. The streaming half (fetch + SSE normalization) and its
 * non-streaming entry point now live at the bottom of this file, and are the
 * only IO this transport performs.
 *
 * Wire contract: specs/2026-10-09-provider-system, § 9 Annex A.1 (request
 * contract, SSE contract + reasoning parameter) and A.3 (shared HTTP
 * mechanics), AC-21 (request shape), AC-25 (stop reasons)
 * and AC-30 (thinking disabled once the conversation carries tool results).
 * The normalized chunk shape the streaming half of this transport must yield
 * is frozen by the consumer in src/agent/agent.js.
 */
import { aggregateChunks, sseJsonLines, streamWithRetries } from './base.js';
import { C } from '../../ui/theme.js';

// Effort → thinking budget, defined once here and reused by the `thinking`
// reasoningStyle of the chat-completions transport so the two clamp paths
// cannot drift (plan § 7 decision 12, AC-29).
export const ANTHROPIC_BUDGET_BY_EFFORT = { min: 1024, low: 1024, medium: 4096, high: 8192, max: 16384 };

/**
 * Anthropic `stop_reason` → the frozen `choices[0].finish_reason` vocabulary.
 * The enum is complete per AC-25: `end_turn`, `stop_sequence`, `refusal` and
 * `pause_turn` map to `stop`, `tool_use` to `tool_calls`, and `max_tokens` /
 * `model_context_window_exceeded` to `length`. `pause_turn` is lossy on
 * purpose — continuation is not implemented in v1, so the stream side also
 * surfaces a visible notice that the provider paused the turn (§ 5 limitation 2).
 *
 * @type {Record<string, 'stop'|'tool_calls'|'length'>}
 */
export const ANTHROPIC_STOP_REASON_MAP = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  refusal: 'stop',
  pause_turn: 'stop',
  tool_use: 'tool_calls',
  max_tokens: 'length',
  model_context_window_exceeded: 'length',
};

const DEFAULT_MAX_TOKENS = 8192;   // AC-21: max_tokens is required, 8192 when the caller sets none
const MIN_THINKING_BUDGET = 1024;  // API floor — a smaller budget is rejected outright
const ANSWER_HEADROOM = 1024;      // tokens kept outside the budget so reasoning cannot eat the answer

/**
 * Resolves the `thinking` parameter and `max_tokens` for one request.
 *
 * Two invariants hold on every enabled result (Annex A.1):
 *  1. `budget_tokens` is at least 1024, the smallest budget the API accepts;
 *  2. `budget_tokens` is always strictly below `max_tokens` — a budget that
 *     leaves no room for the visible answer is rejected, so the budget is
 *     clipped to `max_tokens - 1024` rather than the cap being raised. The
 *     exception is effort `max`, where the caller asked for the deepest
 *     thinking available and `max_tokens` is raised to budget + 1024 instead.
 *
 * An effort outside the table falls back to the medium budget, and no effort
 * at all sends no `thinking` key: the provider default is left untouched.
 *
 * @param {object}  params
 * @param {string|null} [params.effort] — session reasoning effort (`none` disables thinking)
 * @param {number|null} [params.maxTokens] — caller-supplied output cap
 * @param {boolean} [params.hasToolResults] — the conversation carries tool results,
 *   in which case thinking is disabled: the internal message shape stores
 *   reasoning as a plain string, so a signed thinking block cannot be returned
 *   unmodified next to its `tool_use` (§ 5 limitation 1, AC-30).
 * @returns {{ thinking?: { type: 'disabled' }|{ type: 'enabled', budget_tokens: number }, max_tokens: number }}
 */
export function resolveAnthropicThinking({ effort, maxTokens, hasToolResults }) {
  let start = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : DEFAULT_MAX_TOKENS;
  if (!effort) return { max_tokens: start };
  if (effort === 'none' || hasToolResults === true) return { thinking: { type: 'disabled' }, max_tokens: start };

  const budget = Math.max(MIN_THINKING_BUDGET, ANTHROPIC_BUDGET_BY_EFFORT[effort] ?? 4096);
  if (effort === 'max') start = Math.max(start, budget + ANSWER_HEADROOM);

  const clamped = Math.min(budget, start - ANSWER_HEADROOM);
  if (clamped < MIN_THINKING_BUDGET) {
    // The cap cannot hold both a legal budget and an answer — lift the cap to
    // the smallest pair that satisfies both invariants.
    return { thinking: { type: 'enabled', budget_tokens: MIN_THINKING_BUDGET }, max_tokens: MIN_THINKING_BUDGET + ANSWER_HEADROOM };
  }
  return { thinking: { type: 'enabled', budget_tokens: clamped }, max_tokens: start };
}

/**
 * True when any message in the conversation is a tool result. Callers pass
 * the answer as `hasToolResults` to {@link resolveAnthropicThinking}.
 *
 * @param {any[]} messages — internal OpenAI-shaped conversation
 * @returns {boolean}
 */
export function hasToolResultsIn(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some(message => message?.role === 'tool');
}

/**
 * Safest readable text of an internal message's `content`. The loop only ever
 * stores strings, but a malformed message must not throw while building a
 * request — array parts (the OpenAI multimodal shape) contribute their text.
 *
 * @param {any} content
 * @returns {string}
 */
function contentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}

/**
 * Parses a tool call's argument string into the object Anthropic expects in
 * `tool_use.input`. Unparsable or non-object arguments degrade to `{}`: the
 * endpoint is stricter about the shape than the model is about its own output.
 *
 * @param {any} args
 * @returns {object}
 */
function parseToolInput(args) {
  try {
    const parsed = JSON.parse(args || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * OpenAI function tools → Anthropic tool descriptors: the `function` wrapper
 * is dropped and `parameters` becomes `input_schema` (Annex A.1).
 *
 * @param {any[]} tools
 * @returns {{ name: string, description: string, input_schema: object }[]}
 */
function toAnthropicTools(tools) {
  const list = Array.isArray(tools) ? tools : [];
  return list.map((tool) => {
    const fn = tool?.function;
    return {
      name: typeof fn?.name === 'string' ? fn.name : '',
      description: typeof fn?.description === 'string' ? fn.description : '',
      input_schema: fn?.parameters && typeof fn.parameters === 'object' ? fn.parameters : {},
    };
  });
}

/**
 * Flattens the internal conversation into the Anthropic shape.
 *
 * - `system` messages are lifted out of the transcript into one string joined
 *   by blank lines; no role `system` entry may ever reach `messages`.
 * - An assistant message with `tool_calls` becomes block content: a `text`
 *   block first when it also has text, then one `tool_use` block per call.
 * - Role `tool` messages are buffered and emitted as ONE user message whose
 *   content starts with the `tool_result` blocks, placed immediately after the
 *   assistant `tool_use` message they answer.
 * - Any other message keeps its role with string content.
 *
 * Reasoning text (`reasoning_content`) is deliberately not replayed — the
 * signature that would make a thinking block legal to resend is not stored
 * (§ 5 limitation 1).
 *
 * @param {any[]} messages
 * @returns {{ system: string, messages: object[] }}
 */
function toAnthropicConversation(messages) {
  const systemParts = [];
  const conversation = [];
  let pendingResults = [];

  const flushResults = () => {
    if (pendingResults.length === 0) return;
    conversation.push({ role: 'user', content: pendingResults });
    pendingResults = [];
  };

  for (const message of Array.isArray(messages) ? messages : []) {
    const role = message?.role;
    if (typeof role !== 'string' || role === '') continue;

    if (role === 'system') {
      const text = contentText(message.content);
      if (text !== '') systemParts.push(text);
      continue;
    }

    if (role === 'tool') {
      pendingResults.push({
        type: 'tool_result',
        tool_use_id: typeof message.tool_call_id === 'string' ? message.tool_call_id : '',
        content: contentText(message.content),
      });
      continue;
    }

    flushResults();

    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (role === 'assistant' && toolCalls.length > 0) {
      const text = contentText(message.content);
      const blocks = text !== '' ? [{ type: 'text', text }] : [];
      for (const call of toolCalls) {
        blocks.push({
          type: 'tool_use',
          id: typeof call?.id === 'string' ? call.id : '',
          name: typeof call?.function?.name === 'string' ? call.function.name : '',
          input: parseToolInput(call?.function?.arguments),
        });
      }
      conversation.push({ role: 'assistant', content: blocks });
      continue;
    }

    conversation.push({ role, content: contentText(message.content) });
  }

  flushResults();
  return { system: systemParts.join('\n\n'), messages: conversation };
}

/**
 * Builds the complete HTTP request for one Anthropic Messages call: where it
 * goes, how it is authenticated and what body it carries. Pure — the caller
 * owns the transport, the retries and the key itself.
 *
 * The key is only ever placed in the `x-api-key` header value, never in the
 * URL or the body. `temperature` and `top_p` are never emitted: thinking
 * sampling is the provider's, and a stale client-side temperature would be
 * rejected alongside an enabled thinking budget (Annex A.1).
 *
 * @param {object} params
 * @param {{ baseURL?: string, apiKey?: string }} params.def — active provider slot definition
 * @param {string} params.model — model identifier for the body
 * @param {any[]} params.messages — internal OpenAI-shaped conversation
 * @param {any[]} [params.tools] — internal OpenAI-shaped function tools
 * @param {string|null} [params.effort] — session reasoning effort
 * @param {number|null} [params.maxTokens] — caller-supplied output cap
 * @returns {{ url: string, headers: Record<string,string>, body: object }}
 */
export function buildAnthropicMessagesRequest({ def, model, messages, tools = [], effort = null, maxTokens = null }) {
  const url = `${String(def?.baseURL).replace(/\/+$/, '')}/messages`;
  const { system, messages: conversation } = toAnthropicConversation(messages);

  const body = {
    model,
    ...resolveAnthropicThinking({ effort, maxTokens, hasToolResults: hasToolResultsIn(messages) }),
    system,
    messages: conversation,
  };

  const anthropicTools = toAnthropicTools(tools);
  if (anthropicTools.length > 0) body.tools = anthropicTools;

  return {
    url,
    headers: {
      'x-api-key': def?.apiKey || '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body,
  };
}

// ──────────────────────────────────────────────────────────────
//  Streaming half — fetch + SSE normalization (Annex A.1 + A.3)
//
//  Everything below this line is the only IO this transport owns. The retry
//  policy, the abort discipline and the inline notices come from base's
//  streamWithRetries; the chunk shape is frozen by src/agent/agent.js, so no
//  provider-native field may be added to a yielded chunk.
// ──────────────────────────────────────────────────────────────

/** `usage` fields arrive only on the events that carry them; absent is zero. */
function tokenCount(value) {
  return Number.isFinite(value) ? value : 0;
}

/**
 * The provider's error text shaped as `type: message` (e.g.
 * `overloaded_error: Overloaded`) so `formatApiError` maps it. Returns `''`
 * when the object carries nothing usable, letting the caller fall back.
 *
 * @param {any} error — an Anthropic error object (`{ type, message }`)
 * @returns {string}
 */
function providerErrorText(error) {
  const type = typeof error?.type === 'string' ? error.type : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  if (type !== '' && message !== '') return `${type}: ${message}`;
  return message || type;
}

/**
 * Wraps a non-2xx answer into an `Error` carrying the numeric status, so
 * base's `getErrorStatus`/`isRetryable` and `formatApiError` work unchanged
 * (Annex A.3). The body is read and parsed best-effort: an endpoint that
 * answers 500 with an unreadable or non-JSON body must still surface the
 * status — the retry decision depends on it, not on the text.
 *
 * `headers` is attached because AC-27 requires honoring `Retry-After`;
 * `getRetryDelayMs` reads it off the error. This never happens on the 3xx
 * path, where no response header may be touched at all.
 *
 * @param {Response} res
 * @returns {Promise<Error & { status: number, headers: any }>}
 */
async function toHttpError(res) {
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = ''; // Body unreadable — the status alone is enough to classify.
  }

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null; // Plain-text and HTML error bodies stay as they came.
  }

  const err = new Error(providerErrorText(parsed?.error) || text.trim() || 'Provider returned an error');
  err.status = res.status;
  err.headers = res.headers;
  return err;
}

/**
 * Opens one streaming request and returns the parsed SSE event stream.
 * Nothing is normalized here: the caller owns that, so a retry replays the
 * request and not a half-rendered answer.
 *
 * @param {object} params — the arguments of {@link streamAnthropicMessages}
 * @returns {Promise<AsyncIterable<any>>}
 */
async function openAnthropicMessagesStream({ def, model, messages, tools, effort, maxTokens, signal, fetchImpl }) {
  const { url, headers, body } = buildAnthropicMessagesRequest({ def, model, messages, tools, effort, maxTokens });
  const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal, redirect: 'manual' });

  // AC-26 (threat item 1): any 3xx is fatal and no response header is read —
  // following the redirect is exactly how the key would reach another host.
  if (res.status >= 300 && res.status <= 399) {
    throw new Error('Endpoint redirected (HTTP ' + res.status + ') — refusing to send your key to another host. Check the provider URL with /connect.');
  }

  if (!res.ok) throw await toHttpError(res);

  // AC-28: a `data:` payload whose JSON does not parse is skipped and counted
  // by base's parser; the count has no consumer yet, so it is only tallied.
  const malformed = { count: 0 };
  return sseJsonLines(res.body, {
    onMalformed: (count) => {
      malformed.count = count;
    },
  });
}

/**
 * Normalizes parsed Anthropic events into the frozen chunk shape (AC-22).
 * Exactly one chunk carries a `finish_reason` and the full usage — the final
 * one, from `message_delta`, or the synthesized terminal chunk when the
 * provider never got that far.
 *
 * `ping`, `content_block_stop`, `message_stop`, `signature_delta` and unknown
 * events or delta types carry nothing into the frozen shape and are ignored
 * (Annex A.1).
 *
 * @param {AsyncIterable<any>} events — parsed SSE payloads
 * @yields {object} normalized chunk
 */
async function* normalizeAnthropicEvents(events) {
  let inputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;
  let sawMessageDelta = false;

  const finalChunk = (finishReason) => ({
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    usage: {
      // Bare `input_tokens` undercounts once caching is on (AC-22): the
      // provider reports the three prompt buckets separately.
      prompt_tokens: inputTokens + cacheCreationTokens + cacheReadTokens,
      completion_tokens: outputTokens,
      prompt_tokens_details: { cached_tokens: cacheReadTokens },
    },
  });

  for await (const event of events) {
    // The `type` field inside each data object equals the event name.
    switch (event?.type) {
      case 'message_start': {
        const usage = event?.message?.usage;
        inputTokens = tokenCount(usage?.input_tokens);
        cacheCreationTokens = tokenCount(usage?.cache_creation_input_tokens);
        cacheReadTokens = tokenCount(usage?.cache_read_input_tokens);
        outputTokens = tokenCount(usage?.output_tokens);
        break;
      }

      case 'content_block_start': {
        const block = event?.content_block;
        if (block?.type === 'tool_use') {
          // The only place the tool id and name appear — argument fragments
          // follow on `input_json_delta` and carry the index alone.
          yield {
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: event.index,
                  id: block.id,
                  type: 'function',
                  function: { name: block.name, arguments: '' },
                }],
              },
            }],
          };
        }
        break;
      }

      case 'content_block_delta': {
        const delta = event?.delta;
        if (delta?.type === 'text_delta') {
          yield { choices: [{ index: 0, delta: { content: delta.text } }] };
        } else if (delta?.type === 'thinking_delta') {
          yield { choices: [{ index: 0, delta: { reasoning_content: delta.thinking } }] };
        } else if (delta?.type === 'input_json_delta') {
          yield {
            choices: [{
              index: 0,
              delta: { tool_calls: [{ index: event.index, function: { arguments: delta.partial_json } }] },
            }],
          };
        }
        break;
      }

      case 'message_delta': {
        sawMessageDelta = true;
        const stopReason = event?.delta?.stop_reason;
        // Only a string value of the map is a mapped reason: an untrusted
        // provider sending e.g. "constructor" would otherwise hit the object
        // prototype instead of the unknown fallback.
        const mapped = ANTHROPIC_STOP_REASON_MAP[stopReason];
        const finishReason = typeof mapped === 'string' ? mapped : 'stop';
        if (stopReason === 'pause_turn') {
          // § 5 limitation 2: `pause_turn` maps to `stop` because v1 has no
          // continuation, so the loss has to be visible — same notice style
          // as the retry lines in base's stream driver.
          process.stdout.write(`\r\x1B[K  ${C.warn('⚠')} ${C.muted('Provider paused the turn — send the message again to continue.')}\n`);
        }
        if (Number.isFinite(event?.usage?.output_tokens)) outputTokens = event.usage.output_tokens;
        yield finalChunk(finishReason);
        break;
      }

      case 'error': {
        // No local retry: streamWithRetries owns the policy, and an error
        // after the first chunk must surface immediately (AC-27).
        throw new Error(providerErrorText(event?.error) || 'Provider returned an error');
      }

      default:
        break;
    }
  }

  if (!sawMessageDelta) yield finalChunk('stop');
}

/**
 * Streams one Anthropic Messages turn as normalized chunks — the shape the
 * agent loop consumes, with the retry/abort discipline of base.
 *
 * @param {object} params
 * @param {{ baseURL?: string, apiKey?: string }} params.def — active provider slot definition
 * @param {string} params.model
 * @param {any[]} params.messages — internal OpenAI-shaped conversation
 * @param {any[]} [params.tools]
 * @param {string|null} [params.effort]
 * @param {number|null} [params.maxTokens]
 * @param {AbortSignal} [params.signal]
 * @param {typeof globalThis.fetch} [params.fetchImpl] — injectable for hermetic tests
 * @yields {object} normalized chunk
 */
export async function* streamAnthropicMessages({
  def,
  model,
  messages,
  tools = [],
  effort = null,
  maxTokens = null,
  signal = null,
  fetchImpl = globalThis.fetch,
}) {
  yield* normalizeAnthropicEvents(streamWithRetries({
    start: () => openAnthropicMessagesStream({ def, model, messages, tools, effort, maxTokens, signal, fetchImpl }),
    signal,
  }));
}

/**
 * Non-streaming call: aggregates the same normalized chunks into an
 * OpenAI-shaped response, so the compression and session-summary consumers
 * keep working on this format (Annex A, intro).
 *
 * @param {Parameters<typeof streamAnthropicMessages>[0]} opts
 * @returns {Promise<object>}
 */
export async function requestAnthropicMessages(opts) {
  return aggregateChunks(streamAnthropicMessages(opts), opts.model);
}
