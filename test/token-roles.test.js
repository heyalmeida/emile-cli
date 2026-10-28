// token-roles.test.js — the semantic role layer and the de-emphasis rules
// (specs/2026-10-11-design-token-roles, P1-18 Stage A, audit ideas 1–3).
//
// Stage A's gate is "a rename, not a restyle": ROLE must be a pure alias layer
// over the single palette `C`, the tool tone vocabulary must be roles (never
// hues), and exactly two rendered behaviors may change — the cache-hit metric
// stops using a state color, and the collapsed thinking line stops using a
// hardcoded near-background gray.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { C, ROLE } from '../src/ui/theme.js';
import { formatToolSummary, printToolSummary } from '../src/ui/tool-lines.js';
import { printSessionBar } from '../src/ui/status-bar.js';

/** The role members and the palette token each one must alias. */
const ROLE_ALIASES = [
  ['ROLE.user', ROLE.user, C.fg],
  ['ROLE.agent', ROLE.agent, C.accent],
  ['ROLE.thinking', ROLE.thinking, C.muted],
  ['ROLE.tool.passive', ROLE.tool.passive, C.info],
  ['ROLE.tool.mutate', ROLE.tool.mutate, C.warn],
  ['ROLE.tool.danger', ROLE.tool.danger, C.red],
  ['ROLE.tool.search', ROLE.tool.search, C.gold],
  ['ROLE.tool.plain', ROLE.tool.plain, C.fg],
  ['ROLE.tool.workflow', ROLE.tool.workflow, C.accent],
  ['ROLE.success', ROLE.success, C.success],
  ['ROLE.warn', ROLE.warn, C.warn],
  ['ROLE.diff.insert', ROLE.diff.insert, C.success],
  ['ROLE.diff.delete', ROLE.diff.delete, C.red],
  ['ROLE.diff.context', ROLE.diff.context, C.muted],
  ['ROLE.meta.punct', ROLE.meta.punct, C.dim],
  ['ROLE.meta.label', ROLE.meta.label, C.muted],
  ['ROLE.border.box', ROLE.border.box, C.muted],
  ['ROLE.border.focused', ROLE.border.focused, C.accent],
];

/** Captures stdout for one render call. */
function capture(run) {
  const writes = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
  try {
    run();
  } finally {
    process.stdout.write = original;
  }
  return writes.join('');
}

describe('semantic token roles', () => {
  test('every role is an alias of its documented palette token (no new color)', () => {
    for (const [name, role, token] of ROLE_ALIASES) {
      assert.equal(role, token, `${name} must be the very same function as its palette token`);
      // Same function means byte-identical output for any input, including the
      // escape-sequence shape the rest of the UI already relies on.
      for (const sample of ['x', '', 'on', '12.3k']) {
        assert.equal(role(sample), token(sample), `${name} must not wrap the token`);
      }
    }
  });

  test('the role block contains no color literal of its own', () => {
    const source = fs.readFileSync(new URL('../src/ui/theme.js', import.meta.url), 'utf8');
    const block = source.slice(source.indexOf('export const ROLE'), source.indexOf('// ──────────────────────────────────────────────\n//  Width'));
    assert.ok(block.includes('ROLE'), 'the ROLE block was located');
    assert.doesNotMatch(block, /\brgb\(|bgRgb\(|#[0-9A-Fa-f]{6}|\\x1B\[/, 'ROLE must alias C, never define a value');
    // One palette, one source: the rgb helper is still defined exactly twice
    // (rgb + bgRgb) and only in this module.
    for (const file of fs.readdirSync(new URL('../src/ui/', import.meta.url))) {
      if (!file.endsWith('.js') || file === 'theme.js') continue;
      const other = fs.readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8');
      assert.doesNotMatch(other, /38;2;/, `${file} must not hardcode a truecolor value`);
    }
  });

  test('every tool tone is a role key, so the taxonomy survives a retune', () => {
    const oneOfEach = [
      [{ name: 'readFile', arguments: '{"path":"a.js"}' }, 'passive'],
      [{ name: 'writeFile', arguments: '{"path":"a.js"}' }, 'mutate'],
      [{ name: 'editFile', arguments: '{"path":"a.js"}' }, 'mutate'],
      [{ name: 'listDir', arguments: '{"path":"."}' }, 'plain'],
      [{ name: 'findFiles', arguments: '{"pattern":"*.js"}' }, 'search'],
      [{ name: 'grepSearch', arguments: '{"query":"auth"}' }, 'search'],
      [{ name: 'runCommand', arguments: '{"command":"npm test"}' }, 'danger'],
      [{ name: 'proposeMemory', arguments: '{}' }, 'mutate'],
      [{ name: 'recallMemory', arguments: '{}' }, 'passive'],
      [{ name: 'searchWeb', arguments: '{"query":"x"}' }, 'search'],
      [{ name: 'browsePage', arguments: '{"url":"https://example.com"}' }, 'passive'],
      [{ name: 'createPlan', arguments: '{}' }, 'workflow'],
      [{ name: 'updateTask', arguments: '{}' }, 'workflow'],
      [{ name: 'filesystem__readFile', arguments: '{}' }, 'passive'],
      [{ name: 'someUnknownTool', arguments: '{}' }, 'workflow'],
    ];

    for (const [call, expected] of oneOfEach) {
      const info = formatToolSummary([{ function: call }]);
      const tone = info.details[0].tone;
      assert.ok(
        Object.prototype.hasOwnProperty.call(ROLE.tool, tone),
        `${call.name} produced tone "${tone}", which is not a ROLE.tool key`,
      );
      assert.equal(tone, expected, `${call.name} keeps its documented meaning`);
    }
  });

  test('a tool row renders with the same token its role names', () => {
    const output = capture(() => printToolSummary([
      { function: { name: 'grepSearch', arguments: '{"query":"auth"}' } },
      { function: { name: 'runCommand', arguments: '{"command":"npm test"}' } },
    ]));
    assert.ok(output.includes(ROLE.tool.search('●')), 'the search row uses the search role');
    assert.ok(output.includes(ROLE.tool.danger('●')), 'the exec row uses the danger role');
    assert.ok(output.includes(ROLE.tool.search('grep'.padEnd(8))), 'the label carries the same role');
  });

  test('a cache-hit metric is a label, never a success state', () => {
    const output = capture(() => printSessionBar({
      sessionId: 'session_1234567890',
      model: 'provider/model-x',
      messageCount: 3,
      stats: { contextLimit: 100000, lastPromptTokens: 42000, promptTokens: 1000, cachedPromptTokens: 870 },
    }));

    assert.ok(output.includes(ROLE.meta.label('cache: 87%')), 'the metric takes the middle de-emphasis step');
    assert.ok(!output.includes(C.success('cache: 87%')), 'a metric must not borrow the success state color');
    // The state color is still available where a state IS reported.
    assert.ok(output.includes(ROLE.meta.label('tokens: 42k / 100k (42%)')), 'tokens keep the label step');
  });
});

describe('one palette, one source (the spinner case)', () => {
  test('the spinner renders through the role layer with the bytes its local helpers produced', async () => {
    const { createSpinner, RESPONSE_WAITING_LABEL } = await import('../src/ui/spinner.js');
    const spinner = createSpinner();

    const tick = capture(() => spinner.start(RESPONSE_WAITING_LABEL));
    const done = capture(() => spinner.stop('Done', '✓'));
    const failed = capture(() => spinner.stop('Gone', '✗'));
    const noted = capture(() => spinner.stop('Note', 'ℹ'));

    // The removed helpers were amber(#E0AF68)=C.warn, muted(#565F89)=C.muted,
    // green(#9ECE6A)=C.success, red(#F7768E)=C.red, info(#7DCFFF)=C.info — so
    // these are the same bytes, now sourced from the single palette.
    assert.equal(tick, `\r\x1B[K  ${C.warn('⠋')} ${C.warn(RESPONSE_WAITING_LABEL)}`, 'the running frame + label');
    assert.equal(done, `\r\x1B[K  ${C.success('✓')} ${C.muted('Done')}\n`, 'the success mark');
    assert.equal(failed, `\r\x1B[K  ${C.red('✗')} ${C.muted('Gone')}\n`, 'the failure mark');
    assert.equal(noted, `\r\x1B[K  ${C.info('ℹ')} ${C.muted('Note')}\n`, 'the informational mark');

    const source = fs.readFileSync(new URL('../src/ui/spinner.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /38;2;|function rgb\(/, 'the spinner no longer owns a palette');
  });
});

describe('de-emphasis by attribute, not by hardcoded gray', () => {
  test('the collapsed thinking line uses DIM and never the reserved ghost gray', async () => {
    const { startThinkingStream, endThinkingStream, printThinking } = await import('../src/ui/thinking.js');
    const { config } = await import('../src/config.js');

    const previous = config.expandThinking;
    config.expandThinking = false;
    try {
      const stream = capture(() => {
        startThinkingStream();
        endThinkingStream();
      });
      assert.ok(stream.includes(C.dim('··· thinking')), 'the stream start line is DIM');
      assert.ok(!stream.includes(C.ghost('··· thinking')), 'the reserved gray is not used for it');
      assert.match(stream, /\x1B\[2m/, 'the DIM attribute is what de-emphasizes it');

      const replayed = capture(() => printThinking('some reasoning body'));
      assert.ok(replayed.includes(C.dim('··· thought 1s')), 'the replayed collapsed line is DIM too');
      assert.ok(!replayed.includes(C.ghost('··· thought 1s')), 'and never the reserved gray');
    } finally {
      config.expandThinking = previous;
    }
  });
});