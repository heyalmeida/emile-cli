// handlers/run-command.js — runCommand tool handler.
import path from 'node:path';
import { exec } from 'node:child_process';
import { confirm, isCancel } from '@clack/prompts';
import { config } from '../../config.js';
import { isSafeCommand, normalizeWorkspaceCwd } from '../security.js';
import { stripTerminalControls } from '../../ui/control.js';

const NETWORK_PIPE_PATTERN = /\b(?:curl|wget)\b[^\n]*\|\s*(?:ba|z|fi)?sh\b/i;

export function isNetworkPipeCommand(command) {
  return NETWORK_PIPE_PATTERN.test(String(command || ''));
}

function getSessionCwd() {
  const current = normalizeWorkspaceCwd(config.sessionCwd);
  if (current) {
    config.sessionCwd = current;
    return current;
  }
  config.sessionCwd = config.workspaceDir;
  return config.workspaceDir;
}

function buildCwdProbe(marker) {
  if (process.platform === 'win32') {
    return `\r\nset "EMILE_COMMAND_STATUS=%ERRORLEVEL%"\r\necho ${marker}%CD%\r\nexit /b %EMILE_COMMAND_STATUS%`;
  }
  return `\nEMILE_COMMAND_STATUS=$?\nprintf '\\n%s%s\\n' '${marker}' "$PWD"\nexit "$EMILE_COMMAND_STATUS"`;
}

function stripCwdProbe(output, marker) {
  const markerIndex = output.lastIndexOf(marker);
  if (markerIndex < 0) return { output, cwd: null };

  const lineStart = output.lastIndexOf('\n', markerIndex - 1);
  const valueStart = markerIndex + marker.length;
  const lineEnd = output.indexOf('\n', valueStart);
  const cwd = output.slice(valueStart, lineEnd < 0 ? output.length : lineEnd).replace(/\r$/, '');
  return { output: output.slice(0, lineStart < 0 ? markerIndex : lineStart), cwd };
}

export async function runCommand({ command }) {
  // Handle Dry-Run simulation
  if (config.dryRun) {
    console.log(`\n  [DRY RUN] Would execute command: "${command}"`);
    return `(command execution simulated in dry-run mode: "${command}")`;
  }

  // Safety Gate Confirmation
  if (config.safeMode && !isSafeCommand(command)) {
    console.log();
    const displayCommand = stripTerminalControls(command).replace(/\s+/g, ' ').slice(0, 180);
    const message = isNetworkPipeCommand(command)
      ? `⚠ This command pipes network content to a shell interpreter.\nThis is a common prompt-injection vector.\nCommand: ${displayCommand}\nRun anyway?`
      : `Allow execution of command: "${displayCommand}"?`;
    const approved = await confirm({
      message,
      active: 'Yes, execute command',
      inactive: 'No, block command',
    });

    if (isCancel(approved) || !approved) {
      return `Error: Command execution blocked by user.`;
    }
  }

  return new Promise((resolve) => {
    const timeout = config.commandTimeout || 30000;
    const commandCwd = getSessionCwd();
    const marker = `__EMILE_CWD_${process.pid}_${Date.now()}__`;
    const commandWithProbe = `${command}\n${buildCwdProbe(marker)}`;

    exec(commandWithProbe, { cwd: commandCwd, timeout }, (error, stdout, stderr) => {
      const probe = stripCwdProbe(stdout || '', marker);
      let output = probe.output;
      if (stderr) output += `[stderr]\n${stderr}`;
      let cwdWarning = '';
      if (probe.cwd) {
        const nextCwd = normalizeWorkspaceCwd(probe.cwd);
        if (nextCwd) {
          config.sessionCwd = nextCwd;
        } else {
          cwdWarning = '\n[working directory unchanged: command left the workspace]';
        }
      }

      // IMPROVEMENTS.md §3.2: a verbose build log or a cat of a big file can
      // flood the context window in a single tool result. Truncate with an
      // explicit notice and the omitted size so the model can re-run with a
      // targeted command (grep/head/tail) instead.
      const MAX_OUTPUT_CHARS = 50_000;
      if (output.length > MAX_OUTPUT_CHARS) {
        const omitted = output.length - MAX_OUTPUT_CHARS;
        output =
          output.slice(0, MAX_OUTPUT_CHARS) +
          `\n[output truncated — ${omitted} chars omitted. Use grep, head or tail for targeted extraction.]`;
      }

      if (error) {
        if (error.killed) {
          output += `\n[Command terminated because it exceeded the timeout limit of ${timeout}ms]`;
        } else {
          output += `\n[Command failed with code ${error.code}]\n${error.message}`;
        }
      }
      const relativeCwd = path.relative(config.workspaceDir, config.sessionCwd || commandCwd) || '.';
      output += `\n[working directory: ${relativeCwd}]${cwdWarning}`;
      resolve(output.trim() || '(command returned no output)');
    });
  });
}
