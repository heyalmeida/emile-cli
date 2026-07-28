import { program } from 'commander';
import { text, select, isCancel, cancel, confirm } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';
import { config, hasCredentials } from './config.js';

import {
  printHeader,
  printStartupScreen,
  printConfig,
  printSessionBar,
  printHelp,
  printConversationHistory,
  promptInput as askPromptInput,
  promptSwitchSession,
} from './ui.js';


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
  .option('--dry-run', 'Simulate changes and command execution', false);

export async function main() {
  program.parse();

  const options = program.opts();
  const args = program.args;

  // Dynamically import heavy dependencies to optimize startup time (e.g. for --help)
  const { initializeMcp, shutdownMcp } = await import('./mcp.js');
  const { runAgent, sessionStats } = await import('./agent.js');
  const { saveSession, listSessions, loadSession, deleteSession } = await import('./history.js');
  const { runConnectWizard, runModelWizard } = await import('./commands.js');
  const { undoStack } = await import('./tools.js');

  // Set runtime configurations
  config.dryRun = !!options.dryRun;
  config.safeMode = options.safe !== false;
  config.plansMode = !!options.plans;

  // Premium startup screen
  printStartupScreen('1.0.0');

  // Credential check
  if (!hasCredentials()) {
    console.log();
    console.log(pc.yellow('  API Key is not configured. Starting setup...'));
    console.log();
    const success = await runConnectWizard();
    if (!success) {
      console.log(pc.red('  Configuration required. Exiting.'));
      process.exit(1);
    }
  }

  const activeSkills = options.skills.split(',').map(s => s.trim());

  // Initialize MCP
  console.log(pc.gray('Connecting to MCP servers...'));
  await initializeMcp();
  console.log(pc.gray('MCP servers ready.'));

  process.on('SIGINT', async () => {
    console.log(pc.gray('\n  Disconnecting...'));
    await shutdownMcp();
    process.exit(0);
  });

  let messages = [];
  let sessionId = `session_${Date.now()}`;
  let sessionSummary = '';
  let isResumed = false;

  // Handle history resume
  if (options.history) {
    const sessions = listSessions();
    if (sessions.length === 0) {
      console.log(pc.yellow('\n  No conversation history found.\n'));
    } else {
      const selectedId = await promptSwitchSession(sessions, deleteSession);

      if (!selectedId) {
        cancel('Cancelled.');
        await shutdownMcp();
        process.exit(0);
      }

      console.log(pc.gray('Loading session...'));
      const loaded = loadSession(selectedId);
      console.log(pc.gray('Session loaded.'));

      if (loaded) {
        messages = loaded;
        sessionId = selectedId;
        // Refresh sessions list in case some were deleted during promptSwitchSession
        const refreshedSessions = listSessions();
        const matched = refreshedSessions.find(s => s.id === selectedId);
        sessionSummary = matched ? matched.summary : '';
        isResumed = true;
      } else {
        console.log(pc.red('\n  Error loading session. Starting new.\n'));
      }
    }
  }

  const promptInput = args.join(' ');

  // Automatically check if there is an implementation plan to resume when in interactive mode
  if (!promptInput) {
    const planPath = path.join(config.workspaceDir, 'implementation_plan.md');
    const taskPath = path.join(config.workspaceDir, 'task.md');
    if (fs.existsSync(planPath) && fs.existsSync(taskPath)) {
      console.log();
      const resumePlan = await confirm({
        message: 'An existing implementation plan was found in the workspace. Do you want to resume executing this plan?',
        active: 'Yes, resume plan.',
        inactive: 'No, start fresh.',
      });
      if (resumePlan) {
        config.plansMode = true;
        console.log(pc.green('  Resuming plans mode.'));
      }
    }
  }

  // Display configuration
  printConfig({
    provider: config.provider,
    model: config.defaultModel,
    cache: options.cache,
    effort: config.defaultEffort,
    plans: config.plansMode,
    skills: options.skills,
    dryRun: config.dryRun,
    safeMode: config.safeMode,
  });

  console.log();
  console.log(pc.gray(`  Type '/help' for commands.`));

  if (isResumed) {
    console.log();
    console.log(pc.green(`  Resumed: "${sessionSummary}" (${messages.length} messages)`));
    printConversationHistory(messages);
  }

  if (promptInput) {
    messages = await runAgent({
      model: config.defaultModel,
      plansMode: config.plansMode,
      skills: activeSkills,
      cache: options.cache,
      effort: config.defaultEffort,
      messages,
      initialPrompt: promptInput,
    });

    if (!sessionSummary) {
      sessionSummary = promptInput.substring(0, 50).replace(/\r?\n/g, ' ') + '...';
    }
    saveSession(sessionId, sessionSummary, messages);

    console.log(pc.gray('\n  Session saved.'));
    await shutdownMcp();
  } else {
    let isRunning = true;

    while (isRunning) {
      // Session status bar
      printSessionBar({
        sessionId,
        model: config.defaultModel,
        messageCount: messages.filter(m => m.role === 'user').length,
        stats: sessionStats,
      });

      const userInput = await askPromptInput({
        message: pc.cyan('>'),
        placeholder: 'Enter prompt or /help',
      });

      if (isCancel(userInput) || userInput.trim().toLowerCase() === 'exit') {
        isRunning = false;
        break;
      }

      const cleanInput = userInput.trim();

      // Handle commands
      if (cleanInput === '/connect') {
        await runConnectWizard();
        printConfig({
          provider: config.provider,
          model: config.defaultModel,
          cache: options.cache,
          effort: config.defaultEffort,
          plans: config.plansMode,
          skills: options.skills,
          dryRun: config.dryRun,
          safeMode: config.safeMode,
        });
        continue;
      }

      if (cleanInput === '/model') {
        await runModelWizard();
        console.log();
        console.log(pc.gray(`  model  ${config.defaultModel.split('/').pop()}`));
        continue;
      }

      if (cleanInput === '/switch' || cleanInput === '/sessions') {
        const sessions = listSessions();
        if (sessions.length === 0) {
          console.log(pc.yellow('\n  No saved sessions.\n'));
        } else {
          const selectedId = await promptSwitchSession(sessions, deleteSession);

          if (selectedId) {
            console.log(pc.gray('Loading session...'));
            const loaded = loadSession(selectedId);
            console.log(pc.gray('Loaded.'));

            if (loaded) {
              messages = loaded;
              sessionId = selectedId;
              // Refresh sessions list in case some were deleted during promptSwitchSession
              const refreshedSessions = listSessions();
              const matched = refreshedSessions.find(s => s.id === selectedId);
              sessionSummary = matched ? matched.summary : '';
              console.log(pc.green(`\n  Switched to: "${sessionSummary}"`));
              printConversationHistory(messages);
            }
          }
        }
        continue;
      }

      if (cleanInput === '/new' || cleanInput === '/clear') {
        messages = [];
        sessionId = `session_${Date.now()}`;
        sessionSummary = '';
        console.log(pc.green('\n  New session started.'));
        continue;
      }

      if (cleanInput === '/thinking') {
        config.expandThinking = config.expandThinking !== false ? false : true;
        console.log();
        console.log(pc.gray(`  Thinking output: ${config.expandThinking !== false ? pc.green('Expanded') : pc.yellow('Collapsed')}`));
        console.log();
        continue;
      }

      if (cleanInput === '/help') {
        printHelp();
        continue;
      }

      if (cleanInput === '/undo') {
        if (undoStack.length === 0) {
          console.log(pc.yellow('\n  No changes to undo in this session.\n'));
        } else {
          const lastChange = undoStack.pop();
          try {
            if (lastChange.content === null) {
              if (fs.existsSync(lastChange.path)) {
                fs.unlinkSync(lastChange.path);
              }
              console.log(pc.green(`\n  Undo: Deleted file "${path.relative(config.workspaceDir, lastChange.path)}"\n`));
            } else {
              fs.writeFileSync(lastChange.path, lastChange.content, 'utf8');
              console.log(pc.green(`\n  Undo: Restored file "${path.relative(config.workspaceDir, lastChange.path)}"\n`));
            }
          } catch (err) {
            console.log(pc.red(`\n  Error performing undo: ${err.message}\n`));
          }
        }
        continue;
      }

      if (cleanInput === '/cost') {
        const costBRL = (sessionStats.totalCost * 5.50).toFixed(4);
        console.log();
        console.log(pc.cyan('  === Session Cost & Tokens ==='));
        console.log(pc.gray(`  Prompt Tokens:     ${sessionStats.promptTokens}`));
        console.log(pc.gray(`  Completion Tokens: ${sessionStats.completionTokens}`));
        console.log(pc.gray(`  Total Tokens:      ${sessionStats.promptTokens + sessionStats.completionTokens}`));
        console.log(pc.gray(`  Estimated Cost:    $${sessionStats.totalCost.toFixed(4)} USD (~R$${costBRL} BRL)`));
        console.log();
        continue;
      }

      if (cleanInput === '/export') {
        if (messages.length === 0) {
          console.log(pc.yellow('\n  Cannot export an empty session.\n'));
        } else {
          const exportFilename = `emile-session-${Date.now()}.md`;
          const exportPath = path.join(config.workspaceDir, exportFilename);
          try {
            let mdContent = `# Emile Session Export\n\n- **Session ID:** \`${sessionId}\`\n- **Model:** \`${config.defaultModel}\`\n- **Date:** ${new Date().toLocaleString()}\n\n---\n\n`;
            
            for (const msg of messages) {
              if (msg.role === 'system') continue;
              
              const roleName = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Emile' : 'Tool Result';
              mdContent += `### 👤 **${roleName}**\n\n`;
              
              if (msg.reasoning_content) {
                mdContent += `> **Thought:**\n> ${msg.reasoning_content.replace(/\n/g, '\n> ')}\n\n`;
              }
              
              if (msg.content) {
                mdContent += `${msg.content}\n\n`;
              }
              
              if (msg.tool_calls && msg.tool_calls.length > 0) {
                mdContent += `**Executed Tools:**\n`;
                for (const tc of msg.tool_calls) {
                  mdContent += `- Tool \`${tc.function.name}\` with arguments: \`${tc.function.arguments}\`\n`;
                }
                mdContent += `\n`;
              }
              mdContent += `---\n\n`;
            }
            
            fs.writeFileSync(exportPath, mdContent, 'utf8');
            console.log(pc.green(`\n  Session exported successfully to: "${exportFilename}"\n`));
          } catch (err) {
            console.log(pc.red(`\n  Error exporting session: ${err.message}\n`));
          }
        }
        continue;
      }

      if (cleanInput) {
        try {
          messages = await runAgent({
            model: config.defaultModel,
            plansMode: config.plansMode,
            skills: activeSkills,
            cache: options.cache,
            effort: config.defaultEffort,
            messages,
            initialPrompt: cleanInput,
          });

          if (!sessionSummary) {
            sessionSummary = cleanInput.substring(0, 50).replace(/\r?\n/g, ' ') + '...';
          }
          saveSession(sessionId, sessionSummary, messages);
        } catch (err) {
          console.error(pc.red(`\n  Error: ${err.message}`));
        }
      }
    }

    console.log(pc.gray('\n  Goodbye.'));
    await shutdownMcp();
  }
}
