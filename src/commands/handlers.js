import fs from 'node:fs';
import path from 'node:path';
import { confirm, isCancel } from '@clack/prompts';
import { saveUserConfig } from '../config.js';
import { normalizeWorkspaceCwd } from '../tools/security.js';
import {
  C,
  printConfigBox,
  printHelp,
  printConversationHistory,
  promptSwitchSession,
  configureTerminalTitle,
  setTerminalActivity,
} from '../ui/index.js';

export async function handleConnect(ctx) {
  setTerminalActivity('configuring provider');
  await ctx.runConnectWizard();
  configureTerminalTitle({ model: ctx.config.defaultModel });
  printConfigBox({
    provider: ctx.config.provider,
    model: ctx.config.defaultModel,
    cache: ctx.options.cache,
    effort: ctx.config.defaultEffort,
    plans: ctx.config.plansMode,
    dryRun: ctx.config.dryRun,
    safeMode: ctx.config.safeMode,
  });
  setTerminalActivity('waiting');
}

export async function handleModel(ctx) {
  setTerminalActivity('selecting model');
  await ctx.runModelWizard();
  configureTerminalTitle({ model: ctx.config.defaultModel });
  setTerminalActivity('waiting');
  console.log();
  console.log(C.muted(`  model  ${ctx.config.defaultModel.split('/').pop()}`));
}

export async function handleSessions(ctx, args = []) {
  if (args[0] === 'clean') {
    const result = ctx.cleanSessions ? ctx.cleanSessions(args[1]) : { deleted: 0, invalid: true };
    if (result.invalid) {
      console.log(C.warn('\n  Usage: /sessions clean <days> (days must be positive)\n'));
    } else {
      console.log(C.success(`\n  Removed ${result.deleted} session${result.deleted === 1 ? '' : 's'}.\n`));
    }
    return;
  }
  setTerminalActivity('loading session');
  const sessions = ctx.listSessions();
  if (sessions.length === 0) {
    console.log(C.warn('\n  No saved sessions.\n'));
  } else {
    const selectedId = await promptSwitchSession(sessions, ctx.deleteSession);

    if (!selectedId) {
      setTerminalActivity('waiting');
      return;
    }

    const switchSpinner = ctx.createSpinner();
    switchSpinner.start('Loading session...');
    const loaded = ctx.loadSession(selectedId);
    switchSpinner.stop('Session loaded', '✓');

    if (loaded) {
      ctx.setMessages(loaded);
      ctx.setSessionId(selectedId);
      const record = ctx.getSessionRecord ? ctx.getSessionRecord(selectedId) : null;
      ctx.config.sessionCwd = normalizeWorkspaceCwd(record?.sessionCwd) || ctx.config.workspaceDir;
      const refreshedSessions = ctx.listSessions();
      const matched = refreshedSessions.find(s => s.id === selectedId);
      ctx.setSessionSummary(matched ? matched.summary : '');
      ctx.initSessionStats(ctx.config.defaultModel, ctx.config.plansMode, ctx.activeSkills, loaded);
      if (typeof ctx.resumeSession === 'function') {
        await ctx.resumeSession(selectedId, loaded);
      }
      console.clear();
      printConversationHistory(ctx.getMessages(), { summary: ctx.getSessionSummary() });
    }
  }
  setTerminalActivity('waiting');
}

export function handleNewSession(ctx) {
  ctx.setMessages([]);
  ctx.setSessionId(`session_${Date.now()}`);
  ctx.setSessionSummary('');
  if (ctx.config) ctx.config.sessionCwd = ctx.config.workspaceDir;
  console.log(C.success('\n  New session started.'));
}

export function handleRewind(ctx) {
  const messages = ctx.getMessages();
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx === -1) {
    console.log(`\n${C.warn('  No message to rewind.')}\n`);
    return;
  }

  const rewound = messages[lastUserIdx].content;
  const remaining = messages.slice(0, lastUserIdx);
  ctx.setMessages(remaining);
  ctx.initSessionStats(ctx.config.defaultModel, ctx.config.plansMode, ctx.activeSkills, remaining);
  ctx.saveSession(ctx.getSessionId(), ctx.getSessionSummary(), remaining);
  console.log(`\n${C.muted('  Rewound to your last message — edit and resend below.')}\n`);
  ctx.setPrefill(typeof rewound === 'string' ? rewound : '');
}

export function handleThinking(ctx) {
  ctx.config.expandThinking = ctx.config.expandThinking === true ? false : true;
  console.log();
  console.log(C.muted(`  Thinking output: ${ctx.config.expandThinking === true ? C.success('Expanded') : C.dim('Collapsed')}`));
  console.log();
}

export function handleWebSearch(ctx) {
  if (ctx.config.provider !== 'openrouter') {
    ctx.config.webSearch = false;
    saveUserConfig({ webSearch: false });
    console.log(C.warn('\n  Web search is currently available only with the OpenRouter provider.\n'));
    return;
  }

  ctx.config.webSearch = ctx.config.webSearch !== true;
  saveUserConfig({ webSearch: ctx.config.webSearch });
  const state = ctx.config.webSearch ? C.success('Enabled') : C.dim('Disabled');
  console.log();
  console.log(`  Web search: ${state}`);
  if (ctx.config.webSearch) {
    console.log(C.warn('  Search may add provider charges, including on free model routes.'));
  }
  console.log();
}

export function handleHelp() {
  printHelp();
}

function restoreUndoEntry(entry, workspaceDir) {
  if (entry.content === null) {
    if (fs.existsSync(entry.path)) fs.unlinkSync(entry.path);
    return `Deleted file "${path.relative(workspaceDir, entry.path)}"`;
  }
  fs.writeFileSync(entry.path, entry.content, 'utf8');
  return `Restored file "${path.relative(workspaceDir, entry.path)}"`;
}

export async function handleUndo(ctx, args = []) {
  if (ctx.undoStack.length === 0) {
    console.log(C.warn('\n  No changes to undo in this session.\n'));
    return;
  }

  const countText = args[0] || '1';
  if (!/^\d+$/.test(countText) || Number(countText) < 1 || Number(countText) > ctx.undoStack.length) {
    console.log(C.warn(`\n  Undo count must be a whole number from 1 to ${ctx.undoStack.length}.\n`));
    return;
  }
  const count = Number(countText);
  const entries = ctx.undoStack.slice(-count).reverse();

  if (count > 1) {
    const paths = entries
      .map(entry => path.relative(ctx.config.workspaceDir, entry.path))
      .join(', ');
    const approved = await (ctx.confirmUndo || confirm)({
      message: `Restore the last ${count} changes (${paths})?`,
      active: 'Yes, restore them',
      inactive: 'No, cancel',
    });
    if (isCancel(approved) || !approved) return;
  }

  const restored = [];
  try {
    for (const entry of entries) {
      restored.push(restoreUndoEntry(entry, ctx.config.workspaceDir));
      ctx.undoStack.pop();
    }
    console.log(C.success(`\n  Undo: ${restored.join('; ')}\n`));
  } catch (err) {
    console.log(C.red(`\n  Error performing undo: ${err.message}\n`));
  }
}

export function handleCost(ctx) {
  const stats = ctx.sessionStats;
  const costBRL = (stats.totalCost * 5.50).toFixed(4);
  const cachePct = stats.promptTokens > 0 && stats.cachedPromptTokens > 0
    ? `${Math.round((stats.cachedPromptTokens / stats.promptTokens) * 100)}%`
    : '—';
  console.log();
  console.log(C.info('  === Session Cost & Tokens ==='));
  console.log(C.muted(`  Prompt Tokens:     ${stats.promptTokens}`));
  console.log(C.muted(`  Cached Tokens:     ${stats.cachedPromptTokens}  (hit rate: ${C.success(cachePct)})`));
  console.log(C.muted(`  Completion Tokens: ${stats.completionTokens}`));
  console.log(C.muted(`  Total Tokens:      ${stats.promptTokens + stats.completionTokens}`));
  console.log(C.muted(`  Estimated Cost:    $${stats.totalCost.toFixed(4)} USD (~R$${costBRL} BRL)`));
  console.log();
}

export function handleExport(ctx, args = []) {
  const messages = ctx.getMessages();
  if (messages.length === 0) {
    console.log(C.warn('\n  Cannot export an empty session.\n'));
    return;
  }

  const includeThinking = ctx.options?.exportThinking === true || args.includes('--export-thinking');
  const exportFilename = `emile-session-${Date.now()}.md`;
  const exportPath = path.join(ctx.config.workspaceDir, exportFilename);
  try {
    let mdContent = `# Emile Session Export\n\n- **Session ID:** \`${ctx.getSessionId()}\`\n- **Model:** \`${ctx.config.defaultModel}\`\n- **Date:** ${new Date().toLocaleString()}\n\n---\n\n`;

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      const roleName = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Emile' : 'Tool Result';
      mdContent += `### 👤 **${roleName}**\n\n`;

      if (includeThinking && msg.reasoning_content) {
        mdContent += `> **Thought:**\n> ${msg.reasoning_content.replace(/\n/g, '\n> ')}\n\n`;
      }

      if (msg.content) mdContent += `${msg.content}\n\n`;

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        mdContent += '**Executed Tools:**\n';
        for (const tc of msg.tool_calls) {
          mdContent += `- Tool \`${tc.function.name}\` with arguments: \`${tc.function.arguments}\`\n`;
        }
        mdContent += '\n';
      }
      mdContent += '---\n\n';
    }

    fs.writeFileSync(exportPath, mdContent, 'utf8');
    console.log(C.success(`\n  Session exported successfully to: "${exportFilename}"\n`));
  } catch (err) {
    console.log(C.red(`\n  Error exporting session: ${err.message}\n`));
  }
}

export async function handleRules(ctx) {
  await ctx.runRulesCommand();
}
