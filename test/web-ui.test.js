import test from 'node:test';
import assert from 'node:assert/strict';

import {
  printWebCommandWarning,
  printWebProviderStatus,
  printWebSearchStatus,
} from '../src/ui/web-config.js';
import { stripAnsi } from '../src/ui/theme.js';
import { formatToolSummary } from '../src/ui/tool-lines.js';

function captureConsole(callback, columns) {
  const originalLog = console.log;
  const originalColumns = process.stdout.columns;
  const lines = [];
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true });
  console.log = (...args) => lines.push(args.join(' '));
  try {
    callback();
  } finally {
    console.log = originalLog;
    Object.defineProperty(process.stdout, 'columns', { value: originalColumns, configurable: true });
  }
  return lines;
}

test('enhanced-web status and warnings stay bounded at narrow terminal widths', () => {
  for (const columns of [60, 80, 120]) {
    const lines = captureConsole(() => {
      printWebSearchStatus({
        webSearch: true,
        webSearchMode: 'enhanced',
        tavilyEnabled: true,
        tavilyApiKey: 'must-not-render',
        firecrawlEnabled: false,
        firecrawlApiKey: '',
      });
      printWebProviderStatus('tavily', {
        tavilyEnabled: true,
        tavilyApiKey: 'must-not-render',
      });
      printWebCommandWarning('Enhanced mode needs configuration for both provider capabilities before all tools are available.');
    }, columns);

    for (const line of lines) assert.ok(stripAnsi(line).length <= columns, `${columns}: ${stripAnsi(line)}`);
    assert.doesNotMatch(lines.join('\n'), /must-not-render/);
  }
});

test('web tool summaries remove terminal controls and do not expose page query strings', () => {
  const summary = formatToolSummary([
    {
      function: {
        name: 'searchWeb',
        arguments: JSON.stringify({ query: '\u001B]0;spoof\u0007design systems' }),
      },
    },
    {
      function: {
        name: 'browsePage',
        arguments: JSON.stringify({ url: 'https://example.com/page?token=secret' }),
      },
    },
  ]);

  assert.equal(summary.details[0].arg, 'design systems');
  assert.equal(summary.details[1].arg, 'example.com');
  assert.doesNotMatch(JSON.stringify(summary.details), /token=secret|\u001B/);
});
