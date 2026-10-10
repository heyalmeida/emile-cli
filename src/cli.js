import { program } from 'commander';
import { cancel, confirm } from '@clack/prompts';
import fs from 'node:fs';
import path from 'node:path';
import { config, hasCredentials } from './config.js';
import { normalizeWorkspaceCwd } from './tools/security.js';
// All user-facing output goes through the C palette exported by ui.js —
// the single source of colors per the visual identity doc (the legacy
// picocolors remap was removed in the TUI overhaul pass 1).
import { C, stripTerminalControls, listenTurnKeys, formatQueuePreview } from './ui/index.js';

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


program
  .name('émile')
  .description('Premium coding CLI using Requesty API models')
  .argument('[prompt...]', 'Initial coding instruction/prompt')
  .option('-m, --model <model>', 'Requesty/OpenRouter model to use', config.defaultModel)
  .option('-e, --effort <level>', 'Reasoning effort (low, medium, high, max, min, none)', config.defaultEffort)
  .option('-p, --plans', 'Execute agent in plans mode', false)
  // Negation flags: commander treats the third argument as the default of the
  // POSITIVE option (`cache`, `safe`) — it must be true, otherwise the feature
  // is permanently off and `--no-cache`/`--no-safe` become no-ops.
  .option('--no-cache', 'Bypass prompt caching', true)
  .option('-s, --skills <list>', 'Comma-separated active skills (default: all)', 'all')
  .option('-H, --history', 'Select and resume a past conversation history', false)
  .option('--no-safe', 'Bypass command execution safe gate', true)
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
  const { saveSession, listSessions, loadSession, getSessionRecord, deleteSession, cleanSessions, flushSync, markAborted } = await import('./history.js');
  const { installShutdownHandlers, isShuttingDown } = await import('./lifecycle/index.js');
  const { runStartupRecovery } = await import('./recovery.js');
  const { runConnectWizard, runModelWizard, runRulesCommand } = await import('./commands.js');
  const { dispatchCommand } = await import('./commands/index.js');
  const { undoStack } = await import('./tools/index.js');
  const { initializeGlobalMemory, flushGlobalMemory, acceptPendingGlobalMemories, rejectPendingGlobalMemories, listPendingMemories, isMemorySkipConfirm, setMemorySkipConfirm } = await import('./memory/index.js');
  const { runMemoryConfirmModal } = await import('./ui/index.js');

  // Set runtime configurations
  config.dryRun = !!options.dryRun;
  config.safeMode = options.safe !== false;
  config.plansMode = !!options.plans;
  config.webSearch = options.webSearch === true;
  const maxSessionSize = Number(options.maxSessionSize);
  if (Number.isFinite(maxSessionSize) && maxSessionSize > 0) config.maxSessionSize = maxSessionSize;
  const maxLoopIterations = Number(options.maxLoopIterations);
  if (Number.isFinite(maxLoopIterations) && maxLoopIterations > 0) config.maxLoopIterations = maxLoopIterations;

  let memoryRoot = undefined;
  try {
    const memory = await initializeGlobalMemory({ dryRun: config.dryRun });
    memoryRoot = memory.root;
    if (verbose) {
      const replay = memory.replayed ? `, replayed ${memory.replayed}` : '';
      console.log(C.muted(`  [memory] ${memory.state.mode}, ${memory.health}${replay}`));
    }
  } catch {
    if (verbose) console.log(C.warn('  [memory] unavailable; continuing without persistent memory'));
  }

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

  // ── Recovery scan: inspect persisted sessions for pending checkpoints ────
  // Runs before the REPL; never blocks startup. Corrupt records are quarantined
  // by the scan itself, so the report below tells the user what happened and
  // what to do next — and prints nothing when there is nothing to say.
  const recoveryReport = await runStartupRecovery();
  if (recoveryReport.recoverable > 0) {
    const noun = recoveryReport.recoverable === 1 ? 'session' : 'sessions';
    console.log(C.success(`\n  ${recoveryReport.recoverable} recoverable ${noun} — resume with /switch or the resume prompt.`));
  }
  if (recoveryReport.corrupt > 0) {
    const moved = recoveryReport.quarantined.length;
    console.log(C.warn(`\n  ${recoveryReport.corrupt} corrupt session record${recoveryReport.corrupt === 1 ? '' : 's'}${moved > 0 ? ` — moved to .emile/history/corrupt/` : ' — could not be moved'}.`));
  }
  if (verbose && recoveryReport.sessionsScanned > 0) {
    console.log(C.muted(`  [recovery] scanned ${recoveryReport.sessionsScanned} sessions`));
    if (recoveryReport.scanErrors.length > 0) console.log(C.warn(`  [recovery] ${recoveryReport.scanErrors.length} scan errors`));
  }

  // ── Clean screen & unified header moved below, after interactive setup prompts ──
  // (so the plan-confirmation and history-selection prompts are cleared away)

  // Live state the shutdown coordinator needs. Declared here (before the
  // coordinator is installed) so its closures never depend on a later `let`.
  let liveSessionId = '';
  let turnInFlight = false;
  let livePromptApi = null;

  // Wire the lifecycle coordinator after MCP init. The coordinator handles
  // SIGINT/SIGTERM/SIGHUP in order: stop-input → drain-tools →
  // flush-session → flush-memory → close-mcp → restore-terminal.
  installShutdownHandlers({
    verbose,
    shutdownMcp,
    flushSync,
    flushMemory: () => flushGlobalMemory({ root: memoryRoot, dryRun: config.dryRun }),
    // Record an interrupted turn WITHOUT destroying its resumability. No-ops when
    // no turn is in flight (idle SIGINT must not invent an aborted turn).
    markAborted: (reason) => {
      if (!turnInFlight || !liveSessionId) return;
      markAborted(liveSessionId, reason);
    },
    // Idle SIGINT must release the stdin lease: the prompt's own teardown
    // removes its keypress listener, restores raw mode and disables bracketed
    // paste. Safe before the prompt exists.
    shutdownPrompt: () => { try { livePromptApi?.shutdown?.(); } catch { /* stdin may be gone */ } },
  });

  let messages = [];
  let sessionId = `session_${Date.now()}`;
  liveSessionId = sessionId;
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
        liveSessionId = sessionId;
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

    // An interrupted turn keeps its `tool_pending` checkpoint (markAborted is
    // additive), so it is fully resumable — the user just gets told why the
    // transcript stops where it does.
    if (record.aborted) {
      const reason = record.abortReason ? ` (${record.abortReason})` : '';
      console.log(C.muted(`\n  This turn was interrupted${reason} — resuming its pending tool calls.\n`));
    }

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
      memorySessionId: loadedSessionId,
      memoryRoot,
    });
    sessionId = loadedSessionId;
    liveSessionId = sessionId;
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
      memorySessionId: sessionId,
      memoryRoot,
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
      // Tells the shutdown coordinator there IS a turn worth recording as aborted.
      turnInFlight = true;
      const keys = listenTurnKeys({
        control,
        promptOptions: { stats: sessionStats, mcpInfo },
        onLine: (line) => {
          pendingQueue.push(line);
          // The preview is display-only and carries a `(+N chars)` marker when
          // the line is longer, so it can never imply the whole text was taken.
          process.stdout.write(
            `\r\x1B[K  ${C.muted(`queued: ${formatQueuePreview(line)}`)}\n`
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
          memorySessionId: sessionId,
          memoryRoot,
        });
      } finally {
        keys.stop();
        turnInFlight = false;
      }
    };

    const maybeRunMemoryConfirmModal = async () => {
      if (isMemorySkipConfirm()) return;
      const pending = listPendingMemories({ root: memoryRoot, dryRun: config.dryRun }).records;
      if (pending.length === 0) return;
      try {
        const result = await runMemoryConfirmModal(pending, {
          onAccept: async (ids) => {
            try { await acceptPendingGlobalMemories(ids, { root: memoryRoot, dryRun: config.dryRun }); } catch { /* best-effort */ }
          },
          onReject: async (ids) => {
            try { await rejectPendingGlobalMemories(ids, { root: memoryRoot, dryRun: config.dryRun }); } catch { /* best-effort */ }
          },
        });
        if (result.action === 'accept-all') setMemorySkipConfirm(true);
      } catch { /* best-effort */ }
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
      memoryRoot,
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
          await maybeRunMemoryConfirmModal();
        } catch (err) {
          console.error(C.red(`\n  Error: ${err.message}\n`));
        }
      }
    };

    await persistentPromptInput({
      message: '›',
      placeholder: 'Enter prompt or /help',
      initial: prefill,
      stats: sessionStats,
      sessionId,
      mcpInfo,
      ctx: { config, memoryRoot },
      onReady: (api) => { promptApi = api; livePromptApi = api; },
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
          await maybeRunMemoryConfirmModal();
          await drainQueue();
        } catch (err) {
          console.error(C.red(`\n  Error: ${err.message}\n`));
        }
        return isRunning ? 'next' : 'cancel';
      },
    });
    isRunning = false;

    // When the prompt resolved because the shutdown coordinator tore it down
    // (idle SIGINT), the coordinator owns the exit: printing a farewell, wiping
    // the screen or closing MCP here would race its remaining phases and destroy
    // the transcript the user was reading.
    if (isShuttingDown()) return;

    console.log(C.muted('\n  Goodbye, see you later! \n'));
    setTerminalActivity('');
    await shutdownMcp();
  }
}
