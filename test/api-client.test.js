import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReasoningParams, formatApiError, getRetryDelayMs } from '../src/api/client.js';

test('builds the unified reasoning object for OpenRouter MiniMax-style models', () => {
  assert.deepEqual(
    buildReasoningParams({ provider: 'openrouter', model: 'minimax/minimax-m3', effort: 'high' }),
    { reasoning: { effort: 'high' } },
  );
  assert.deepEqual(
    buildReasoningParams({ provider: 'openrouter', model: 'minimax/minimax-m3', effort: 'min' }),
    { reasoning: { effort: 'minimal' } },
  );
  assert.deepEqual(
    buildReasoningParams({ provider: 'openrouter', model: 'minimax/minimax-m3', effort: 'none' }),
    { reasoning: { effort: 'none' } },
  );
});

test('does not send the unsupported reasoning_effort field to OpenRouter', () => {
  const params = buildReasoningParams({
    provider: 'openrouter',
    model: 'minimax/minimax-m3',
    effort: 'high',
  });

  assert.equal('reasoning_effort' in params, false);
  assert.deepEqual(
    buildReasoningParams({ provider: 'openrouter', model: 'minimax/minimax-m3' }),
    { reasoning: { enabled: true } },
  );
});

test('keeps the existing effort mapping for other compatible providers', () => {
  assert.deepEqual(
    buildReasoningParams({ provider: 'requesty', model: 'openai/o3', effort: 'max' }),
    { reasoning_effort: 'high' },
  );
  assert.deepEqual(
    buildReasoningParams({ provider: 'requesty', model: 'gpt-4o', effort: 'high' }),
    {},
  );
});

test('maps Requesty Anthropic models to native thinking budgets', () => {
  assert.deepEqual(
    buildReasoningParams({ provider: 'requesty', model: 'anthropic/claude-sonnet-4-5', effort: 'low' }),
    { thinking: { type: 'enabled', budget_tokens: 1024 } },
  );
  assert.deepEqual(
    buildReasoningParams({ provider: 'requesty', model: 'claude-sonnet-4-5', effort: 'high' }),
    { thinking: { type: 'enabled', budget_tokens: 8192 } },
  );
  assert.deepEqual(
    buildReasoningParams({ provider: 'requesty', model: 'anthropic/claude-sonnet-4-5', effort: 'max' }),
    { thinking: { type: 'enabled', budget_tokens: 16384 } },
  );
});

test('disables native Anthropic thinking for effort none', () => {
  assert.deepEqual(
    buildReasoningParams({ provider: 'anthropic', model: 'claude-sonnet-4-5', effort: 'none' }),
    { thinking: { type: 'disabled' } },
  );
});

test('formats common API failures as actionable messages without exposing raw errors', () => {
  assert.equal(formatApiError({ status: 401, message: 'invalid key=secret' }), 'Authentication failed. Check your API key with /connect.');
  assert.match(formatApiError({ status: 404 }, { model: 'openai/gpt-4o' }), /gpt-4o/);
  assert.equal(formatApiError({ status: 413 }), 'Context window exceeded. Compressing history and retrying...');
  assert.equal(formatApiError({ status: 429 }), 'Rate limited. Waiting 10s before retry...');
  assert.equal(formatApiError({ code: 'ETIMEDOUT' }), 'Request timed out. Check your connection.');
});

test('uses a ten-second fallback delay for rate limits without Retry-After', () => {
  assert.equal(getRetryDelayMs({ status: 429 }, 1), 10_000);
});

test('classifies provider quota errors without exposing raw credentials', () => {
  assert.match(
    formatApiError({ status: 402, message: 'insufficient credits for api_key=secret-value' }),
    /quota or billing.*402/,
  );
  const message = formatApiError({ status: 400, message: 'invalid api_key=secret-value' });
  assert.match(message, /400/);
  assert.doesNotMatch(message, /secret-value/);
});
