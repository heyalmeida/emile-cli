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
  });

  assert.equal(runtimeConfig.webSearch, true);
  assert.equal(runtimeConfig.webSearchMode, 'enhanced');
  assert.equal(runtimeConfig.tavilyApiKey, 'env-tavily');
  assert.equal(runtimeConfig.tavilyEnabled, true);
  assert.equal(runtimeConfig.firecrawlApiKey, 'env-firecrawl');
  assert.equal(runtimeConfig.firecrawlEnabled, true);
});

test('persists enhanced web credentials in an isolated owner-only file', () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-web-config-'));
  const runtimeConfig = { workspaceDir, webSearch: false, webSearchMode: 'native' };
  const filePath = path.join(workspaceDir, '.emile', 'web.json');

  try {
    saveEnhancedWebConfig({
      webSearch: true,
      webSearchMode: 'enhanced',
      tavilyApiKey: 'tavily-secret',
      tavilyEnabled: true,
      firecrawlApiKey: 'firecrawl-secret',
      firecrawlEnabled: false,
      unrelated: 'must-not-persist',
    }, { runtimeConfig, filePath });

    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.deepEqual(saved, {
      webSearch: true,
      webSearchMode: 'enhanced',
      tavilyApiKey: 'tavily-secret',
      tavilyEnabled: true,
      firecrawlApiKey: 'firecrawl-secret',
      firecrawlEnabled: false,
    });
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    }
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});
