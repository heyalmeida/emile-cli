import test from 'node:test';
import assert from 'node:assert/strict';

import { getProviderToolDefinitions } from '../src/api/provider-tools.js';

test('adds bounded OpenRouter web search only when explicitly enabled', () => {
  const tools = getProviderToolDefinitions({ provider: 'openrouter', webSearch: true });
  assert.deepEqual(tools, [{
    type: 'openrouter:web_search',
    parameters: { engine: 'auto', max_results: 5, max_total_results: 15 },
  }]);
});

test('does not send the OpenRouter server tool to disabled or other providers', () => {
  assert.deepEqual(getProviderToolDefinitions({ provider: 'openrouter', webSearch: false }), []);
  assert.deepEqual(getProviderToolDefinitions({ provider: 'requesty', webSearch: true }), []);
  assert.deepEqual(getProviderToolDefinitions({ provider: 'opencode', webSearch: true }), []);
});
