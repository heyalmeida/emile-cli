// status-bar.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import readline from 'node:readline';

// ──────────────────────────────────────────────────────────────
//  ZONA 3: Single Persistent Status Bar (footer)
// ──────────────────────────────────────────────────────────────

export function printSessionBar({ sessionId, model, messageCount, stats, mcpInfo }) {
  const shortId = sessionId.substring(0, 12);
  const shortModel = model.split('/').pop();
  const cols = process.stdout.columns || 80;

  // Context usage as a model quota: tokens: 14.2k / 128k (11%)
  // Prefer the authoritative prompt_tokens from the latest API response;
  // fall back to the char-based pre-call estimate when no response yet.
  // The estimate is prefixed with '~' so estimated and measured values are
  // never confused (context honesty — spec 2026-08-25-model-system).
  const limit = (stats && stats.contextLimit) || getModelInfo(model).context;
  const isEstimated = !(stats && stats.lastPromptTokens);
  const contextTokens =
    (stats && stats.lastPromptTokens) ||
    (stats && stats.estimatedContextTokens) ||
    0;
  let tokenStr = '';
  if (contextTokens > 0) {
    const pct = Math.round((contextTokens / limit) * 100);
    tokenStr = `${isEstimated ? '~' : ''}tokens: ${fmtK(contextTokens)} / ${fmtK(limit)} (${pct}%)`;
  }

  // Cache hit rate — shown once the provider reports cached tokens
  let cacheStr = '';
  if (stats && stats.promptTokens > 0 && stats.cachedPromptTokens > 0) {
    const hitPct = Math.round((stats.cachedPromptTokens / stats.promptTokens) * 100);
    cacheStr = `cache: ${hitPct}%`;
  }

  // Build segments: session | model | msgs | tokens | cache | MCP
  const sep = C.muted(' │ ');

  const segments = [
    C.muted(shortId),
    C.accent(shortModel),
    C.muted(`msgs: ${C.bold(C.fg(String(messageCount)))}`),
  ];

  if (tokenStr) segments.push(C.muted(tokenStr));
  if (cacheStr) segments.push(C.success(cacheStr));
  if (mcpInfo)  segments.push(C.info(`MCP: ${mcpInfo}`));

  const bar = segments.join(sep);
  const lineW = Math.max(cols - 4, 20);

  console.log();
  // Status bar line with separator above
  process.stdout.write(C.muted('  ' + '─'.repeat(lineW)) + '\n');
  process.stdout.write('  ' + bar + '\n');
}
