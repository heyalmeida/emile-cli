/**
 * transports/responses.js — the OpenAI Responses SSE transport.
 *
 * Responsibility (Rule 4, one responsibility per file): the wire translation
 * for `POST {baseURL}/responses` — the effort → reasoning table, the pure
 * request builder that turns the internal OpenAI-shaped conversation into a
 * Responses body (`instructions` + flattened `input`) and the streaming half
 * that normalizes the provider's `response.*` events back into the frozen
 * chunk shape. The request layer is a function of its arguments: no network,
 * no output, no module state. Fetch, SSE consumption and the non-streaming
 * entry point live at the bottom of this file and are the only IO.
 *
 * Wire contract: specs/2026-10-09-provider-system, § 9 Annex A.2 (request
 * contract, reasoning parameter, SSE contract) and A.3 (shared HTTP
 * mechanics), AC-23 (request shape), AC-24 (response normalization),
 * AC-25 (`incomplete` reasons), AC-26 (redirect refusal), AC-27 (retry
 * discipline), AC-28 (malformed SSE tolerance) and AC-31 (no key leakage).
 * The normalized chunk shape yielded here is frozen by the consumer in
 * src/agent/agent.js — no Responses-native field may leak into it.
 */
import { aggregateChunks, sseJsonLines, streamWithRetries } from './base.js';
import { C } from '../../ui/theme.js';

// Effort → the provider's `reasoning.effort` vocabulary. `min` is spelled
// `minimal` by the API; every other internal label is already the wire value.
// An effort outside the table is sent unchanged (the provider owns its own
// vocabulary), so a new server-side tier needs no edit here.
export const RESPONSES_EFFORT_MAP = { min: 'minimal', low: 'low', medium: 'medium', high: 'high', max: 'max' };

// Argument fragments are bound to the skeleton recorded at
// `response.output_item.added`. When an event carries an unknown item id, the
// last index seen is the only sane target, and a turn with no recorded item
// yet is a single call at index 0.
const DEFAULT_OUTPUT_INDEX = 0;

/**
 * Resolves the `reasoning` parameter for one request.
 *
 * `summary: 'auto'` is mandatory alongside an enabled effort: reasoning text
 * is opt-in on this format, so nothing would arrive without it (Annex A.2).
 * Effort `none` — or no effort at all — omits the key entirely, leaving the
 * provider default untouched.
 *
 * @param {string|null} [effort] — session reasoning effort
 * @returns {{ reasoning?: { effort: string, summary: 'auto' } }}
 */
function resolveResponsesReasoning(effort) {
  if (!effort || effort === 'none') return {};
  return { reasoning: { effort: RESPONSES_EFFORT_MAP[effort] ?? effort, summary: 'auto' } };
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
 * Flattens the internal conversation into the Responses shape.
 *
 * - `system` messages are lifted out of the transcript into one string joined
 *   by blank lines for top-level `instructions`; no role `system` entry may
 *   ever reach `input`.
 * - A plain user or assistant message keeps its role with a string content.
 * - An assistant message with `tool_calls` becomes one `function_call` entry
 *   per call, carrying `call_id`, `name` and `arguments` kept as the JSON
 *   STRING it already is — unlike Anthropic, where the input is an object.
 *   Any text the same message carries is emitted as its own assistant entry
 *   first, so the call is not orphaned from what the model actually said.
 * - A role `tool` message becomes a `function_call_output` entry with
 *   `call_id` from the tool call id and a string `output`.
 *
 * Reasoning text (`reasoning_content`) is deliberately not replayed: the
 * encrypted reasoning item this format would require for a round-trip is not
 * stored (§ 5 limitation 1 applies unchanged to this transport).
 *
 * @param {any[]} messages — internal OpenAI-shaped conversation
 * @returns {{ instructions: string, input: object[] }}
 */
function toResponsesConversation(messages) {
  const systemParts = [];
  const input = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    const role = message?.role;
    if (typeof role !== 'string' || role === '') continue;

    if (role === 'system') {
      const text = contentText(message.content);
      if (text !== '') systemParts.push(text);
      continue;
    }

    if (role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: typeof message.tool_call_id === 'string' ? message.tool_call_id : '',
        output: contentText(message.content),
      });
      continue;
    }

    const text = contentText(message.content);
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

    if (role === 'assistant' && toolCalls.length > 0) {
      if (text !== '') input.push({ role, content: text });
      for (const call of toolCalls) {
        const args = call?.function?.arguments;
        input.push({
          type: 'function_call',
          call_id: typeof call?.id === 'string' ? call.id : '',
          name: typeof call?.function?.name === 'string' ? call.function.name : '',
          // Never parsed, never re-serialized when it already is a string:
          // the endpoint validates the JSON itself, and a lossy round-trip of
          // the model's own argument text would change the transcript.
          arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
        });
      }
      continue;
    }

    input.push({ role, content: text });
  }

  return { instructions: systemParts.join('\n\n'), input };
}

/**
 * OpenAI function tools → flat Responses tool descriptors: the `function`
 * wrapper is dropped and `name`, `description` and `parameters` sit at the
 * top level (Annex A.2). `strict` is never sent — a custom endpoint may
 * reject unknown fields, and strict mode would also demand an exact schema.
 *
 * @param {any[]} tools
 * @returns {{ type: 'function', name: string, description: string, parameters: object }[]}
 */
function toResponsesTools(tools) {
  const list = Array.isArray(tools) ? tools : [];
  return list.map((tool) => {
    const fn = tool?.function;
    return {
      type: 'function',
      name: typeof fn?.name === 'string' ? fn.name : '',
      description: typeof fn?.description === 'string' ? fn.description : '',
      parameters: fn?.parameters && typeof fn.parameters === 'object' ? fn.parameters : {},
    };
  });
}

/**
 * Builds the complete HTTP request for one Responses call: where it goes, how
 * it is authenticated and what body it carries. Pure — the caller owns the
 * transport, the retries and the key itself.
 *
 * The key is only ever placed in the `Authorization: Bearer` header value,
 * and that header is omitted entirely when the slot holds no key (AC-23).
 * Whether a keyless endpoint may be reached at all is decided by config's
 * localhost-only `http` gate, so nothing here reads or re-implements it. The
 * key never enters the URL or the body.
 *
 * `store` is explicitly `false` because the API defaults to storing, and this
 * client must not upload user transcripts; `stream` is `true` because the
 * frozen consumer shape is the streaming one — a non-streaming caller
 * aggregates these chunks instead (`requestResponses`).
 *
 * @param {object} params
 * @param {{ baseURL?: string, apiKey?: string }} params.def — active provider slot definition
 * @param {string} params.model — model identifier for the body
 * @param {any[]} params.messages — internal OpenAI-shaped conversation
 * @param {any[]} [params.tools] — internal OpenAI-shaped function tools
 * @param {string|null} [params.effort] — session reasoning effort
 * @returns {{ url: string, headers: Record<string,string>, body: object }}
 */
export function buildResponsesRequest({ def, model, messages, tools = [], effort = null }) {
  const url = `${String(def?.baseURL).replace(/\/+$/, '')}/responses`;
  const { instructions, input } = toResponsesConversation(messages);

  const body = {
    model,
    instructions,
    input,
    ...resolveResponsesReasoning(effort),
    store: false,
    stream: true,
  };

  const responsesTools = toResponsesTools(tools);
  if (responsesTools.length > 0) body.tools = responsesTools;

  const headers = { 'content-type': 'application/json' };
  if (typeof def?.apiKey === 'string' && def.apiKey !== '') {
    headers.Authorization = `Bearer ${def.apiKey}`;
  }

  return { url, headers, body };
}

// ──────────────────────────────────────────────────────────────
//  Streaming half — fetch + SSE normalization (Annex A.2 + A.3)
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
 * The `output_index` an event names, or `fallback` when it is missing or not
 * an integer — an untrusted provider value must never reach a yielded chunk
 * as anything the frozen shape cannot express.
 *
 * @param {any} value
 * @param {number} fallback
 * @returns {number}
 */
function indexValue(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

/**
 * The provider's error text shaped as `type: message` (e.g.
 * `server_error: Response terminated unexpectedly`) so `formatApiError` maps
 * it. Returns `''` when the object carries nothing usable, letting the caller
 * fall back.
 *
 * @param {any} error — a Responses error object (`{ type|code, message }`)
 * @returns {string}
 */
function providerErrorText(error) {
  const type = typeof error?.type === 'string' ? error.type : '';
  const code = typeof error?.code === 'string' ? error.code : '';
  const label = type !== '' ? type : code;
  const message = typeof error?.message === 'string' ? error.message : '';
  if (label !== '' && message !== '') return `${label}: ${message}`;
  return message || label;
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

  const error = parsed?.error ?? parsed;
  const err = new Error(providerErrorText(error) || text.trim() || 'Provider returned an error');
  err.status = res.status;
  err.headers = res.headers;
  return err;
}

/**
 * Opens one streaming request and returns the parsed SSE event stream.
 * Nothing is normalized here: the caller owns that, so a retry replays the
 * request and not a half-rendered answer.
 *
 * @param {object} params — the arguments of {@link streamResponses}
 * @returns {Promise<AsyncIterable<any>>}
 */
async function openResponsesStream({ def, model, messages, tools, effort, signal, fetchImpl }) {
  const { url, headers, body } = buildResponsesRequest({ def, model, messages, tools, effort });
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
 * Normalizes parsed Responses events into the frozen chunk shape (AC-24).
 * Exactly one chunk carries a `finish_reason` and the full usage — the final
 * one, from `response.completed` / `response.incomplete`, or the synthesized
 * terminal chunk when the provider never got that far.
 *
 * `response.created`, `response.in_progress`, `response.output_item.done`,
 * `response.output_text.done`, `response.function_call_arguments.done`, any
 * other `done` event and unknown types are finalize-only bookkeeping on the
 * provider side: they carry nothing into the frozen shape and re-emitting
 * from them would duplicate a delta, so they yield nothing (AC-24).
 *
 * @param {AsyncIterable<any>} events — parsed SSE payloads
 * @yields {object} normalized chunk
 */
async function* normalizeResponsesEvents(events) {
  /** item id → `output_index`, recorded when the function call skeleton was added. */
  const callIndexes = new Map();
  let lastKnownIndex = DEFAULT_OUTPUT_INDEX;
  // Sticky per turn: once any `function_call` item is added the turn ends as
  // `tool_calls`, whichever order the remaining events arrive in.
  let hasFunctionCall = false;
  let lastUsage = null;
  let sawTerminal = false;

  const usageFrom = (usage) => ({
    prompt_tokens: tokenCount(usage?.input_tokens),
    completion_tokens: tokenCount(usage?.output_tokens),
    // `input_tokens_details` is absent when the endpoint does not cache.
    prompt_tokens_details: { cached_tokens: tokenCount(usage?.input_tokens_details?.cached_tokens) },
  });

  const finalChunk = (finishReason) => ({
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    usage: lastUsage ?? usageFrom(null),
  });

  for await (const event of events) {
    switch (event?.type) {
      case 'response.output_text.delta': {
        // The field is named `delta`, never `text`.
        yield { choices: [{ index: 0, delta: { content: event.delta } }] };
        break;
      }

      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning_text.delta': {
        yield { choices: [{ index: 0, delta: { reasoning_content: event.delta } }] };
        break;
      }

      case 'response.output_item.added': {
        const item = event?.item;
        if (item?.type === 'function_call') {
          hasFunctionCall = true;
          const index = indexValue(event.output_index, lastKnownIndex);
          lastKnownIndex = index;
          if (typeof item.id === 'string') callIndexes.set(item.id, index);
          // The only place the call id and name appear — argument fragments
          // follow on `response.function_call_arguments.delta` and carry no id.
          yield {
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index,
                  id: item.call_id,
                  type: 'function',
                  function: { name: item.name, arguments: '' },
                }],
              },
            }],
          };
        }
        break;
      }

      case 'response.function_call_arguments.delta': {
        const index = callIndexes.has(event?.item_id) ? callIndexes.get(event.item_id) : lastKnownIndex;
        yield {
          choices: [{
            index: 0,
            delta: { tool_calls: [{ index, function: { arguments: event.delta } }] },
          }],
        };
        break;
      }

      case 'response.completed': {
        sawTerminal = true;
        const usage = event?.response?.usage;
        lastUsage = usageFrom(usage);
        yield {
          choices: [{ index: 0, delta: {}, finish_reason: hasFunctionCall ? 'tool_calls' : 'stop' }],
          usage: lastUsage,
        };
        break;
      }

      case 'response.incomplete': {
        sawTerminal = true;
        const usage = event?.response?.usage;
        lastUsage = usageFrom(usage);
        const reason = event?.response?.incomplete_details?.reason;
        // AC-25: only `max_output_tokens` is the frozen `length`; any other
        // reason maps to `stop`, and because the loss is invisible in the
        // chunk shape it has to be surfaced — same notice style as the retry
        // lines in base's stream driver.
        if (reason === 'max_output_tokens') {
          yield { choices: [{ index: 0, delta: {}, finish_reason: 'length' }], usage: lastUsage };
        } else {
          process.stdout.write(`\r\x1B[K  ${C.warn('⚠')} ${C.muted(`Response incomplete (${reason ?? 'no reason given'}) — the answer was cut short.`)}\n`);
          yield { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: lastUsage };
        }
        break;
      }

      case 'response.failed': {
        // No local retry: streamWithRetries owns the policy, and a failure
        // after the first chunk must surface immediately (AC-27).
        throw new Error(providerErrorText(event?.response?.error) || 'Provider returned an error');
      }

      case 'error': {
        // The Responses API `error` event carries `code`/`message` at the TOP
        // level, not nested under `error` — read both shapes so the provider's
        // own text still reaches formatApiError.
        throw new Error(providerErrorText(event?.error) || providerErrorText(event) || 'Provider returned an error');
      }

      default:
        // `response.created`, `response.in_progress`, `response.output_item.done`,
        // `response.output_text.done`, `response.function_call_arguments.done`,
        // any other `done` event and every unknown type land here: the full
        // text and arguments they carry are the sum of deltas already yielded,
        // so emitting from them would duplicate what the user has seen.
        break;
    }
  }

  // Truncated or eventless stream: callers must still see exactly one finish.
  if (!sawTerminal) yield finalChunk('stop');
}

/**
 * Streams one Responses turn as normalized chunks — the shape the agent loop
 * consumes, with the retry/abort discipline of base.
 *
 * @param {object} params
 * @param {{ baseURL?: string, apiKey?: string }} params.def — active provider slot definition
 * @param {string} params.model
 * @param {any[]} params.messages — internal OpenAI-shaped conversation
 * @param {any[]} [params.tools]
 * @param {string|null} [params.effort]
 * @param {AbortSignal} [params.signal]
 * @param {typeof globalThis.fetch} [params.fetchImpl] — injectable for hermetic tests
 * @yields {object} normalized chunk
 */
export async function* streamResponses({
  def,
  model,
  messages,
  tools = [],
  effort = null,
  signal = null,
  fetchImpl = globalThis.fetch,
}) {
  yield* normalizeResponsesEvents(streamWithRetries({
    start: () => openResponsesStream({ def, model, messages, tools, effort, signal, fetchImpl }),
    signal,
  }));
}

/**
 * Non-streaming call: aggregates the same normalized chunks into an
 * OpenAI-shaped response, so the compression and session-summary consumers
 * keep working on this format (§ 5 limitation 3, Annex A intro).
 *
 * @param {Parameters<typeof streamResponses>[0]} opts
 * @returns {Promise<object>}
 */
export async function requestResponses(opts) {
  return aggregateChunks(streamResponses(opts), opts.model);
}
