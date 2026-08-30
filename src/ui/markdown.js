// markdown.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { sanitizeAssistantOutput } from './sanitize.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import readline from 'node:readline';

// ──────────────────────────────────────────────
//  Custom Markdown Renderer
// ──────────────────────────────────────────────

export function renderMarkdown(text) {
  if (!text || text.trim().length === 0) return '';
  const cleanText = sanitizeAssistantOutput(text);

  const lines = cleanText.split('\n');
  const result = [];
  let inCodeBlock = false;
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Code block fences
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        codeLang = line.trim().substring(3).trim();
        result.push(C.muted('│ ') + C.dim(codeLang ? `── ${codeLang} ──` : '────────'));
      } else {
        result.push(C.muted('│ ') + C.dim('────────'));
        codeLang = '';
      }
      continue;
    }

    // Inside code block — dim content with left bar
    if (inCodeBlock) {
      result.push(C.muted('│ ') + C.dim(line));
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      result.push(C.bold(C.fg(line.substring(4))));
      continue;
    }
    if (line.startsWith('## ')) {
      result.push(C.bold(C.accent(line.substring(3))));
      continue;
    }
    if (line.startsWith('# ')) {
      result.push(C.bold(C.accent(line.substring(2))));
      continue;
    }

    // Inline formatting
    line = line.replace(/\*\*(.+?)\*\*/g, (_, b) => C.bold(b));
    line = line.replace(/__(.+?)__/g, (_, b) => C.bold(b));
    line = line.replace(/`([^`]+)`/g, (_, c) => C.info(c));

    // Italic (*text* or _text_) — skip bold already handled
    line = line.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_, t) => C.dim(t));
    line = line.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, (_, t) => C.dim(t));

    // List items: `* ` or `- ` at start of line
    if (/^[*-] /.test(line)) {
      line = C.muted('  ·') + ' ' + line.substring(2);
    }

    // Numbered list items
    if (/^\d+\. /.test(line)) {
      const match = line.match(/^(\d+)\. (.*)$/);
      if (match) {
        line = C.muted(`  ${match[1]}.`) + ' ' + match[2];
      }
    }

    // Blockquotes
    if (line.startsWith('> ')) {
      line = C.muted('│ ') + C.dim(line.substring(2));
    }

    result.push(line);
  }

  return result.join('\n');
}
