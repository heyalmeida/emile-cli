// history-replay.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import readline from 'node:readline';
import { printUserMessage } from './user-message.js';
import { printThinking } from './thinking.js';
import { printAssistantResponse } from './response.js';
import { printToolSummary } from './tool-lines.js';

// ──────────────────────────────────────────────
//  Conversation History Replay
// ──────────────────────────────────────────────

export function printConversationHistory(messages, { summary = '' } = {}) {
  if (!messages || messages.length === 0) return;

  const cols = process.stdout.columns || 80;
  const lineW = Math.max(cols - 4, 20);

  // Count displayable messages (everything except the system prompt)
  const displayable = messages.filter(m => m.role !== 'system');

  // Restoration banner
  const title = summary ? `"${summary}"` : 'session';
  const bannerCore = ` 📜 Restored Session: ${title} (${displayable.length} messages loaded) `;
  const bannerFill = Math.max(lineW - stripAnsi(bannerCore).length, 0);
  console.log();
  process.stdout.write(C.muted(`  ───${bannerCore}${'─'.repeat(bannerFill)}`) + '\n');

  // Replay every message with the same native UI components used live.
  // No truncation — full content with Markdown rendering and tool summaries.
  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      printUserMessage(msg.content);
      continue;
    }

    if (msg.role === 'assistant') {
      if (msg.reasoning_content) printThinking(msg.reasoning_content);
      if (msg.content) printAssistantResponse(msg.content);
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        printToolSummary(msg.tool_calls);
      }
      continue;
    }

    // role: 'tool' — result messages are already represented by the preceding
    // assistant's tool_calls summary; skip raw results to keep the replay
    // faithful to the live experience and free of noise.
  }

  process.stdout.write(C.muted(`  ${'─'.repeat(lineW)}`) + '\n');
  console.log(C.dim('  End of history. Continue below.'));
  console.log();
}
