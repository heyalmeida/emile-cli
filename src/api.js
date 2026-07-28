import OpenAI from 'openai';
import { config } from './config.js';

let openaiClient = null;
let currentClientKey = null;
let currentClientProvider = null;

/**
 * Get or initialize the OpenAI client configured for the active provider.
 * Re-initializes client if settings have changed.
 * @returns {OpenAI}
 */
export function getClient() {
  // If config changed, discard cached client
  if (openaiClient && (currentClientKey !== config.apiKey || currentClientProvider !== config.provider)) {
    openaiClient = null;
  }

  if (!openaiClient) {
    currentClientKey = config.apiKey;
    currentClientProvider = config.provider;

    const options = {
      apiKey: config.apiKey,
    };

    if (config.provider === 'openrouter') {
      options.baseURL = 'https://openrouter.ai/api/v1';
      options.defaultHeaders = {
        'HTTP-Referer': 'https://github.com/ArctisDev/emile-cli',
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
 * Creates a chat completion using the active provider's API.
 * @param {object} params
 * @param {string} params.model The model name
 * @param {Array<object>} params.messages Conversation history
 * @param {Array<object>} [params.tools] Excluded if empty
 * @param {boolean} [params.useCache] Add cache optimization flags if supported
 * @param {string} [params.effort] Optional reasoning effort setting
 * @returns {Promise<object>} The chat completion response
 */
export async function createChatCompletion({
  model,
  messages,
  tools = [],
  useCache = true,
  effort = null,
}) {
  const client = getClient();

  const body = {
    model,
    messages,
  };

  // Enable reasoning explicitly for OpenRouter models
  if (config.provider === 'openrouter') {
    body.include_reasoning = true;
  }

  // Only append tools if there are any
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  // Handle reasoning effort if supported
  if (effort) {
    body.reasoning_effort = effort;
  }

  const extraBody = {};

  // Requesty-specific gateway options
  if (config.provider === 'requesty' && useCache) {
    extraBody.requesty = {
      auto_cache: true,
    };
  }

  try {
    const response = await client.chat.completions.create({
      ...body,
      extra_body: Object.keys(extraBody).length > 0 ? extraBody : undefined,
    });
    return response;
  } catch (err) {
    console.error(`\x1b[31m[API Error] Chat completion failed: ${err.message}\x1b[0m`);
    throw err;
  }
}
