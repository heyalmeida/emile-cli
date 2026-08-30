// switch-session.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import readline from 'node:readline';

// ──────────────────────────────────────────────────────────────
//  Custom Switch Session Selection Prompt (with Deletion support)
// ──────────────────────────────────────────────────────────────

export function promptSwitchSession(sessions, deleteSessionFn) {
  return new Promise((resolve) => {
    if (typeof process.stdin.setRawMode !== 'function') {
      resolve(sessions.length > 0 ? sessions[0].id : null);
      return;
    }

    const isRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);

    let activeSessions = [...sessions];
    let selectedIndex = 0;
    let confirmingDeleteIndex = -1;

    let lastRenderedHeight = 0;

    function render() {
      if (lastRenderedHeight > 0) {
        for (let i = 0; i < lastRenderedHeight; i++) {
          process.stdout.write('\x1B[1A\x1B[2K');
        }
      }

      let lines = [];
      lines.push(`${C.accent('?')} Select a conversation to resume: ${C.muted('(Ctrl+D to delete session)')}`);

      if (activeSessions.length === 0) {
        lines.push(`  ${C.warn('No conversation history found.')}`);
      } else {
        activeSessions.forEach((s, idx) => {
          const isSelected = idx === selectedIndex;
          const dateStr = new Date(s.updatedAt).toLocaleString();
          const label = `${s.summary} ${C.muted(dateStr)}`;

          if (confirmingDeleteIndex === idx) {
            lines.push(`  ${C.red('▶')} ${C.bold(C.red('Delete session?'))} Press ${C.bold('y')} to confirm or any other key to cancel`);
          } else if (isSelected) {
            lines.push(`  ${C.accent('●')} ${C.bold(label)}`);
          } else {
            lines.push(`  ${C.muted('○')} ${label}`);
          }
        });
      }

      process.stdout.write(lines.join('\n') + '\n');
      lastRenderedHeight = lines.length;
    }

    render();

    const onKeypress = (str, key) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        resolve(null);
        return;
      }

      if (confirmingDeleteIndex !== -1) {
        if (str && str.toLowerCase() === 'y') {
          const toDelete = activeSessions[confirmingDeleteIndex];
          deleteSessionFn(toDelete.id);
          activeSessions.splice(confirmingDeleteIndex, 1);
          if (selectedIndex >= activeSessions.length) {
            selectedIndex = Math.max(0, activeSessions.length - 1);
          }
        }
        confirmingDeleteIndex = -1;
        render();
        return;
      }

      if (activeSessions.length === 0) {
        if (key.name === 'return' || key.name === 'enter' || key.name === 'escape') {
          cleanup();
          resolve(null);
        }
        return;
      }

      if (key.ctrl && key.name === 'd') {
        confirmingDeleteIndex = selectedIndex;
        render();
        return;
      }

      if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + activeSessions.length) % activeSessions.length;
        render();
      } else if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % activeSessions.length;
        render();
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(activeSessions[selectedIndex].id);
      } else if (key.name === 'escape') {
        cleanup();
        resolve(null);
      }
    };

    function cleanup() {
      if (lastRenderedHeight > 0) {
        for (let i = 0; i < lastRenderedHeight; i++) {
          process.stdout.write('\x1B[1A\x1B[2K');
        }
      }
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(isRaw);
      process.stdin.pause();
    }

    process.stdin.on('keypress', onKeypress);
  });
}
