// sanitize.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import readline from 'node:readline';

// ──────────────────────────────────────────────
//  Sanitizer & Text Interceptor
// ──────────────────────────────────────────────

/**
 * Sanitizes assistant output:
 * 1. Decodes Unicode escape sequences like \u00e3o -> ão
 * 2. Un-escapes double-escaped newlines (\n) and tabs (\t)
 * 3. Strips XML tool call tags like <TOOLCALL>...</TOOLCALL>, <tool_call>...</tool_call>
 * 4. Strips standalone JSON code blocks containing tool calls
 */
export function sanitizeAssistantOutput(text) {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;

  // 1. Decode Unicode escape sequences (\uXXXX)
  sanitized = sanitized.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return _;
    }
  });

  // 2. Decode double-escaped newlines and tabs
  sanitized = sanitized.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

  // 3. Strip XML/HTML tool call tags
  sanitized = sanitized.replace(/<TOOLCALL>[\s\S]*?<\/TOOLCALL>/gi, '');
  sanitized = sanitized.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
  sanitized = sanitized.replace(/<tool>[\s\S]*?<\/tool>/gi, '');
  sanitized = sanitized.replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '');

  // 4. Strip raw JSON blocks containing tool calls if model outputs standalone JSON
  sanitized = sanitized.replace(/```json\s*\{\s*"name"\s*:\s*"[^"]+"[\s\S]*?\}\s*```/gi, '');

  return sanitized;
}
