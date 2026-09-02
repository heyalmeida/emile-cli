import test from 'node:test';
import assert from 'node:assert/strict';

// ── Phase shape ─────────────────────────────────────────────────────────────

test('stop-input phase has correct name and bounded sliceMs', async () => {
  const { phase } = await import('../src/lifecycle/stop-input.js');
  const p = phase();
  assert.equal(p.name, 'stop-input');
  assert.ok(p.sliceMs > 0 && p.sliceMs <= 2000, `sliceMs=${p.sliceMs} out of range`);
  assert.equal(typeof p.run, 'function');
});

test('drain-tools phase has correct name and bounded sliceMs', async () => {
  const { phase } = await import('../src/lifecycle/drain-tools.js');
  const p = phase();
  assert.equal(p.name, 'drain-tools');
  assert.ok(p.sliceMs > 0 && p.sliceMs <= 2000);
  assert.equal(typeof p.run, 'function');
});

test('restore-terminal phase has correct name and bounded sliceMs', async () => {
  const { phase } = await import('../src/lifecycle/restore-terminal.js');
  const p = phase();
  assert.equal(p.name, 'restore-terminal');
  assert.ok(p.sliceMs > 0 && p.sliceMs <= 2000);
  assert.equal(typeof p.run, 'function');
});

test('flush-session phase has correct name and bounded sliceMs', async () => {
  const { phase } = await import('../src/lifecycle/flush-session.js');
  const p = phase();
  assert.equal(p.name, 'flush-session');
  assert.ok(p.sliceMs > 0 && p.sliceMs <= 2000);
  assert.equal(typeof p.run, 'function');
});

test('close-mcp phase has correct name and bounded sliceMs', async () => {
  const { phase } = await import('../src/lifecycle/close-mcp.js');
  const p = phase();
  assert.equal(p.name, 'close-mcp');
  assert.ok(p.sliceMs > 0 && p.sliceMs <= 2000);
  assert.equal(typeof p.run, 'function');
});

// ── Lifecycle module exports ─────────────────────────────────────────────────

test('lifecycle/index exports the public API', async () => {
  const mod = await import('../src/lifecycle/index.js');
  assert.equal(typeof mod.installShutdownHandlers, 'function');
  assert.equal(typeof mod.isShuttingDown, 'function');
  assert.equal(typeof mod.setActiveTool, 'function');
  assert.equal(typeof mod.clearActiveTool, 'function');
});

// ── drain-tools: no tool → resolves immediately ─────────────────────────────────

test('drain-tools phase with no active tool resolves without hanging', async () => {
  const { phase } = await import('../src/lifecycle/drain-tools.js');
  const { clearActiveTool } = await import('../src/lifecycle/stop-input.js');
  clearActiveTool(); // ensure no tool is registered
  const p = phase();
  // Resolve quickly — no timeout.
  const timer = setTimeout(() => { throw new Error('drain-tools hung'); }, 500);
  await p.run({ verbose: false, markAborted: () => {} });
  clearTimeout(timer);
});

// ── flush-session ───────────────────────────────────────────────────────────

test('flush-session calls flushSync when provided', async () => {
  const { phase } = await import('../src/lifecycle/flush-session.js');
  let called = false;
  const p = phase();
  await p.run({ verbose: false, flushSync: () => { called = true; } });
  assert.equal(called, true);
});

test('flush-session does not throw when flushSync is undefined', async () => {
  const { phase } = await import('../src/lifecycle/flush-session.js');
  const p = phase();
  // Should not throw.
  await p.run({ verbose: false, flushSync: undefined });
});
