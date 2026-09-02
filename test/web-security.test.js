import test from 'node:test';
import assert from 'node:assert/strict';

import {
  boundedRemoteText,
  formatWebProviderError,
  isPublicIpAddress,
  normalizeWebQuery,
  validatePublicWebUrl,
} from '../src/web/security.js';

const publicLookup = async () => [
  { address: '93.184.216.34', family: 4 },
  { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
];

test('classifies public and non-public IPv4 and IPv6 addresses', () => {
  for (const address of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) {
    assert.equal(isPublicIpAddress(address), true, address);
  }
  for (const address of [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
    '172.16.0.1', '192.168.1.1', '198.18.0.1', '224.0.0.1', '::1', 'fc00::1',
    'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:127.0.0.1',
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
});

test('validates public HTTP URLs and strips fragments', async () => {
  const result = await validatePublicWebUrl('https://example.com/page?q=1#private-fragment', {
    lookup: publicLookup,
  });
  assert.equal(result, 'https://example.com/page?q=1');
});

test('rejects local schemes, credentials, hostnames, literals and mixed DNS answers', async () => {
  const rejected = [
    ['file:///etc/passwd', publicLookup],
    ['ftp://example.com/file', publicLookup],
    ['https://user:secret@example.com/', publicLookup],
    ['http://localhost/admin', publicLookup],
    ['http://127.0.0.1/admin', publicLookup],
    ['http://[::1]/admin', publicLookup],
    ['http://service.local/admin', publicLookup],
    ['https://mixed.example/', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]],
  ];

  for (const [url, lookup] of rejected) {
    await assert.rejects(validatePublicWebUrl(url, { lookup }), /URL/);
  }
});

test('bounds and sanitizes web queries and remote text', () => {
  assert.equal(normalizeWebQuery('  design\n systems\u0000 '), 'design systems');
  assert.throws(() => normalizeWebQuery('x'.repeat(501)), /500/);
  assert.throws(() => normalizeWebQuery(' \n '), /empty/);
  assert.throws(() => normalizeWebQuery('look up api_key=super-secret-value'), /credential or secret/);
  assert.throws(() => normalizeWebQuery('search bearer abcdefghijklmnop'), /credential or secret/);
  assert.equal(boundedRemoteText('hello\u0000 world', 20), 'hello world');
  assert.match(boundedRemoteText('x'.repeat(30), 10), /^x{10}\n\[truncated/);
});

test('rejects sensitive target query parameters without blocking ordinary references', async () => {
  await assert.rejects(
    validatePublicWebUrl('https://example.com/page?access_token=secret-value', {
      lookup: publicLookup,
      rejectSensitiveQuery: true,
    }),
    /authentication parameters/,
  );
  assert.equal(
    await validatePublicWebUrl('https://example.com/page?utm_source=reference', {
      lookup: publicLookup,
      rejectSensitiveQuery: true,
    }),
    'https://example.com/page?utm_source=reference',
  );
});

test('formats provider errors without reflecting secret-bearing bodies', () => {
  const message = formatWebProviderError('tavily', {
    status: 401,
    body: 'api_key=do-not-leak',
  });
  assert.match(message, /authentication failed/i);
  assert.doesNotMatch(message, /do-not-leak/);
  assert.match(formatWebProviderError('firecrawl', { status: 429 }), /rate limit/i);
});
