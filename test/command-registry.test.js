import test from 'node:test';
import assert from 'node:assert/strict';

import { matchCommands, buildHelpTable, listRootCommands } from '../src/commands/registry.js';

test('root autocomplete: /mem suggests /memory', () => {
  const matches = matchCommands('/mem', {});
  const names = matches.map(m => m.name);
  assert.ok(names.includes('/memory'));
  assert.ok(!names.includes('/model'));
  assert.ok(!names.includes('/remember'));
});

test('root autocomplete: /rem suggests /remember', () => {
  const matches = matchCommands('/rem', {});
  const names = matches.map(m => m.name);
  assert.ok(names.includes('/remember'));
});

test('root autocomplete: /memory alone suggests the root', () => {
  const matches = matchCommands('/memory', {});
  assert.ok(matches.length >= 1);
  assert.equal(matches[0].name, '/memory');
  assert.match(matches[0].desc, /global memory/i);
});

test('subcommand autocomplete: /memory <tab> shows every memory subcommand with description', () => {
  const matches = matchCommands('/memory ', {});
  const names = matches.map(m => m.name);
  assert.ok(names.includes('/memory accept'));
  assert.ok(names.includes('/memory reject'));
  assert.ok(names.includes('/memory list'));
  assert.ok(names.includes('/memory mode'));
  assert.ok(names.includes('/memory confirm-on'));
  assert.ok(names.includes('/memory confirm-off'));
  // Each match has a description (used as the rich preview)
  for (const m of matches) {
    assert.ok(m.desc && m.desc.length > 0, `missing desc for ${m.name}`);
  }
});

test('subcommand autocomplete: /memory acc suggests only accept', () => {
  const matches = matchCommands('/memory acc', {});
  const names = matches.map(m => m.name);
  assert.deepEqual(names, ['/memory accept']);
});

test('subcommand autocomplete: /memory rej suggests only reject', () => {
  const matches = matchCommands('/memory rej', {});
  const names = matches.map(m => m.name);
  assert.deepEqual(names, ['/memory reject']);
});

test('subcommand autocomplete: /memory mode <tab> suggests off|ask|auto', () => {
  const matches = matchCommands('/memory mode ', {});
  const names = matches.map(m => m.name).sort();
  assert.deepEqual(names, ['ask', 'auto', 'off']);
  for (const m of matches) {
    assert.match(m.desc, /argument for \/memory mode/);
  }
});

test('subcommand autocomplete: /memory mode a suggests only ask|auto', () => {
  const matches = matchCommands('/memory mode a', {});
  const names = matches.map(m => m.name).sort();
  assert.deepEqual(names, ['ask', 'auto']);
});

test('subcommand autocomplete: /websearch <tab> shows on|off|status|native|enhanced', () => {
  const matches = matchCommands('/websearch ', {});
  // /websearch subcommands come from SUBCOMMANDS, not from argument completers
  // (no `complete` defined for them). So they show up at the sub-token level.
  const names = matches.map(m => m.name);
  assert.ok(names.includes('/websearch on'));
  assert.ok(names.includes('/websearch off'));
  assert.ok(names.includes('/websearch status'));
  assert.ok(names.includes('/websearch native'));
  assert.ok(names.includes('/websearch enhanced'));
});

test('subcommand autocomplete: /tavily on completes', () => {
  const matches = matchCommands('/tavily on', {});
  assert.deepEqual(matches.map(m => m.name), ['/tavily on']);
});

test('subcommand autocomplete: /sessions c suggests clean', () => {
  const matches = matchCommands('/sessions c', {});
  assert.deepEqual(matches.map(m => m.name), ['/sessions clean']);
});

test('subcommand autocomplete: /maxloop <tab> suggests the root (no real subcommands)', () => {
  // /maxloop takes <n> but has no subcommands. The registry should
  // still surface the root so the user can see the description.
  const matches = matchCommands('/maxloop ', {});
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, '/maxloop');
  assert.match(matches[0].desc, /iteration cap/i);
});

test('root autocomplete: /hel suggests /help', () => {
  const matches = matchCommands('/hel', {});
  assert.deepEqual(matches.map(m => m.name), ['/help']);
});

test('root autocomplete: / does not throw and returns everything', () => {
  const matches = matchCommands('/', {});
  assert.ok(matches.length >= 20);
});

test('root autocomplete: non-slash input returns empty', () => {
  assert.deepEqual(matchCommands('hello', {}), []);
  assert.deepEqual(matchCommands('memory', {}), []);
});

test('buildHelpTable returns one row per (root, sub) with all required fields', () => {
  const rows = buildHelpTable();
  assert.ok(rows.length >= 20);
  for (const row of rows) {
    assert.ok(typeof row.root === 'string' && row.root.length > 0);
    assert.ok(typeof row.sub === 'string');
    assert.ok(typeof row.desc === 'string' && row.desc.length > 0);
  }
  // /memory rows must include accept and mode
  const memoryRows = rows.filter(r => r.root === '/memory');
  const memorySubs = memoryRows.map(r => r.sub);
  assert.ok(memorySubs.includes('accept'));
  assert.ok(memorySubs.includes('mode'));
  assert.ok(memorySubs.includes('confirm-on'));
  assert.ok(memorySubs.includes('confirm-off'));
});

test('listRootCommands returns every root command with a description', () => {
  const roots = listRootCommands();
  assert.ok(roots.length >= 20);
  for (const r of roots) {
    assert.ok(r.name.startsWith('/') || r.name === 'exit');
    assert.ok(r.desc && r.desc.length > 0);
  }
});

test('subcommand completer for /memory accept returns pending ids when ctx has a memory root', () => {
  // The completer reads from a real memory store. We don't seed the store
  // here (would require temp dir + proposeMemory) — we just verify the wiring:
  // calling matchCommands with a non-existent memoryRoot returns [] gracefully.
  const matches = matchCommands('/memory accept ', { memoryRoot: '/tmp/nonexistent-memory-root' });
  assert.deepEqual(matches, []);
});
