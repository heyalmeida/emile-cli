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
  printToolSummary,
  printToolsDone,
} from './ui.js';

// Global session statistics for token tracking and cost estimates
export const sessionStats = {
  promptTokens: 0,
  completionTokens: 0,
  totalCost: 0,
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

  // Context Compression Gate: if total characters of the history exceeds 120,000 (~30k tokens), compress older messages
  const historyStr = JSON.stringify(messages);
  if (historyStr.length > 120000 && messages.length > 8) {
    console.log(pc.gray('Compressing older history to save context...'));

    try {
      const systemMessage = messages[0];
      const messagesToSummarize = messages.slice(1, messages.length - 6);
      const messagesToKeep = messages.slice(messages.length - 6);

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

      console.log(pc.green('History compressed successfully!'));
    } catch (compressErr) {
      console.log(pc.yellow('History compression failed, continuing with full history.'));
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

  while (loop) {
    console.log(pc.gray('  thinking...'));

    let response;
    try {
      response = await createChatCompletion({
        model,
        messages: allTools.length > 0 ? messages : messages, // Keep messages clean
        tools: allTools.length > 0 ? allTools : undefined,
        useCache: cache,
        effort,
      });
    } catch (err) {
      console.log(pc.red('  API error'));
      break;
    }

    // Accumulate tokens and cost estimates
    if (response && response.usage) {
      const pTokens = response.usage.prompt_tokens || 0;
      const cTokens = response.usage.completion_tokens || 0;
      sessionStats.promptTokens += pTokens;
      sessionStats.completionTokens += cTokens;
      sessionStats.totalCost += calculateCost(model, pTokens, cTokens);
    }

    const choice = response.choices[0];
    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    let thinkingContent = assistantMessage.reasoning_content || assistantMessage.reasoning || '';
    let textContent = assistantMessage.content || '';

    if (!thinkingContent && textContent.includes('<think>')) {
      const match = textContent.match(/<think>([\s\S]*?)<\/think>/);
      if (match) {
        thinkingContent = match[1].trim();
        textContent = textContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
      }
    }

    if (thinkingContent) {
      printThinking(thinkingContent);
    }

    if (textContent) {
      printAssistantResponse(textContent);
    }

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
