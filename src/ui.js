import pc from 'picocolors';
import readline from 'readline';
import { config } from './config.js';

// ──────────────────────────────────────────────────────────────
//  Width
// ──────────────────────────────────────────────────────────────

export function getW() {
  const cols = process.stdout.columns || 80;
  return Math.max(cols - 6, 60);
}

// ──────────────────────────────────────────────
//  ANSI Helpers
// ──────────────────────────────────────────────

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function padRight(str, width) {
  const visible = stripAnsi(str).length;
  const diff = width - visible;
  return diff > 0 ? str + ' '.repeat(diff) : str;
}

// ──────────────────────────────────────────────
//  Labeled Separator
// ──────────────────────────────────────────────

function labeledLine(label, color = pc.cyan) {
  console.log();
  console.log(pc.gray('  ') + color(label));
}

// ──────────────────────────────────────────────
//  Custom Markdown Renderer
//  (replaces marked + marked-terminal for reliability)
// ──────────────────────────────────────────────

export function renderMarkdown(text) {
  if (!text || text.trim().length === 0) return '';

  const lines = text.split('\n');
  const result = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Code block fences
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(pc.gray('  │ ') + pc.dim(line.trim()));
      continue;
    }

    // Inside code block — dim content
    if (inCodeBlock) {
      result.push(pc.gray('  │ ') + pc.dim(line));
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      result.push(pc.bold(line.substring(4)));
      continue;
    }
    if (line.startsWith('## ')) {
      result.push(pc.bold(pc.cyan(line.substring(3))));
      continue;
    }
    if (line.startsWith('# ')) {
      result.push(pc.bold(pc.cyan(line.substring(2))));
      continue;
    }

    // Inline formatting (order matters: bold before italic)
    line = line.replace(/\*\*(.+?)\*\*/g, (_, b) => pc.bold(b));
    line = line.replace(/__(.+?)__/g, (_, b) => pc.bold(b));
    line = line.replace(/`([^`]+)`/g, (_, c) => pc.cyan(c));

    // List items: `* ` or `- ` at start of line
    if (/^[*\-] /.test(line)) {
      line = pc.gray('  ·') + ' ' + line.substring(2);
    }

    // Numbered list items
    if (/^\d+\. /.test(line)) {
      const match = line.match(/^(\d+)\. (.*)$/);
      if (match) {
        line = pc.gray(`  ${match[1]}.`) + ' ' + match[2];
      }
    }

    // Blockquotes
    if (line.startsWith('> ')) {
      line = pc.gray('  │ ') + pc.dim(line.substring(2));
    }

    result.push(line);
  }

  return result.join('\n');
}

// ──────────────────────────────────────────────
//  Tool Execution Summary
// ──────────────────────────────────────────────

export function formatToolSummary(toolCalls) {
  if (!toolCalls || toolCalls.length === 0) return null;

  const counts = {};
  const details = [];

  for (const tc of toolCalls) {
    const name = tc.function.name;
    counts[name] = (counts[name] || 0) + 1;

    let args = {};
    try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }

    let detail = name;
    if (name === 'readFile' && args.path) detail = `read ${args.path}`;
    else if (name === 'writeFile' && args.path) detail = `write ${args.path}`;
    else if (name === 'editFile' && args.path) detail = `edit ${args.path}`;
    else if (name === 'listDir') detail = `list ${args.path || '.'}`;
    else if (name === 'runCommand' && args.command) detail = `exec ${args.command.substring(0, 40)}`;
    details.push(detail);
  }

  const total = toolCalls.length;
  const summary = Object.entries(counts)
    .map(([name, count]) => `${name}(${count})`)
    .join(', ');

  return { total, summary, details };
}

// ──────────────────────────────────────────────
//  Public Components
// ──────────────────────────────────────────────

export function printHeader(version = '1.0.0') {
  console.log();
  console.log(`  ${pc.bold(pc.cyan('EMILE CLI'))} ${pc.gray(`v${version}`)}`);
  console.log();
}

export function printStartupScreen(version = '1.0.0') {
  console.log('\n  ' + pc.bold('Emile CLI') + pc.gray(` v${version} (Developer coding agent)\n`));
}

export function printConfig({ provider, model, cache, effort, plans, skills, dryRun, safeMode }) {
  const items = [];
  items.push(`provider: ${provider}`);
  items.push(`model: ${model.split('/').pop()}`);
  items.push(`cache: ${cache ? 'enabled' : 'disabled'}`);
  if (effort) items.push(`effort: ${effort}`);
  if (plans) items.push(`mode: plans`);
  if (dryRun) items.push(pc.red('dry-run: active'));
  items.push(`safe-gate: ${safeMode ? pc.green('on') : pc.red('off')}`);
  items.push(`skills: ${skills}`);
  
  console.log(`  ${pc.gray(items.join(', '))}`);
}

export function printSessionBar({ sessionId, model, messageCount, stats }) {
  const shortId = sessionId.substring(0, 12);
  const shortModel = model.split('/').pop();
  
  let content = `${pc.gray('session:')} ${pc.bold(shortId)} | ${pc.gray('model:')} ${pc.bold(shortModel)} | ${pc.gray('msgs:')} ${pc.bold(messageCount)}`;
  
  if (stats && (stats.promptTokens > 0 || stats.completionTokens > 0)) {
    const totalTokens = stats.promptTokens + stats.completionTokens;
    const costBRL = (stats.totalCost * 5.50).toFixed(4);
    content += ` | ${pc.gray('tokens:')} ${pc.bold(totalTokens)} | ${pc.gray('cost:')} ${pc.bold(`$${stats.totalCost.toFixed(4)} (~R$${costBRL})`)}`;
  }
  
  console.log();
  console.log(`  ${content}`);
}

export function printAssistantResponse(content) {
  labeledLine('emile');
  const rendered = renderMarkdown(content.trim());
  if (rendered) {
    console.log(rendered.trim());
  }
}

function wrapText(text, width) {
  if (text.length <= width) return [text];
  const lines = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= width) {
      lines.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf(' ', width);
    if (splitIdx === -1 || splitIdx === 0) {
      splitIdx = width;
    }
    lines.push(remaining.substring(0, splitIdx).trim());
    remaining = remaining.substring(splitIdx).trim();
  }
  return lines;
}

export function printThinking(content) {
  if (!content || content.trim().length === 0) return;

  const w = getW();
  const innerWidth = w - 6;

  const isExpanded = config.expandThinking !== false;

  console.log();
  console.log(pc.gray(`  │ ${pc.bold('thinking')}`));

  if (!isExpanded) {
    const msg = `[Thought collapsed. Press Ctrl+P or use /thinking to expand]`;
    console.log(`  ${pc.gray('│')} ${pc.dim(msg)}`);
  } else {
    const rawLines = content.split(/\r?\n/);
    const wrappedLines = [];
    for (const rawLine of rawLines) {
      if (rawLine.trim().length === 0) {
        wrappedLines.push('');
      } else {
        wrappedLines.push(...wrapText(rawLine, innerWidth));
      }
    }
    for (const line of wrappedLines) {
      console.log(`  ${pc.gray('│')} ${pc.dim(line)}`);
    }
    const footerMsg = `(Press Ctrl+P to collapse)`;
    console.log(`  ${pc.gray('│')} ${pc.dim(footerMsg)}`);
  }
}

export function printToolSummary(toolCalls) {
  const info = formatToolSummary(toolCalls);
  if (!info) return;

  labeledLine('tools', pc.gray);
  console.log(pc.gray(`  ${info.total} tool${info.total > 1 ? 's' : ''}: ${info.summary}`));

  for (const detail of info.details) {
    console.log(pc.gray(`    ${detail}`));
  }
}

export function printToolsDone(count) {
  console.log(pc.gray(`  ${count} tool${count > 1 ? 's' : ''} completed`));
}

export function printHelp() {
  console.log();
  console.log(`  ${pc.bold('Commands')}`);
  console.log(`  ${pc.bold('/connect')}    Configure API provider and key`);
  console.log(`  ${pc.bold('/model')}      Select the active AI model`);
  console.log(`  ${pc.bold('/switch')}     Switch to a previous session`);
  console.log(`  ${pc.bold('/new')}        Start a new clean session`);
  console.log(`  ${pc.bold('/undo')}       Revert the last file modification`);
  console.log(`  ${pc.bold('/cost')}       Show session token usage and costs`);
  console.log(`  ${pc.bold('/export')}     Export the current session as Markdown`);
  console.log(`  ${pc.bold('/thinking')}   Toggle expanding/collapsing reasoning`);
  console.log(`  ${pc.bold('/help')}       Display this help menu`);
  console.log(`  ${pc.bold('exit')}        Quit the CLI`);
  console.log();
}

// ──────────────────────────────────────────────
//  Diff Block — shows actual lines, no +/- prefix
// ──────────────────────────────────────────────

export function printDiffBlock(filePath, changes) {
  labeledLine(filePath, pc.white);

  let lineNum = 1;

  changes.forEach(part => {
    const lines = part.value.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    if (part.removed) {
      // Removed lines: red text with line numbers
      lines.forEach(line => {
        const num = pc.red(String(lineNum).padStart(4));
        console.log(`  ${num} ${pc.gray('│')} ${pc.red(pc.strikethrough(line))}`);
        lineNum++;
      });
    } else if (part.added) {
      // Added lines: green text with line numbers
      lines.forEach(line => {
        const num = pc.green(String(lineNum).padStart(4));
        console.log(`  ${num} ${pc.gray('│')} ${pc.green(line)}`);
        lineNum++;
      });
    } else {
      // Context lines: collapse if too many
      if (lines.length > 4) {
        for (let i = 0; i < 2; i++) {
          const num = pc.gray(String(lineNum).padStart(4));
          console.log(`  ${num} ${pc.gray('│')} ${pc.gray(lines[i])}`);
          lineNum++;
        }
        const skipped = lines.length - 4;
        console.log(pc.gray(`       │ ... ${skipped} lines ...`));
        lineNum += skipped;
        for (let i = lines.length - 2; i < lines.length; i++) {
          const num = pc.gray(String(lineNum).padStart(4));
          console.log(`  ${num} ${pc.gray('│')} ${pc.gray(lines[i])}`);
          lineNum++;
        }
      } else {
        lines.forEach(line => {
          const num = pc.gray(String(lineNum).padStart(4));
          console.log(`  ${num} ${pc.gray('│')} ${pc.gray(line)}`);
          lineNum++;
        });
      }
    }
  });
  console.log();
}

// ──────────────────────────────────────────────
//  Conversation History Replay
// ──────────────────────────────────────────────

export function printConversationHistory(messages) {
  if (!messages || messages.length === 0) return;

  const userMsgs = messages.filter(m => m.role === 'user');
  const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.content);
  const toolMsgs = messages.filter(m => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0);

  console.log();
  console.log(pc.gray(`  Session history: ${userMsgs.length} user, ${assistantMsgs.length} assistant, ${toolMsgs.length} tool-call turns`));

  const displayable = messages.filter(m => 
    m.role === 'user' || (m.role === 'assistant' && m.content)
  );

  const limit = 10;
  const showHidden = displayable.length > limit;
  const toDisplay = showHidden ? displayable.slice(-limit) : displayable;

  if (showHidden) {
    console.log(pc.gray(`  [... ${displayable.length - limit} earlier messages hidden ...]`));
  }

  for (const msg of toDisplay) {
    if (msg.role === 'user') {
      console.log(pc.gray('  ── you ──'));
      const text = msg.content.length > 120
        ? msg.content.substring(0, 120) + '...'
        : msg.content;
      console.log(pc.dim(`  ${text}`));
    }

    if (msg.role === 'assistant' && msg.content) {
      console.log(pc.gray('  ── emile ──'));
      const text = msg.content.length > 200
        ? msg.content.substring(0, 200) + '...'
        : msg.content;
      const rendered = renderMarkdown(text);
      console.log(pc.dim(rendered));
    }
  }

  console.log(pc.gray('  End of history. Continue below.'));
  console.log();
}

export function promptInput({ message = '❯', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    if (typeof process.stdin.setRawMode !== 'function') {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`${message} `, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    const isRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);

    let input = '';
    let cursor = 0;
    let selectedIndex = 0;

    const commands = [
      { name: '/connect', desc: 'Configure API provider and key' },
      { name: '/model', desc: 'Select the active AI model' },
      { name: '/switch', desc: 'Switch to a previous session' },
      { name: '/sessions', desc: 'List and switch previous sessions' },
      { name: '/new', desc: 'Start a new clean session' },
      { name: '/clear', desc: 'Clear the current conversation session' },
      { name: '/undo', desc: 'Revert the last file modification' },
      { name: '/cost', desc: 'Show session token usage and costs' },
      { name: '/export', desc: 'Export the current session as Markdown' },
      { name: '/thinking', desc: 'Toggle expanding/collapsing reasoning output' },
      { name: '/help', desc: 'Display this help menu' },
      { name: 'exit', desc: 'Quit the CLI' }
    ];

    function getMatches() {
      if (!input.startsWith('/')) {
        const exitMatch = 'exit'.startsWith(input.toLowerCase()) && input.length > 0;
        if (!exitMatch) return [];
      }
      return commands.filter(cmd => cmd.name.startsWith(input));
    }

    let lastRenderedHeight = 0;
    let lastInputLinesCount = 1;
    let lastCursorLine = 0;

    function render() {
      const columns = process.stdout.columns || 80;
      const promptStr = `${message} `;
      const promptLength = stripAnsi(promptStr).length;

      const currentInputLinesCount = Math.floor((promptLength + input.length) / columns) + 1;
      const currentCursorLine = Math.floor((promptLength + cursor) / columns);

      if (lastCursorLine > 0) {
        process.stdout.write(`\x1B[${lastCursorLine}A`);
      }
      process.stdout.write('\r\x1B[J');

      process.stdout.write(promptStr + input);

      if (input === '' && placeholder) {
        process.stdout.write(pc.gray(placeholder));
      }

      const matches = getMatches();
      let extraLines = [];

      const modeText = config.plansMode ? pc.yellow('Plan Mode') : pc.cyan('Build Mode');
      const thinkingText = config.expandThinking !== false ? pc.blue('Thinking: Exp') : pc.gray('Thinking: Coll');
      const effortText = `Effort: ${config.defaultEffort ? pc.cyan(config.defaultEffort) : pc.orange('none')}`;
      
      const leftPart = `  ${modeText}  [${thinkingText}]`;
      const rightPart = `${effortText}`;
      
      const leftPartStrip = stripAnsi(leftPart);
      const rightPartStrip = stripAnsi(rightPart);
      const spaceCount = Math.max(columns - leftPartStrip.length - rightPartStrip.length, 2);
      const statusLine = leftPart + ' '.repeat(spaceCount) + rightPart;
      
      extraLines.push(pc.gray(statusLine));

      if (matches.length > 0) {
        matches.forEach((cmd, idx) => {
          const isSelected = idx === selectedIndex;
          const cmdStr = cmd.name.padEnd(16);
          const descStr = pc.gray(cmd.desc);
          if (isSelected) {
            extraLines.push(`  ${pc.cyan('❯')} ${pc.cyan(pc.bold(cmdStr))} ${descStr}`);
          } else {
            extraLines.push(`    ${pc.white(cmdStr)} ${descStr}`);
          }
        });
      }

      process.stdout.write('\n' + extraLines.join('\n'));

      const linesUp = extraLines.length + (currentInputLinesCount - 1) - currentCursorLine;
      if (linesUp > 0) {
        process.stdout.write(`\x1B[${linesUp}A`);
      }
      
      const targetCol = (promptLength + cursor) % columns;
      process.stdout.write('\r');
      if (targetCol > 0) {
        process.stdout.write(`\x1B[${targetCol}C`);
      }

      lastInputLinesCount = currentInputLinesCount;
      lastCursorLine = currentCursorLine;
      lastRenderedHeight = extraLines.length;
    }

    render();

    const onKeypress = (str, key) => {
      const matches = getMatches();

      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }

      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(input);
        return;
      }

      if (key.name === 'backspace') {
        if (cursor > 0) {
          input = input.slice(0, cursor - 1) + input.slice(cursor);
          cursor--;
          selectedIndex = 0;
        }
      } else if (key.name === 'delete') {
        if (cursor < input.length) {
          input = input.slice(0, cursor) + input.slice(cursor + 1);
          selectedIndex = 0;
        }
      } else if (key.name === 'left') {
        if (cursor > 0) cursor--;
      } else if (key.name === 'right') {
        if (cursor < input.length) cursor++;
      } else if (key.name === 'up') {
        if (matches.length > 0) {
          selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
        }
      } else if (key.name === 'down') {
        if (matches.length > 0) {
          selectedIndex = (selectedIndex + 1) % matches.length;
        }
      } else if (key.name === 'tab') {
        if (matches.length > 0) {
          const selectedCmd = matches[selectedIndex];
          input = selectedCmd.name;
          cursor = input.length;
          selectedIndex = 0;
        } else {
          config.plansMode = !config.plansMode;
        }
      } else if (key.ctrl && key.name === 't') {
        const efforts = ['low', 'medium', 'high'];
        const currentEffort = config.defaultEffort || 'low';
        const nextIdx = (efforts.indexOf(currentEffort) + 1) % efforts.length;
        config.defaultEffort = efforts[nextIdx];
      } else if (key.ctrl && key.name === 'p') {
        config.expandThinking = config.expandThinking !== false ? false : true;
      } else if (str && !key.meta && !key.ctrl && key.name !== 'escape') {
        input = input.slice(0, cursor) + str + input.slice(cursor);
        cursor += str.length;
        selectedIndex = 0;
      }

      render();
    };

    function cleanup() {
      if (lastCursorLine > 0) {
        process.stdout.write(`\x1B[${lastCursorLine}A`);
      }
      process.stdout.write('\r\x1B[J');
      
      const promptStr = `${message} `;
      process.stdout.write(promptStr + input + '\n');
      
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(isRaw);
      process.stdin.pause();
    }

    process.stdin.on('keypress', onKeypress);
  });
}

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
      // Clear previous lines
      if (lastRenderedHeight > 0) {
        for (let i = 0; i < lastRenderedHeight; i++) {
          process.stdout.write('\x1B[1A\x1B[2K');
        }
      }

      let lines = [];
      lines.push(`${pc.cyan('?')} Select a conversation to resume: ${pc.gray('(Ctrl+D to delete session)')}`);

      if (activeSessions.length === 0) {
        lines.push(`  ${pc.yellow('No conversation history found.')}`);
      } else {
        activeSessions.forEach((s, idx) => {
          const isSelected = idx === selectedIndex;
          const dateStr = new Date(s.updatedAt).toLocaleString();
          const label = `${s.summary} ${pc.gray(dateStr)}`;

          if (confirmingDeleteIndex === idx) {
            lines.push(`  ${pc.red('▶')} ${pc.red(pc.bold('Delete session?'))} Press ${pc.bold('y')} to confirm or any other key to cancel`);
          } else if (isSelected) {
            lines.push(`  ${pc.magenta('●')} ${pc.bold(label)}`);
          } else {
            lines.push(`  ${pc.gray('○')} ${label}`);
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


