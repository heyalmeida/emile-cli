// control.js — terminal-control sanitization for untrusted dynamic text.

/**
 * Removes ANSI/OSC/DCS control sequences and non-printing control bytes while
 * preserving ordinary text, newlines and tabs. Use before rendering content
 * read from user-controlled files directly to the terminal.
 */
export function stripTerminalControls(value) {
  return String(value ?? '')
    // OSC: ESC ] ... BEL or ESC ] ... ST
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)?/g, '')
    // DCS, SOS, PM and APC strings terminated by ST
    .replace(/\x1B[P^_X][\s\S]*?(?:\x1B\\|$)/g, '')
    // CSI sequences
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    // Remaining two-byte ESC sequences
    .replace(/\x1B[@-_]/g, '')
    // Preserve LF and TAB; CR could rewrite an already rendered line.
    .replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F]/g, '');
}
