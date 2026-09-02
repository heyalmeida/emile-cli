// model-picker.js — bounded, incremental model selection for /model.
//
// Model discovery belongs to commands.js/models.js. This module owns only
// the terminal interaction and the deterministic filtering used by it.
import readline from 'node:readline';
import { C } from './theme.js';

export const MODEL_PICKER_LIMIT = 7;

/** Removes terminal controls and bounds text before it reaches the terminal. */
export function sanitizeModelPickerText(value, maxLength = 120) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Returns every matching model option (excluding the manual-entry action),
 * filtered case-insensitively by id or label. Unbounded so the picker can
 * scroll through the full result set instead of only the first window.
 */
export function matchModelOptions(options, query = '') {
  const safeOptions = Array.isArray(options)
    ? options.filter(option => option && typeof option === 'object' && option.value !== 'custom')
    : [];
  const needle = sanitizeModelPickerText(query).toLocaleLowerCase();
  return safeOptions.filter(option => {
    const haystack = `${sanitizeModelPickerText(option.value)} ${sanitizeModelPickerText(option.label)}`.toLocaleLowerCase();
    return needle === '' || haystack.includes(needle);
  });
}

/**
 * Filters model options by id or label, case-insensitively, and caps the
 * result set rendered by the picker. The custom option remains available so
 * a user can still enter an identifier that is not in a provider catalog.
 */
export function filterModelOptions(options, query = '', limit = MODEL_PICKER_LIMIT) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : MODEL_PICKER_LIMIT;
  const custom = (Array.isArray(options) ? options : []).find(option => option && option.value === 'custom');
  const models = matchModelOptions(options, query);
  const modelLimit = custom ? Math.max(0, safeLimit - 1) : safeLimit;
  const visible = models.slice(0, modelLimit);
  if (custom) visible.push(custom);
  return visible;
}

function truncateForTerminal(value, columns) {
  const maxLength = Math.max(20, columns - 6);
  const text = sanitizeModelPickerText(value, maxLength);
  return text.length < maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

/**
 * Opens the /model picker. In a TTY, every typed character redraws the
 * bounded result list. Non-TTY callers receive a safe cancellation instead
 * of a prompt that could block forever waiting for raw-mode input.
 */
export function promptModelPicker(options, { message = 'Select a model', limit = MODEL_PICKER_LIMIT } = {}) {
  return new Promise((resolve) => {
    if (typeof process.stdin.setRawMode !== 'function' || process.stdin.isTTY === false) {
      resolve(null);
      return;
    }

    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);

    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : MODEL_PICKER_LIMIT;
    const customOption = Array.isArray(options)
      ? options.find(option => option && option.value === 'custom')
      : null;
    const modelWindow = Math.max(1, safeLimit - (customOption ? 1 : 0));

    let query = '';
    let selectedIndex = 0;
    let scrollOffset = 0;
    let lastRenderedHeight = 0;
    let settled = false;

    function getModels() {
      return matchModelOptions(options, query);
    }

    function getTotal() {
      return getModels().length + (customOption ? 1 : 0);
    }

    function render() {
      const columns = process.stdout.columns || 80;
      const models = getModels();
      const total = models.length + (customOption ? 1 : 0);

      selectedIndex = total > 0 ? Math.min(Math.max(0, selectedIndex), total - 1) : 0;

      // Keep the selected model inside the scrollable window.
      if (selectedIndex < models.length) {
        if (selectedIndex < scrollOffset) scrollOffset = selectedIndex;
        if (selectedIndex >= scrollOffset + modelWindow) scrollOffset = selectedIndex - modelWindow + 1;
      }
      scrollOffset = Math.min(Math.max(0, scrollOffset), Math.max(0, models.length - modelWindow));

      const visibleModels = models.slice(scrollOffset, scrollOffset + modelWindow);

      const lines = [
        `${C.accent('?')} ${C.bold(sanitizeModelPickerText(message, Math.max(20, columns - 15)))}`,
        `  ${C.muted('Search:')} ${C.fg(truncateForTerminal(query || 'type a model name', columns))}`,
      ];

      if (total === 0) {
        lines.push(`  ${C.warn('No matching models.')}`);
      } else {
        for (const [offset, option] of visibleModels.entries()) {
          const index = scrollOffset + offset;
          const selected = index === selectedIndex;
          const label = truncateForTerminal(option.label || option.value, columns);
          const marker = selected ? C.accent('❯') : C.muted('·');
          lines.push(`  ${marker} ${selected ? C.bold(C.accent(label)) : C.fg(label)}`);
        }
        if (customOption) {
          const selected = selectedIndex === models.length;
          const label = truncateForTerminal(customOption.label || customOption.value, columns);
          const marker = selected ? C.accent('❯') : C.muted('·');
          lines.push(`  ${marker} ${selected ? C.bold(C.accent(label)) : C.fg(label)}`);
        }
      }

      if (models.length > modelWindow) {
        const from = scrollOffset + 1;
        const to = Math.min(scrollOffset + modelWindow, models.length);
        lines.push(`  ${C.muted(`Showing ${from}–${to} of ${models.length} models — ↑↓ scroll · type to filter`)}`);
      }
      lines.push(`  ${C.dim('↑↓ select  Enter choose  Esc cancel')}`);

      if (lastRenderedHeight > 0) {
        process.stdout.write(`\x1B[${lastRenderedHeight}A`);
      }
      for (const line of lines) {
        process.stdout.write(`\r\x1B[K${line}\n`);
      }
      lastRenderedHeight = lines.length;
    }

    function cleanup() {
      if (lastRenderedHeight > 0) {
        for (let index = 0; index < lastRenderedHeight; index++) {
          process.stdout.write('\x1B[1A\x1B[2K');
        }
      }
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      lastRenderedHeight = 0;
    }

    function finish(value) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    function onKeypress(str, key = {}) {
      if (key.ctrl && key.name === 'c') {
        finish(null);
        return;
      }
      if (key.name === 'escape') {
        finish(null);
        return;
      }

      const total = getTotal();
      if (key.name === 'return' || key.name === 'enter') {
        const models = getModels();
        const value = selectedIndex < models.length ? models[selectedIndex]?.value : customOption?.value;
        finish(value ?? null);
        return;
      }
      if (key.name === 'up' && total > 0) {
        selectedIndex = (selectedIndex - 1 + total) % total;
      } else if (key.name === 'down' && total > 0) {
        selectedIndex = (selectedIndex + 1) % total;
      } else if (key.name === 'backspace') {
        query = query.slice(0, -1);
        selectedIndex = 0;
        scrollOffset = 0;
      } else if (str && !key.ctrl && !key.meta) {
        query += sanitizeModelPickerText(str, str.length);
        selectedIndex = 0;
        scrollOffset = 0;
      } else {
        return;
      }
      render();
    }

    process.stdin.on('keypress', onKeypress);
    render();
  });
}
