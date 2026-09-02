import test from 'node:test';
import assert from 'node:assert/strict';

import { dispatchCommand } from '../src/commands/index.js';

test('persists the compatibility toggle separately from enhanced web settings', async () => {
  const mainWrites = [];
  const webWrites = [];
  const config = {
    provider: 'requesty',
    webSearch: false,
    webSearchMode: 'native',
    tavilyEnabled: true,
    tavilyApiKey: 'configured',
    firecrawlEnabled: true,
    firecrawlApiKey: 'configured',
  };

  await dispatchCommand('/websearch enhanced', {
    config,
    saveWebToggle: settings => mainWrites.push(settings),
    saveWebConfig: settings => webWrites.push(settings),
    printWebSearchStatus() {},
    printWebCommandWarning() {},
  });

  assert.deepEqual(mainWrites, [{ webSearch: true }]);
  assert.deepEqual(webWrites, [{ webSearchMode: 'enhanced' }]);
  assert.equal(config.webSearch, true);
  assert.equal(config.webSearchMode, 'enhanced');
});
