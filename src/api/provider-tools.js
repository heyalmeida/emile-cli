// provider-tools.js — provider-operated tools that are safe to compose only
// for the provider that owns their schema.

const OPENROUTER_WEB_SEARCH = {
  type: 'openrouter:web_search',
  parameters: {
    engine: 'auto',
    max_results: 5,
    max_total_results: 15,
  },
};

/**
 * Returns provider-native tools for the current request.
 * OpenRouter executes this server tool itself; it must never be sent to an
 * unrelated OpenAI-compatible endpoint that may reject the unknown type.
 */
export function getProviderToolDefinitions({ provider, webSearch = false } = {}) {
  if (provider !== 'openrouter' || webSearch !== true) return [];
  return [{ ...OPENROUTER_WEB_SEARCH, parameters: { ...OPENROUTER_WEB_SEARCH.parameters } }];
}
