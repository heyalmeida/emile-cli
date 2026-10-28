// crash.js — the crash path: uncaught exceptions and unhandled rejections.
//
// Without these hooks an error that escapes the agent's own try/catch kills the
// process through Node's default path, which runs NONE of the ordered shutdown:
// the session is never flushed, memory is not flushed, MCP children are orphaned
// and the prompt's stdin lease is never released. The coordinator that handles
// signals (P0-3) handles crashes too — it owns the exit and `exitCodeFor`
// already maps a non-signal reason to 1.
//
// NOTE: installing an `uncaughtException` listener DISABLES Node's default
// dump-and-exit, so this handler MUST end the process — it never resumes the
// REPL. What it prints is minimal on purpose: one redacted line, because a
// provider error can carry the request body (the user's content).
// @ts-check

const FATAL_PREFIX = '✗ Fatal';
const MAX_MESSAGE_CHARS = 300;
const MAX_REASON_KEYS = 8;
/** ANSI reset when no coordinator can run (bootstrap) or anything throws. */
const TERMINAL_RESET = '\x1B[?2004l\x1B[?25h\x1B[0m';

/**
 * Removes secret shapes and control characters from text destined for stderr.
 * Mirrors `formatApiError` (src/api/transports/base.js:96-103) and adds
 * `password`; P1-10 will centralize a shared redactor, so this stays local.
 * @param {unknown} value
 * @returns {string}
 */
export function redactFatalMessage(value) {
  return String(value ?? '')
    .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[-_ ]?key|token|secret|password)\s*[:=]\s*)\S+/gi, '$1[redacted]')
    .replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    // C0 except HT/LF plus DEL and C1: a crash line must not carry escapes.
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u0080-\u009f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
}

/**
 * Bounded, leak-free description of a thrown value. An object reason without a
 * `message` is described by shape and key names rather than serialized, because
 * a provider error can embed the user's request body.
 * @param {unknown} reason
 * @returns {string}
 */
export function describeFatalReason(reason) {
  let base;
  if (typeof reason === 'string') {
    base = reason;
  } else if (reason && typeof reason === 'object') {
    const message = /** @type {{ message?: unknown }} */ (reason).message;
    if (typeof message === 'string' && message.length > 0) {
      base = message;
    } else {
      let keys = [];
      try { keys = Object.keys(/** @type {object} */ (reason)).slice(0, MAX_REASON_KEYS); } catch { /* exotic */ }
      base = keys.length > 0
        ? `${Object.prototype.toString.call(reason)} keys=[${keys.join(', ')}]`
        : Object.prototype.toString.call(reason);
    }
  } else {
    base = String(reason);
  }

  const details = [];
  const err = /** @type {{ code?: unknown, status?: unknown }} */ (reason) || {};
  if (err.code !== undefined && err.code !== null) details.push(`code ${String(err.code)}`);
  if (err.status !== undefined && err.status !== null) details.push(`status ${String(err.status)}`);
  return details.length > 0 ? `${base} (${details.join(', ')})` : base;
}

/**
 * Builds a pure fatal handler. Every dependency is injectable so the crash
 * contract can be exercised without touching the real process.
 * @param {{ coordinator?: (reason: string) => unknown, exit?: (code: number) => void, print?: (line: string) => void }} [opts]
 * @returns {(reason: unknown, origin?: string) => void}
 */
export function createFatalHandler({
  coordinator,
  exit = (code) => process.exit(code),
  print = (line) => process.stderr.write(line),
} = {}) {
  let fallbackDone = false;

  /** Last resort: reset the terminal best-effort and leave, exactly once. */
  function fallback() {
    if (fallbackDone) return;
    fallbackDone = true;
    try { print(TERMINAL_RESET); } catch { /* stderr may be gone */ }
    try { exit(1); } catch { /* nothing left to do */ }
  }

  return function handleFatal(reason, origin = 'uncaughtException') {
    try {
      print(`${FATAL_PREFIX} (${origin}): ${redactFatalMessage(describeFatalReason(reason))}\n`);
    } catch {
      // A broken stderr must not mask the crash.
    }

    if (typeof coordinator !== 'function') {
      fallback(); // too early for the coordinator (bootstrap)
      return;
    }
    try {
      // The coordinator owns the exit and its own re-entrancy guard, so this
      // must not add a second latch or a competing exit.
      const result = coordinator(origin);
      if (result && typeof (/** @type {Promise<unknown>} */ (result)).then === 'function') {
        /** @type {Promise<unknown>} */ (result).catch(() => fallback());
      }
    } catch {
      fallback();
    }
  };
}

/** Module-level handler for paths that run before a coordinator exists. */
export const handleFatal = createFatalHandler();

/**
 * Registers the crash hooks against an installed coordinator.
 * @param {{ coordinator: (reason: string) => unknown }} opts
 */
export function installCrashHandlers({ coordinator }) {
  const handler = createFatalHandler({ coordinator });
  process.on('uncaughtException', (err) => handler(err, 'uncaughtException'));
  process.on('unhandledRejection', (reason) => handler(reason, 'unhandledRejection'));
  return handler;
}

export { FATAL_PREFIX, TERMINAL_RESET };