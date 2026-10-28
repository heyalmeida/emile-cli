import OpenAI from 'openai';
import { config, getActiveProviderDef, isValidProviderURL, isCustomProvider } from '../config.js';
import { getModelInfo } from '../models.js';
import { getRetryDelayMs, formatApiError } from './transports/base.js';
import { streamChatCompletions, requestChatCompletions } from './transports/chat-completions.js';
import { streamAnthropicMessages, requestAnthropicMessages, ANTHROPIC_BUDGET_BY_EFFORT } from './transports/anthropic-messages.js';
import { streamResponses, requestResponses } from './transports/responses.js';

// The retry mechanics now live in transports/base.js and are shared by every
// transport. Re-exported here so the public import surface (api/index.js,
// tests) is unchanged (plan § 7 decision 10).
export { getRetryDelayMs };

let openaiClient = null;
let currentClientKey = null;
let currentClientProvider = null;
let currentClientBaseURL = null;
let currentClientFormat = null;

/**
 * Get or initialize the OpenAI client configured for the active provider.
 * Re-initializes client if settings have changed.
 * @returns {OpenAI}
 */
export function getClient() {
  const activeDef = getActiveProviderDef();

  if (openaiClient && (currentClientKey !== config.apiKey || currentClientProvider !== config.provider || currentClientBaseURL !== (activeDef && activeDef.baseURL) || currentClientFormat !== (activeDef && activeDef.format))) {
    openaiClient = null;
  }

  if (!openaiClient) {
    currentClientKey = config.apiKey;
    currentClientProvider = config.provider;
    currentClientBaseURL = activeDef && activeDef.baseURL;
    currentClientFormat = activeDef && activeDef.format;

    if (activeDef && activeDef.isCustom) {
      if (!isValidProviderURL(activeDef.baseURL)) {
        throw new Error(`Provider "${activeDef.id}" has an invalid endpoint URL. Run /connect to fix it.`);
      }
      openaiClient = new OpenAI({
        apiKey: activeDef.apiKey || 'not-needed',
        baseURL: activeDef.baseURL,
        defaultHeaders: {
          'X-Title': 'Emile CLI',
        },
      });
      return openaiClient;
    }

    const options = { apiKey: config.apiKey };

    if (config.provider === 'openrouter') {
      options.baseURL = 'https://openrouter.ai/api/v1';
      options.defaultHeaders = {
        'HTTP-Referer': 'https://emile.luarvia.dev',
        'X-Title': 'Emile CLI',
      };
    } else if (config.provider === 'opencode') {
      // OpenCode Zen — curated gateway (https://opencode.ai/zen)
      options.baseURL = 'https://opencode.ai/zen/v1';
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
 * Builds the provider-specific reasoning request parameters.
 * OpenRouter uses the unified `reasoning` object; other OpenAI-compatible
 * providers keep the existing `reasoning_effort` compatibility path.
 * A custom chat-completions endpoint may override the body key via the slot's
 * `reasoningStyle` (spec § 3.1 rule 13) — reserved gateways never see it.
 */
export function buildReasoningParams({ provider, model, effort, reasoningStyle = '' }) {
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

  // Custom chat-completions endpoints: the slot names the body key this
  // endpoint understands. '' keeps the catalog-gated path below unchanged.
  if (reasoningStyle && isCustomProvider(provider)) {
    if (reasoningStyle === 'none' || !effort || effort === 'none') return {};
    const effortMap = { min: 'low', max: 'high' };
    const mapped = effortMap[effort] || effort;
    switch (reasoningStyle) {
      case 'reasoning_effort':
        // Sent unconditionally — no catalog reasoning gate for this dialect.
        return { reasoning_effort: mapped };
      case 'reasoning': {
        const openRouterMap = { min: 'minimal', max: 'max' };
        return { reasoning: { effort: openRouterMap[effort] || effort } };
      }
      case 'thinking': {
        // Same budget clamps as the anthropic-messages transport (AC-29).
        const budget = Math.max(1024, ANTHROPIC_BUDGET_BY_EFFORT[effort] ?? 4096);
        return { thinking: { type: 'enabled', budget_tokens: budget } };
      }
      case 'enable_thinking':
        return { enable_thinking: true };
      case 'chat_template_kwargs':
        return { chat_template_kwargs: { enable_thinking: true } };
      case 'effort':
        return { effort: mapped };
      case 'reasoningEffort':
        return { reasoningEffort: mapped };
      case 'both':
        return { reasoning_effort: mapped, enable_thinking: true };
      default:
        break;
    }
  }

  const info = getModelInfo(model);
  if (effort && info.reasoning && effort !== 'none') {
    const effortMap = { min: 'low', max: 'high' };
    return { reasoning_effort: effortMap[effort] || effort };
  }
  return {};
}

// `formatApiError` lives in transports/base.js now so every transport and
// its callers share one mapping; re-exported for the unchanged import surface.
export { formatApiError } from './transports/base.js';

/**
 * Creates a chat completion using the active provider's API.
 * Automatically retries up to MAX_RETRIES times on transient failures with
 * exponential backoff. Displays a discrete inline notice on each retry.
 *
 * Dispatches on the active slot's wire format (spec 2026-10-09-provider-system,
 * Stage B): the four reserved gateways and custom chat-completions endpoints
 * keep the existing SDK path byte-for-byte; `anthropic-messages` and
 * `responses` custom endpoints go through the fetch transports, whose
 * normalized chunks match the same frozen shape agent.js consumes.
 *
 * @param {object} params
 * @param {string}        params.model
 * @param {Array<object>} params.messages
 * @param {Array<object>} [params.tools]
 * @param {boolean}       [params.useCache]
 * @param {string}        [params.effort]
 * @param {boolean}       [params.stream]
 * @param {string}        [params.overrideModel] — used internally by fallback logic
 * @param {AbortSignal}   [params.signal] — aborts the in-flight HTTP request (turn cancel)
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
  signal = null,
}) {
  const activeDef = getActiveProviderDef();

  // ── Custom fetch formats: anthropic-messages / responses ─────────────
  if (activeDef && activeDef.isCustom && activeDef.format !== 'chat-completions') {
    if (!isValidProviderURL(activeDef.baseURL)) {
      throw new Error(`Provider "${activeDef.id}" has an invalid endpoint URL. Run /connect to fix it.`);
    }
    const activeModel = overrideModel || model;
    const opts = {
      def: { baseURL: activeDef.baseURL, apiKey: activeDef.apiKey },
      model: activeModel,
      messages,
      tools,
      effort,
      signal,
    };
    if (activeDef.format === 'anthropic-messages') {
      return stream ? streamAnthropicMessages(opts) : requestAnthropicMessages(opts);
    }
    return stream ? streamResponses(opts) : requestResponses(opts);
  }

  // ── Chat completions (gateways + custom) — unchanged SDK path ────────
  const client = getClient();
  const activeModel = overrideModel || model;

  const body = { model: activeModel, messages };
  if (process.env.EMILE_DEBUG_API) {
    const rp = buildReasoningParams({ provider: config.provider, model: activeModel, effort: config.defaultEffort });
    process.stderr.write(`[api] model=${activeModel} reasoning=${JSON.stringify(rp)}\n`);
  }

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  // Reasoning effort is capability-gated and normalized per provider;
  // custom chat-completions slots may pin the body key via reasoningStyle.
  Object.assign(body, buildReasoningParams({
    provider: config.provider,
    model: activeModel,
    effort,
    reasoningStyle: (activeDef && activeDef.isCustom && activeDef.format === 'chat-completions') ? activeDef.reasoningStyle : '',
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

  if (stream) return streamChatCompletions(client, callArgs, signal);

  return requestChatCompletions(client, callArgs, signal, formatApiError);
}
