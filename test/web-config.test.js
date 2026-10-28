import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hydrateEnhancedWebConfig, saveEnhancedWebConfig } from '../src/web/config.js';

test('hydrates enhanced web settings with explicit defaults and environment fallbacks', () => {
  const runtimeConfig = { webSearch: true };
  hydrateEnhancedWebConfig(runtimeConfig, {
    saved: { webSearchMode: 'enhanced', tavilyEnabled: true },
    env: { TAVILY_API_KEY: 'env-tavily', FIRECRAWL_API_KEY: 'env-firecrawl', EMILE_FIRECRAWL_ENABLED: 'on' },
    protectedStore: { save() {}, resolve: () => '' },
  });

  assert.equal(runtimeConfig.webSearch, true);
  assert.equal(runtimeConfig.webSearchMode, 'enhanced');
  assert.equal(runtimeConfig.tavilyApiKey, 'env-tavily');
  assert.equal(runtimeConfig.tavilyEnabled, true);
  assert.equal(runtimeConfig.firecrawlApiKey, 'env-firecrawl');
  assert.equal(runtimeConfig.firecrawlEnabled, true);
});

test('migrates legacy enhanced credentials and removes plaintext fields', () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-web-migration-'));
  const filePath = path.join(workspaceDir, '.emile', 'web.json');
  const runtimeConfig = { workspaceDir, webSearch: true };
  const protectedValues = new Map();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({
      webSearchMode: 'enhanced',
      tavilyApiKey: 'legacy-tavily',
      tavilyEnabled: true,
      firecrawlApiKey: 'legacy-firecrawl',
      firecrawlEnabled: true,
    }));

    hydrateEnhancedWebConfig(runtimeConfig, {
      filePath,
      env: {},
      protectedStore: {
        save: (name, value) => protectedValues.set(name, value),
        resolve: (name) => protectedValues.get(name) || '',
      },
    });

    const savedText = fs.readFileSync(filePath, 'utf8');
    assert.equal(runtimeConfig.tavilyApiKey, 'legacy-tavily');
    assert.equal(runtimeConfig.firecrawlApiKey, 'legacy-firecrawl');
    assert.equal(savedText.includes('legacy-tavily'), false);
    assert.equal(savedText.includes('legacy-firecrawl'), false);
    assert.equal(protectedValues.get('web:tavily'), 'legacy-tavily');
    assert.equal(protectedValues.get('web:firecrawl'), 'legacy-firecrawl');
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test('persists enhanced web settings without serializing credentials', () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-web-config-'));
  const runtimeConfig = { workspaceDir, webSearch: false, webSearchMode: 'native' };
  const filePath = path.join(workspaceDir, '.emile', 'web.json');
  const protectedValues = new Map();

  try {
    saveEnhancedWebConfig({
      webSearchMode: 'enhanced',
      tavilyApiKey: 'tavily-secret',
      tavilyEnabled: true,
      firecrawlApiKey: 'firecrawl-secret',
      firecrawlEnabled: false,
      unrelated: 'must-not-persist',
    }, {
      runtimeConfig,
      filePath,
      protectedStore: {
        save: (name, value) => protectedValues.set(name, value),
        resolve: (name) => protectedValues.get(name) || '',
      },
    });

    const savedText = fs.readFileSync(filePath, 'utf8');
    const saved = JSON.parse(savedText);
    assert.deepEqual(saved, {
      webSearchMode: 'enhanced',
      tavilyEnabled: true,
      firecrawlEnabled: false,
    });
    assert.equal(savedText.includes('tavily-secret'), false);
    assert.equal(savedText.includes('firecrawl-secret'), false);
    assert.equal(protectedValues.get('web:tavily'), 'tavily-secret');
    assert.equal(protectedValues.get('web:firecrawl'), 'firecrawl-secret');
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    }
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});
