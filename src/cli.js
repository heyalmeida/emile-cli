import { program } from 'commander';
import { cancel, confirm } from '@clack/prompts';
import fs from 'node:fs';
import path from 'node:path';
import { config, hasCredentials } from './config.js';
import { normalizeWorkspaceCwd } from './tools/security.js';
// All user-facing output goes through the C palette exported by ui.js —
// the single source of colors per the visual identity doc (the legacy
// picocolors remap was removed in the TUI overhaul pass 1).
import { C, stripTerminalControls, listenTurnKeys } from './ui/index.js';

import {
  printStartupScreen,
  printConfigBox,
  printConversationHistory,
  promptSwitchSession,
  configureTerminalTitle,
  setTerminalActivity,
  persistentPromptInput,
} from './ui/index.js';
import { createSpinner } from './ui/spinner.js';
import { clear } from 'node:console';


program
  .name('émile')
  .description('Premium coding CLI using Requesty API models')
  .argument('[prompt...]', 'Initial coding instruction/prompt')
  .option('-m, --model <model>', 'Requesty/OpenRouter model to use', config.defaultModel)
  .option('-e, --effort <level>', 'Reasoning effort (low, medium, high, max, min, none)', config.defaultEffort)
  .option('-p, --plans', 'Execute agent in plans mode', false)
  .option('--no-cache', 'Bypass prompt caching', false)
  .option('-s, --skills <list>', 'Comma-separated active skills (default: all)', 'all')
  .option('-H, --history', 'Select and resume a past conversation history', false)
  .option('--no-safe', 'Bypass command execution safe gate', false)
  .option('--dry-run', 'Simulate changes and command execution', false)
  .option('--web-search', 'Allow OpenRouter web search (additional provider charges may apply)', config.webSearch)
  .option('--export-thinking', 'Include model reasoning in /export output', false)
  .option('--max-session-size <bytes>', 'Maximum persisted session size in bytes', String(config.maxSessionSize))
  .option('--max-loop-iterations <n>', 'Maximum agent tool-loop iterations per turn', String(config.maxLoopIterations))
  .option('--verbose', 'Show setup and initialization logs', false);

export async function main() {
  program.parse();

  const options = program.opts();
  const args = program.args;
  const verbose = !!options.verbose;

  configureTerminalTitle({ workspace: config.workspaceDir, model: config.defaultModel });
  setTerminalActivity('starting');

  // Dynamically import heavy dependencies to optimize startup time (e.g. for --help)
  const { initializeMcp, shutdownMcp } = await import('./mcp.js');
  const { runAgent, resumePendingTools, sessionStats, initSessionStats, createTurnControl } = await import('./agent/index.js');
  const { countCompletedTurns, refreshSessionSummary } = await import('./agent/session-summary.js');
  const { saveSession, listSessions, loadSession, getSessionRecord, deleteSession, cleanSessions } = await import('./history.js');
  const { runConnectWizard, runModelWizard, runRulesCommand } = await import('./commands.js');
  const { dispatchCommand } = await import('./commands/index.js');
  const { undoStack } = await import('./tools/index.js');

  // Set runtime configurations
  config.dryRun = !!options.dryRun;
  config.safeMode = options.safe !== false;
  config.plansMode = !!options.plans;
  config.webSearch = options.webSearch === true;
  const maxSessionSize = Number(options.maxSessionSize);
  if (Number.isFinite(maxSessionSize) && maxSessionSize > 0) config.maxSessionSize = maxSessionSize;
  const maxLoopIterations = Number(options.maxLoopIterations);
  if (Number.isFinite(maxLoopIterations) && maxLoopIterations > 0) config.maxLoopIterations = maxLoopIterations;

  // Load persisted enhanced-web settings and credentials (.emile/web.json)
  // into the runtime config — without this, keys configured via /tavily or
  // /firecrawl are saved but never restored on the next startup.
  const { hydrateEnhancedWebConfig } = await import('./web/index.js');
  hydrateEnhancedWebConfig(config);

  // Refresh the dynamic model catalog (OpenRouter public endpoint) in the
  // background — effort gating and cost/context metadata use live data when
  // available. Never blocks startup; failures fall back to cache/static.
  const { initModelCatalog } = await import('./models.js');
  initModelCatalog({ verbose }).catch(() => {});

  // Startup screen (shown before any setup)
  printStartupScreen('1.0.0');

  // ── Credential check ──────────────────────────────────────────
  if (!hasCredentials()) {
    setTerminalActivity('configuring provider');
    if (verbose) console.log(C.warn('  API Key is not configured. Starting setup...'));
    console.log();
    const success = await runConnectWizard();
    if (!success) {
      setTerminalActivity('');
      console.log(C.red('  Configuration required. Exiting.'));
      process.exit(1);
    }
    configureTerminalTitle({ model: config.defaultModel });
  }

  const activeSkills = options.skills.split(',').map(s => s.trim());

  // ── MCP initialization (silent unless verbose or error) ───────
  let mcpInfo = null;
  const mcpSpinner = createSpinner();
  setTerminalActivity('connecting MCP');
  if (verbose) mcpSpinner.start('Connecting to MCP servers...');

  let mcpResult;
  try {
    mcpResult = await initializeMcp();
  } catch (err) {
    // Always show MCP errors regardless of verbose flag
    mcpSpinner.stop('MCP connection failed', '✗');
    console.error(C.red(`  MCP Error: ${err.message}`));
  }

  if (mcpResult && mcpResult.connected > 0) {
    mcpInfo = `${mcpResult.connected}/${mcpResult.connected} (${mcpResult.totalTools} tools)`;
    if (verbose) {
      mcpSpinner.stop(`MCP ready (${mcpResult.connected} server${mcpResult.connected > 1 ? 's' : ''}, ${mcpResult.totalTools} tools)`, '✓');
    } else {
      // Silently clear the spinner if it was never started
      process.stdout.write('\r\x1B[K');
    }
  } else {
    if (verbose) mcpSpinner.stop('No MCP servers', 'ℹ');
    else process.stdout.write('\r\x1B[K');
  }

  // ── Clean screen & unified header moved below, after interactive setup prompts ──
  // (so the plan-confirmation and history-selection prompts are cleared away)

  process.on('SIGINT', async () => {
    setTerminalActivity('');
    console.log(C.muted('\n  Disconnecting...'));
    await shutdownMcp();
    process.exit(0);
  });

  let messages = [];
  let sessionId = `session_${Date.now()}`;
  let sessionSummary = '';
  let isResumed = false;
  let completedTurnCount = 0;

  // ── Handle history resume ──────────────────────────────────────
  if (options.history) {
    setTerminalActivity('loading session');
    const sessions = listSessions();
    if (sessions.length === 0) {
      console.log(C.warn('\n  No conversation history found.\n'));
    } else {
      const selectedId = await promptSwitchSession(sessions, deleteSession);

      if (!selectedId) {
        cancel('Cancelled.');
        await shutdownMcp();
        process.exit(0);
      }

      const loadSpinner = createSpinner();
      loadSpinner.start('Loading session...');
      const loaded = loadSession(selectedId);
      loadSpinner.stop('Session loaded', '✓');

      if (loaded) {
        messages = loaded;
        sessionId = selectedId;
        const record = getSessionRecord(selectedId);
        config.sessionCwd = normalizeWorkspaceCwd(record?.sessionCwd) || config.workspaceDir;
        const refreshedSessions = listSessions();
        const matched = refreshedSessions.find(s => s.id === selectedId);
        sessionSummary = matched ? matched.summary : '';
        isResumed = true;
      } else {
        console.log(C.red('\n  Error loading session. Starting new.\n'));
      }
    }
  }

  const promptInput = args.join(' ');

  // ── Auto-detect implementation plan ───────────────────────────
  if (!promptInput) {
    const planPath = path.join(config.workspaceDir, 'implementation_plan.md');
    const taskPath = path.join(config.workspaceDir, 'task.md');
    if (fs.existsSync(planPath) && fs.existsSync(taskPath)) {
      console.log();
      const resumePlan = await confirm({
        message: 'An existing implementation plan was found in the workspace. Do you want to resume executing this plan?',
        active: 'Yes, resume plan.',
        inactive: 'No, start fresh.\n',
      });
      if (resumePlan) {
        config.plansMode = true;
        console.log(C.success('  Resuming plans mode.'));
      }
    }
  }

  // ── Initialize token/context estimate + model context limit ────
  initSessionStats(config.defaultModel, config.plansMode, activeSkills, messages);
  completedTurnCount = countCompletedTurns(messages);

  const checkpointSession = async (checkpointMessages, metadata) => {
    saveSession(sessionId, sessionSummary, checkpointMessages, metadata);
  };

  const finalizeSessionTurn = async () => {
    completedTurnCount += 1;
    sessionSummary = await refreshSessionSummary({
      model: config.defaultModel,
      messages,
      currentSummary: sessionSummary,
      turnCount: completedTurnCount,
    });
    saveSession(sessionId, sessionSummary, messages, { status: 'complete' });
  };

  const resumeLoadedSession = async (loadedSessionId, loadedMessages) => {
    const record = getSessionRecord(loadedSessionId);
    if (!record || record.status !== 'tool_pending') return;

    const recovery = await resumePendingTools({
      messages: loadedMessages,
      pendingToolCalls: record.pendingToolCalls,
      checkpointSession: async (checkpointMessages, metadata) => {
        saveSession(loadedSessionId, sessionSummary, checkpointMessages, metadata);
      },
    });

    if (recovery.invalid) {
      console.log(C.warn('\n  Incomplete session checkpoint was invalid; no tools were executed.\n'));
      saveSession(loadedSessionId, sessionSummary, loadedMessages, { status: 'complete' });
      return;
    }
    if (!recovery.resumed) return;

    messages = await runAgent({
      model: config.defaultModel,
      plansMode: config.plansMode,
      skills: activeSkills,
      cache: options.cache,
      effort: config.defaultEffort,
      messages: loadedMessages,
      initialPrompt: '',
      checkpointSession: async (checkpointMessages, metadata) => {
        saveSession(loadedSessionId, sessionSummary, checkpointMessages, metadata);
      },
    });
    sessionId = loadedSessionId;
    await finalizeSessionTurn();
  };

  if (verbose) {
    const { loadRules } = await import('./rules.js');
    const rules = loadRules();
    if (rules.active) {
      console.log(C.muted(`  [rules] active: ${rules.name} (${rules.content.length} chars${rules.truncated ? ', truncated' : ''})`));
    } else if (rules.error) {
      console.log(C.warn(`  [rules] unavailable: ${stripTerminalControls(rules.error)}`));
    } else {
      console.log(C.muted('  [rules] inactive (create `.emilerules` to opt in)'));
    }
  }

  // ── Clean screen & reprint unified header after interactive setup ─
  if (!verbose && hasCredentials()) {
    await new Promise(r => setTimeout(r, 50));
    process.stdout.write('\x1Bc'); // ANSI reset (clear screen + scroll back)
    printStartupScreen('1.0.0');
  }

  printConfigBox({
    provider: config.provider,
    model: config.defaultModel,
    cache: options.cache,
    effort: config.defaultEffort,
    plans: config.plansMode,
    dryRun: config.dryRun,
    safeMode: config.safeMode,
  });
  setTerminalActivity('waiting');

  if (isResumed) {
    await resumeLoadedSession(sessionId, messages);
    printConversationHistory(messages, { summary: sessionSummary });
  }

  if (promptInput) {
    // Non-interactive mode: run once and exit
    messages = await runAgent({
      model: config.defaultModel,
      plansMode: config.plansMode,
      skills: activeSkills,
      cache: options.cache,
      effort: config.defaultEffort,
      messages,
      initialPrompt: promptInput,
      checkpointSession,
    });

    if (!sessionSummary) {
      sessionSummary = promptInput.substring(0, 50).replace(/\r?\n/g, ' ') + '...';
    }
    await finalizeSessionTurn();

    console.log(C.muted('\n  Session saved.'));
    setTerminalActivity('');
    await shutdownMcp();
  } else {
    // ── Persistent REPL loop ─────────────────────────────────────
    // The full writing field owns stdin while idle. Async submissions suspend
    // it and hand stdin either to a nested picker or to listenTurnKeys, which
    // keeps the same full prompt frame visible while the agent is working.
    let isRunning = true;
    let promptApi = null;
    const pendingQueue = [];

    // Runs one agent turn with exclusive key ownership. Esc/Ctrl+C cancel
    // through turn control; Enter appends a FIFO prompt for the next turn.
    const runAgentTurn = async (initialPrompt) => {
      const control = createTurnControl();
      const keys = listenTurnKeys({
        control,
        promptOptions: { stats: sessionStats, mcpInfo },
        onLine: (line) => {
          pendingQueue.push(line);
          const preview = line.replace(/\s+/g, ' ');
          process.stdout.write(
            `\r\x1B[K  ${C.muted(`queued: ${preview.slice(0, 90)}${preview.length > 90 ? '…' : ''}`)}\n`
          );
        },
      });
      try {
        return await runAgent({
          model: config.defaultModel,
          plansMode: config.plansMode,
          skills: activeSkills,
          cache: options.cache,
          effort: config.defaultEffort,
          messages,
          initialPrompt,
          control,
          checkpointSession,
        });
      } finally {
        keys.stop();
      }
    };

    const commandContext = {
      config,
      options,
      activeSkills,
      sessionStats,
      undoStack,
      createSpinner,
      runConnectWizard,
      runModelWizard,
      runRulesCommand,
      listSessions,
      loadSession,
      deleteSession,
      cleanSessions,
      saveSession,
      initSessionStats,
      shutdownMcp,
      cancel,
      exit: (code) => process.exit(code),
      getMessages: () => messages,
      setMessages: (nextMessages) => { messages = nextMessages; },
      getSessionId: () => sessionId,
      setSessionId: (nextSessionId) => { sessionId = nextSessionId; },
      getSessionSummary: () => sessionSummary,
      setSessionSummary: (nextSummary) => { sessionSummary = nextSummary; },
      getSessionRecord,
      setPrefill: (nextPrefill) => {
        prefill = nextPrefill;
        promptApi?.setInput(nextPrefill);
      },
      resumeSession: resumeLoadedSession,
    };

    let prefill = '';
    // The persistent prompt awaits this drain, remaining detached while each
    // active owner (turn listener or slash-command picker) consumes stdin.
    const drainQueue = async () => {
      while (isRunning) {
        const next = pendingQueue.shift();
        if (!next) return;
        if (next.toLowerCase() === 'exit') {
          isRunning = false;
          return;
        }
        // Slash commands run between turns in the idle REPL.
        if (await dispatchCommand(next, commandContext)) continue;
        try {
          messages = await runAgentTurn(next);
          if (!sessionSummary) {
            sessionSummary = next.substring(0, 50).replace(/\r?\n/g, ' ') + '...';
          }
          await finalizeSessionTurn();
        } catch (err) {
          console.error(C.red(`\n  Error: ${err.message}\n`));
        }
      }
    };

    await persistentPromptInput({
      message: '❯',
      placeholder: 'Enter prompt or /help',
      initial: prefill,
      stats: sessionStats,
      sessionId,
      mcpInfo,
      onReady: (api) => { promptApi = api; },
      async onSubmit(submitted) {
        const clean = String(submitted || '').trim();
        if (!clean) return 'next';
        if (clean.toLowerCase() === 'exit') { isRunning = false; return 'cancel'; }
        // Slash commands: dispatch first, return without queuing.
        if (await dispatchCommand(clean, commandContext)) {
          return 'next';
        }
        try {
          messages = await runAgentTurn(clean);
          if (!sessionSummary) {
            sessionSummary = clean.substring(0, 50).replace(/\r?\n/g, ' ') + '...';
          }
          await finalizeSessionTurn();
          await drainQueue();
        } catch (err) {
          console.error(C.red(`\n  Error: ${err.message}\n`));
        }
        return isRunning ? 'next' : 'cancel';
      },
    });
    isRunning = false;

    clear();
    console.log(C.muted('\n  Goodbye, see you later! \n'));
    setTerminalActivity('');
    await shutdownMcp();
  }
}
