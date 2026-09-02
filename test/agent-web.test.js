import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTransientWebReferenceMessage,
  normalizeToolExecutionResult,
  runAgent,
} from '../src/agent/agent.js';
import { config } from '../src/config.js';
import { webToolHandlers } from '../src/web/handlers.js';
import { modelSupportsImages } from '../src/web/model-capabilities.js';

async function* streamOf(...deltas) {
  for (const delta of deltas) yield { choices: [{ delta }] };
}

async function withMutedStdout(callback) {
  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    return await callback();
  } finally {
    process.stdout.write = originalWrite;
  }
}

test('normalizes structured tool results and caps image attachments', () => {
  const attachments = Array.from({ length: 5 }, (_, index) => ({
    type: 'image_url',
    image_url: { url: `https://example.com/${index}.png` },
  }));
  const result = normalizeToolExecutionResult({ content: 'page', attachments });
  assert.equal(result.content, 'page');
  assert.equal(result.attachments.length, 3);
  assert.deepEqual(normalizeToolExecutionResult('plain'), { content: 'plain', attachments: [] });
});

test('creates transient screenshot messages only for vision-capable models', () => {
  const attachments = [{
    type: 'image_url',
    image_url: { url: 'https://example.com/page.png' },
  }];
  const visual = createTransientWebReferenceMessage(attachments, 'openai/gpt-4o');
  assert.equal(visual.role, 'user');
  assert.match(visual.content[0].text, /UNTRUSTED/);
  assert.equal(visual.content[1].image_url.url, 'https://example.com/page.png');
  assert.equal(createTransientWebReferenceMessage(attachments, 'deepseek/deepseek-chat'), null);
});

test('image support detection is conservative and explicit', () => {
  assert.equal(modelSupportsImages('anthropic/claude-sonnet-4-5'), true);
  assert.equal(modelSupportsImages('google/gemini-2.5-pro'), true);
  assert.equal(modelSupportsImages('openai/gpt-4o'), true);
  assert.equal(modelSupportsImages('qwen/qwen2.5-vl-72b-instruct'), true);
  assert.equal(modelSupportsImages('deepseek/deepseek-chat'), false);
  assert.equal(modelSupportsImages('openrouter/free'), false);
  assert.equal(modelSupportsImages('custom/unknown-model'), false);
});

test('agent advertises enhanced tools and sends screenshots once without persisting them', async () => {
  const previousConfig = {
    provider: config.provider,
    webSearch: config.webSearch,
    webSearchMode: config.webSearchMode,
    firecrawlEnabled: config.firecrawlEnabled,
    firecrawlApiKey: config.firecrawlApiKey,
    tavilyEnabled: config.tavilyEnabled,
    tavilyApiKey: config.tavilyApiKey,
  };
  const originalBrowse = webToolHandlers.browsePage;
  const calls = [];

  Object.assign(config, {
    provider: 'requesty',
    webSearch: true,
    webSearchMode: 'enhanced',
    firecrawlEnabled: true,
    firecrawlApiKey: 'configured',
    tavilyEnabled: true,
    tavilyApiKey: 'configured',
  });
  webToolHandlers.browsePage = async () => ({
    content: 'UNTRUSTED EXTERNAL WEB REFERENCE\nrendered page',
    attachments: [{
      type: 'image_url',
      image_url: { url: 'https://cdn.example.com/page.png' },
    }],
  });

  try {
    const messages = await withMutedStdout(() => runAgent({
      model: 'openai/gpt-4o',
      plansMode: false,
      skills: [],
      cache: false,
      effort: 'low',
      messages: [],
      initialPrompt: 'Inspect the page visually',
      createCompletion: async (params) => {
        calls.push(params);
        if (calls.length === 1) {
          return streamOf({
            tool_calls: [{
              index: 0,
              id: 'call_browse',
              function: {
                name: 'browsePage',
                arguments: JSON.stringify({ url: 'https://example.com', mode: 'visual' }),
              },
            }],
          });
        }
        return streamOf({ content: 'Visual analysis complete.' });
      },
    }));

    assert.deepEqual(
      calls[0].tools.filter(tool => tool.type === 'function').map(tool => tool.function.name).slice(-2),
      ['searchWeb', 'browsePage'],
    );
    const transient = calls[1].messages.at(-1);
    assert.equal(transient.role, 'user');
    assert.ok(Array.isArray(transient.content));
    assert.equal(transient.content[1].type, 'image_url');
    assert.equal(messages.some(message => Array.isArray(message.content)), false);
    assert.equal(messages.at(-1).content, 'Visual analysis complete.');
  } finally {
    webToolHandlers.browsePage = originalBrowse;
    Object.assign(config, previousConfig);
  }
});

test('agent keeps non-vision page analysis text-only', async () => {
  const attachments = [{ type: 'image_url', image_url: { url: 'https://example.com/page.png' } }];
  assert.equal(createTransientWebReferenceMessage(attachments, 'custom/text-only'), null);
});
