import { select, password, text, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { saveUserConfig, config } from './config.js';
import { resetClient } from './api.js';

/**
 * Runs the interactive configuration wizard to connect a provider.
 * @returns {Promise<boolean>} True if connection succeeded, false otherwise
 */
export async function runConnectWizard() {
  console.log('\n' + pc.gray('  Connection Setup'));
  
  const provider = await select({
    message: 'Select the API provider:',
    options: [
      { value: 'openrouter', label: 'OpenRouter (https://openrouter.ai)' },
      { value: 'requesty', label: 'Requesty (https://requesty.ai)' },
    ],
  });

  if (isCancel(provider)) {
    cancel('Connection setup cancelled.');
    return false;
  }

  const apiKey = await password({
    message: `Enter API Key for ${provider === 'openrouter' ? 'OpenRouter' : 'Requesty'}:`,
    validate(value) {
      if (!value || value.trim().length === 0) return 'API Key cannot be empty.';
    },
  });

  if (isCancel(apiKey)) {
    cancel('Connection setup cancelled.');
    return false;
  }

  // Choose default model for provider
  let defaultModel = provider === 'openrouter' 
    ? 'anthropic/claude-3.5-sonnet' 
    : 'anthropic/claude-3-5-sonnet';

  // Save config
  saveUserConfig({
    provider,
    apiKey,
    model: defaultModel,
  });

  // Force API client to re-initialize with new keys
  resetClient();

  console.log(pc.green(`Connected to ${provider} successfully.`));
  console.log(pc.gray(`Settings saved to .emile/config.json\n`));
  return true;
}

/**
 * Runs the interactive model selection wizard.
 */
export async function runModelWizard() {
  console.log('\n' + pc.gray('  Model Selection'));
  console.log(pc.gray(`Active provider: ${config.provider}`));

  let optionsList = [];

  if (config.provider === 'openrouter') {
    optionsList = [
      { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (Recommended for Code)' },
      { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Giant context)' },
      { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast and cheap)' },
      { value: 'deepseek/deepseek-chat', label: 'DeepSeek V3 (Cost-efficient)' },
      { value: 'meta-llama/llama-3.3-70b-instruct', label: 'LLaMA 3.3 70B (Powerful Open Source)' },
      { value: 'custom', label: 'Other model... (enter identifier manually)' },
    ];
  } else {
    // Requesty options
    optionsList = [
      { value: 'anthropic/claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
      { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'openai/gpt-4o', label: 'GPT-4o' },
      { value: 'custom', label: 'Other model... (enter identifier manually)' },
    ];
  }

  const modelChoice = await select({
    message: 'Select the model you want to use:',
    options: optionsList,
  });

  if (isCancel(modelChoice)) {
    cancel('Model selection cancelled.');
    return;
  }

  let finalModel = modelChoice;

  if (modelChoice === 'custom') {
    const customModel = await text({
      message: 'Enter model identifier (e.g. "openai/gpt-4o-mini"):',
      validate(value) {
        if (!value || value.trim().length === 0) return 'Model identifier cannot be empty.';
      },
    });

    if (isCancel(customModel)) {
      cancel('Model selection cancelled.');
      return;
    }
    finalModel = customModel.trim();
  }

  saveUserConfig({ model: finalModel });
  
  console.log(pc.green(`Model changed to: ${finalModel}`));
  console.log(pc.gray(`Settings updated in .emile/config.json\n`));
}
