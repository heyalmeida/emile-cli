import pc from 'picocolors';
import { buildSystemPrompt } from './prompt.js';
import { createChatCompletion } from './api.js';
import { toolDefinitions, toolHandlers, clearFileCache } from './tools.js';
import { getMcpToolDefinitions, handleMcpToolCall, isMcpTool } from './mcp.js';
import { promptPlanApproval, renderPlanStatus } from './plans.js';
import { config } from './config.js';
import {
  printAssistantResponse,
  printThinking,
  startThinkingStream,
  appendThinkingStream,
  endThinkingStream,
  printToolSummary,
  printToolsDone,
  printSkillsDetected,
} from './ui.js';
import { createSpinner } from './spinner.js';

// Fallback for paid models: if the paid API errors, drop back to the free router
const FREE_FALLBACK_MODEL = 'openrouter/free';

/** Returns true if the model is NOT a free-tier route (i.e. a paid provider or paid model). */
function isPaidModel(model) {
  // opencode and opencode-go are always paid gateways
  if (config.provider === 'opencode' || config.provider === 'opencode-go') return true;
  return model !== 'openrouter/free' && !model.endsWith(':free');
}

// Global session statistics for token tracking and cost estimates
export const sessionStats = {
  promptTokens: 0,
  completionTokens: 0,
  totalCost: 0,
  // Latest API response usage — authoritative current context size
  lastPromptTokens: 0,
  lastCompletionTokens: 0,
  // Pre-call char-based estimate (fallback before the first API response)
  estimatedContextTokens: 0,
  // Active model context window limit (tokens)
  contextLimit: 128000,
};

// Calculates the estimated cost of API calls in USD based on model pricing
export function calculateCost(model, promptTokens, completionTokens) {
  let inputPrice = 3.0;
  let outputPrice = 15.0;

  const modelLower = model.toLowerCase();
  if (modelLower.includes('claude-3-5-sonnet') || modelLower.includes('claude-3.5-sonnet')) {
    inputPrice = 3.0;
    outputPrice = 15.0;
  } else if (modelLower.includes('gemini-2.5-pro') || modelLower.includes('gemini-2.0-pro')) {
    inputPrice = 1.25;
    outputPrice = 5.0;
  } else if (modelLower.includes('gemini-2.5-flash') || modelLower.includes('gemini-2.0-flash')) {
    inputPrice = 0.075;
    outputPrice = 0.3;
  } else if (modelLower.includes('gpt-4o')) {
    inputPrice = 2.5;
    outputPrice = 10.0;
  } else if (modelLower.includes('deepseek-chat') || modelLower.includes('deepseek-reasoner') || modelLower.includes('deepseek')) {
    inputPrice = 0.27;
    outputPrice = 1.10;
  }

  return ((promptTokens * inputPrice) + (completionTokens * outputPrice)) / 1000000;
}

/**
 * Returns the maximum context window (in tokens) for a given model.
 * Used to display context usage as a quota in the status bar.
 */
export function getContextLimit(model) {
  const m = (model || '').toLowerCase();
  if (m.includes('claude')) return 200000;
  if (m.includes('gemini-2.5-pro') || m.includes('gemini-1.5-pro') || m.includes('gemini-2.0-pro')) return 2000000;
  if (m.includes('gemini')) return 1000000;
  if (m.includes('gpt-4.1')) return 1047576;
  if (m.includes('gpt-4o') || m.includes('gpt-4-turbo')) return 128000;
  if (m.includes('o1') || m.includes(' o3') || m.includes('o3-') || m.includes('o4-')) return 200000;
  if (m.includes('deepseek')) return 64000;
  if (m.includes('qwen')) return 131072;
  if (m.includes('llama-3') || m.includes('llama3')) return 131072;
  if (m.includes('openrouter/free')) return 128000;
  return 128000; // safe default
}

/**
 * Estimates total context token consumption of a payload.
 * Counts System Prompt + Tool Schemas + Message history (incl. tool results),
 * then converts characters → tokens (~1 token ≈ 3.7 chars for PT/EN + code).
 *
 * @param {object} params
 * @param {string}        params.systemPrompt
 * @param {Array<object>} params.tools      Tool JSON-schema definitions
 * @param {Array<object>} params.messages   Conversation messages
 * @returns {{ systemChars:number, toolChars:number, messageChars:number, totalChars:number, estimatedTokens:number }}
 */
export function calculateContextUsage({ systemPrompt, tools, messages }) {
  const systemChars = (systemPrompt || '').length;
  const toolChars = JSON.stringify(tools || []).length;
  let messageChars = 0;
  for (const msg of (messages || [])) {
    if (msg.role === 'system') continue; // counted separately via systemPrompt
    messageChars += JSON.stringify(msg).length;
  }
  const totalChars = systemChars + toolChars + messageChars;
  const estimatedTokens = Math.ceil(totalChars / 3.7);
  return { systemChars, toolChars, messageChars, totalChars, estimatedTokens };
}

/**
 * Initializes session statistics with a baseline context estimate and the
 * active model's context window limit. Called once at startup (and on session
 * switch) so the status bar can show context usage before the first API
 * response provides authoritative `prompt_tokens`.
 */
export function initSessionStats(model, plansMode, skills, messages = []) {
  const systemPrompt = buildSystemPrompt({ plansMode, skills });
  const allTools = [...toolDefinitions, ...getMcpToolDefinitions()];
  const usage = calculateContextUsage({ systemPrompt, tools: allTools, messages });
  sessionStats.estimatedContextTokens = usage.estimatedTokens;
  sessionStats.contextLimit = getContextLimit(model);
  return usage;
}

async function executeTool(toolCall) {
  const { name, arguments: argsString } = toolCall.function;
  let args = {};

  try {
    args = JSON.parse(argsString);
  } catch (err) {
    return `Error: Failed to parse tool arguments: ${err.message}`;
  }

  try {
    if (isMcpTool(name)) {
      return await handleMcpToolCall(name, args);
    } else if (toolHandlers[name]) {
      return await toolHandlers[name](args);
    }
    return `Error: Unknown tool "${name}"`;
  } catch (err) {
    return `Error executing tool: ${err.message}`;
  }
}

export async function runAgent({
  model,
  plansMode,
  skills,
  cache,
  effort,
  messages = [],
  initialPrompt = '',
}) {
  // Clear file read cache at the beginning of each turn/interaction
  clearFileCache();

  // Context Compression Gate
  // Free router: trigger at 40k chars (~10k tokens) to prevent context overflows.
  // Paid models: trigger at 120k chars (~30k tokens).
  const compressionLimit = isPaidModel(model) ? 120000 : 40000;
  const historyStr = JSON.stringify(messages);
  if (historyStr.length > compressionLimit && messages.length > 8) {
    process.stdout.write(`\r\x1B[K  ${pc.dim('⚙ compressing context...')}\n`);

    try {
      const systemMessage = messages[0];

      // Safe split point to avoid breaking assistant (tool_calls) and tool response pairs
      let splitIdx = Math.max(1, messages.length - 6);
      while (splitIdx > 1 && messages[splitIdx].role === 'tool') {
        splitIdx--;
      }
      while (splitIdx > 1 && messages[splitIdx].role === 'assistant' && messages[splitIdx].tool_calls) {
        if (messages[splitIdx - 1] && messages[splitIdx - 1].role === 'user') {
          splitIdx = splitIdx - 1;
          break;
        }
        splitIdx--;
      }

      const messagesToSummarize = messages.slice(1, splitIdx);
      const messagesToKeep = messages.slice(splitIdx);

      const summaryMessages = [
        {
          role: 'system',
          content: 'You are a concise technical summarizer. Summarize the following coding session history. Focus on decisions made, code changes applied, files modified, and current system state. Keep it dense, structured, and under 500 words.',
        },
        {
          role: 'user',
          content: JSON.stringify(messagesToSummarize),
        }
      ];

      const summaryResponse = await createChatCompletion({
        model,
        messages: summaryMessages,
        useCache: false,
        effort: 'low',
        stream: false,
      });

      const summaryText = summaryResponse.choices[0].message.content;

      // Reassemble the messages array
      messages.length = 0;
      messages.push(systemMessage);
      messages.push({
        role: 'system',
        content: `=== COMPRESSED HISTORICAL CONVERSATION CONTEXT ===\nBelow is a summary of the earlier part of this conversation (which has been compressed to save token usage):\n\n${summaryText}\n=================================================`,
      });
      messages.push(...messagesToKeep);

      process.stdout.write(`\r\x1B[K  ${pc.green('✔')} ${pc.dim('context compressed')}\n`);
    } catch (compressErr) {
      process.stdout.write(`\r\x1B[K  ${pc.yellow('⚠')} ${pc.dim('context compression failed, continuing')}\n`);
    }
  }

  const systemPrompt = buildSystemPrompt({ plansMode, skills });

  if (messages.length === 0) {
    messages.push({ role: 'system', content: systemPrompt });
  } else if (messages[0] && messages[0].role === 'system') {
    messages[0].content = systemPrompt;
  }

  if (initialPrompt) {
    messages.push({ role: 'user', content: initialPrompt });
  }

  let loop = true;
  let isFirstTurn = true;
  let planApproved = !plansMode;

  const localTools = toolDefinitions;
  const mcpTools = getMcpToolDefinitions();
  const allTools = [...localTools, ...mcpTools];

  // Pre-call context estimate: System Prompt + Tool Schemas + Messages.
  // Used as a fallback by the status bar until the API returns real usage.
  const _ctxUsage = calculateContextUsage({ systemPrompt, tools: allTools, messages });
  sessionStats.estimatedContextTokens = _ctxUsage.estimatedTokens;
  sessionStats.contextLimit = getContextLimit(model);

  // Active model — may fall back to openrouter/free if paid model errors
  let activeModel = model;
  let hasFallenBack = false;

  while (loop) {
    const spinner = createSpinner();
    spinner.start('thinking...');

    let responseStream;
    try {
      responseStream = await createChatCompletion({
        model: activeModel,
        messages,
        tools: allTools.length > 0 ? allTools : undefined,
        useCache: cache,
        effort,
        stream: true,
      });
    } catch (err) {
      spinner.stop('API error', '✗');

      // Fallback: if a paid model errors and we haven't already fallen back,
      // switch to openrouter/free and retry without losing context.
      if (isPaidModel(activeModel) && !hasFallenBack) {
        process.stdout.write(
          `\r\x1B[K  ${pc.yellow('⚠')} ${pc.dim(`Paid model unavailable. Falling back to openrouter/free...`)}\n`
        );
        activeModel = FREE_FALLBACK_MODEL;
        hasFallenBack = true;
        continue;
      }

      break;
    }

    let reasoningContent = '';
    let textContent = '';
    let toolCallDeltas = [];
    let usage = null;
    let isFirstChunk = true;
    let thinkingStreamed = false;

    try {
      for await (const chunk of responseStream) {
        if (isFirstChunk) {
          spinner.stop('response received', '✓');
          isFirstChunk = false;
        }

        if (chunk.usage) {
          usage = chunk.usage;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta || {};

        const rDelta = delta.reasoning_content || delta.reasoning || '';
        if (rDelta) {
          if (!thinkingStreamed) {
            startThinkingStream();
            thinkingStreamed = true;
          }
          appendThinkingStream(rDelta);
          reasoningContent += rDelta;
        }

        const cDelta = delta.content || '';
        if (cDelta) {
          textContent += cDelta;
        }

        if (delta.tool_calls) {
          for (const tcDelta of delta.tool_calls) {
            const idx = tcDelta.index ?? 0;
            if (!toolCallDeltas[idx]) {
              toolCallDeltas[idx] = {
                id: tcDelta.id || `call_${Date.now()}_${idx}`,
                type: 'function',
                function: { name: '', arguments: '' },
              };
            }
            if (tcDelta.id) toolCallDeltas[idx].id = tcDelta.id;
            if (tcDelta.function?.name) toolCallDeltas[idx].function.name += tcDelta.function.name;
            if (tcDelta.function?.arguments) toolCallDeltas[idx].function.arguments += tcDelta.function.arguments;
          }
        }
      }
    } catch (streamErr) {
      if (isFirstChunk) spinner.stop('Stream error', '✗');
    }

    if (isFirstChunk) {
      spinner.stop('response received', '✓');
    }

    // Accumulate tokens and cost estimates
    if (usage) {
      const pTokens = usage.prompt_tokens || 0;
      const cTokens = usage.completion_tokens || 0;
      sessionStats.promptTokens += pTokens;
      sessionStats.completionTokens += cTokens;
      sessionStats.totalCost += calculateCost(model, pTokens, cTokens);
      // Latest API response = authoritative current context size
      sessionStats.lastPromptTokens = pTokens;
      sessionStats.lastCompletionTokens = cTokens;
    }

    if (!reasoningContent && textContent.includes('<think>')) {
      const match = textContent.match(/<think>([\s\S]*?)<\/think>/);
      if (match) {
        reasoningContent = match[1].trim();
        textContent = textContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
      }
    }

    if (reasoningContent) {
      if (thinkingStreamed) {
        endThinkingStream();
      } else {
        printThinking(reasoningContent);
      }
    }

    if (textContent) {
      printAssistantResponse(textContent);
    }

    const assistantMessage = {
      role: 'assistant',
      content: textContent || null,
    };

    if (reasoningContent) {
      assistantMessage.reasoning_content = reasoningContent;
    }

    const validToolCalls = toolCallDeltas.filter(tc => tc && tc.function && tc.function.name);
    if (validToolCalls.length > 0) {
      assistantMessage.tool_calls = validToolCalls;
    }

    // Intercept text-embedded tool calls if assistantMessage.tool_calls is empty
    if ((!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) && textContent) {
      const toolCallRegex = /<(?:TOOLCALL|tool_call|tool)>([\s\S]*?)<\/(?:TOOLCALL|tool_call|tool)>/gi;
      let match;
      const extractedCalls = [];
      let idx = 0;

      while ((match = toolCallRegex.exec(textContent)) !== null) {
        try {
          const parsed = JSON.parse(match[1].trim());
          const name = parsed.name || parsed.function?.name || parsed.tool;
          const args = parsed.arguments || parsed.parameters || parsed.args || {};
          if (name) {
            extractedCalls.push({
              id: `call_text_${Date.now()}_${idx++}`,
              type: 'function',
              function: {
                name,
                arguments: typeof args === 'string' ? args : JSON.stringify(args),
              },
            });
          }
        } catch { /* ignore non-json */ }
      }

      if (extractedCalls.length > 0) {
        assistantMessage.tool_calls = extractedCalls;
      }
    }

    messages.push(assistantMessage);

    // Plans mode approval gate
    if (plansMode && isFirstTurn && !planApproved) {
      const approved = await promptPlanApproval();
      if (!approved) {
        console.log(pc.red('\n  Plan execution cancelled.'));
        break;
      }
      planApproved = true;
      messages.push({
        role: 'user',
        content: 'Plan approved. Please write the implementation_plan.md and task.md files to the workspace, and start executing the plan task by task.',
      });
      isFirstTurn = false;
      continue;
    }

    // Process tool calls as a batch — no clack spinner, just text output
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolCalls = assistantMessage.tool_calls;

      printToolSummary(toolCalls);

      for (const toolCall of toolCalls) {
        const toolResult = await executeTool(toolCall);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }

      printToolsDone(toolCalls.length);

      if (plansMode) {
        renderPlanStatus();
      }

      isFirstTurn = false;
      continue;
    }

    isFirstTurn = false;
    break;
  }

  return messages;
}
