import { select, password, text, isCancel, cancel } from '@clack/prompts';
import { C } from './ui.js';
import { saveUserConfig, config } from './config.js';
import { resetClient } from './api.js';

// Re-map the legacy `pc.*` calls to the Tokyo Night palette exported by ui.js,
// so wizard output matches the rest of the CLI (one solid color system).
const pc = {
  gray: C.muted,
  green: C.success,
  yellow: C.warn,
  red: C.red,
  cyan: C.info,
  magenta: C.purple,
  blue: C.accent,
  white: C.fg,
  bold: C.bold,
  dim: C.dim,
  reset: (s) => s,
};

// ──────────────────────────────────────────────────────────────
//  Provider catalogue
// ──────────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    value: 'opencode',
    label: 'OpenCode Zen  (https://opencode.ai)  — curated coding gateway',
    keyLabel: 'OpenCode Zen',
    defaultModel: 'anthropic/claude-sonnet-4-5',
    models: [
      { value: 'anthropic/claude-sonnet-4-5',  label: 'Claude Sonnet 4.5  (Recommended for Code)' },
      { value: 'anthropic/claude-opus-4-5',    label: 'Claude Opus 4.5  (Most powerful)' },
      { value: 'google/gemini-2.5-pro',        label: 'Gemini 2.5 Pro  (Giant context)' },
      { value: 'google/gemini-2.5-flash',      label: 'Gemini 2.5 Flash  (Fast & cheap)' },
      { value: 'openai/gpt-4.1',               label: 'GPT-4.1  (OpenAI latest)' },
      { value: 'openai/o3',                    label: 'o3  (OpenAI reasoning)' },
      { value: 'deepseek/deepseek-chat',       label: 'DeepSeek V3  (Cost-efficient)' },
      { value: 'custom', label: 'Other model... (enter identifier manually)' },
    ],
  },
  {
    value: 'opencode-go',
    label: 'OpenCode Go   (https://opencode.ai)  — open-source models subscription',
    keyLabel: 'OpenCode Go',
    defaultModel: 'deepseek-v4-pro',
    models: [
      { value: 'deepseek-v4-pro',    label: 'DeepSeek V4 Pro      (Recommended for Code)' },
      { value: 'deepseek-v4-flash',  label: 'DeepSeek V4 Flash     (Fast & cheap)' },
      { value: 'kimi-k2.7-code',     label: 'Kimi K2.7 Code        (Code specialist)' },
      { value: 'kimi-k3',            label: 'Kimi K3               (Latest Kimi)' },
      { value: 'qwen3.7-max',        label: 'Qwen 3.7 Max          (Alibaba flagship)' },
      { value: 'qwen3.7-plus',       label: 'Qwen 3.7 Plus         (Balanced)' },
      { value: 'grok-4.5',           label: 'Grok 4.5              (xAI)' },
      { value: 'minimax-m3',         label: 'MiniMax M3            (Long context)' },
      { value: 'mimo-v2-pro',        label: 'Mimo V2 Pro           (Reasoning)' },
      { value: 'glm-5.2',            label: 'GLM 5.2               (Zhipu AI)' },
      { value: 'custom', label: 'Other model... (enter identifier manually)' },
    ],
  },
  {
    value: 'openrouter',
    label: 'OpenRouter   (https://openrouter.ai)  — 300+ models unified API',
    keyLabel: 'OpenRouter',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    models: [
      { value: 'anthropic/claude-3.5-sonnet',           label: 'Claude 3.5 Sonnet  (Recommended for Code)' },
      { value: 'google/gemini-2.5-pro',                 label: 'Gemini 2.5 Pro  (Giant context)' },
      { value: 'google/gemini-2.5-flash',               label: 'Gemini 2.5 Flash  (Fast & cheap)' },
      { value: 'deepseek/deepseek-chat',                label: 'DeepSeek V3  (Cost-efficient)' },
      { value: 'meta-llama/llama-3.3-70b-instruct',     label: 'LLaMA 3.3 70B  (Open Source)' },
      { value: 'openrouter/free',                       label: 'Auto Free Router  (Best free model)' },
      { value: 'custom', label: 'Other model... (enter identifier manually)' },
    ],
  },
  {
    value: 'requesty',
    label: 'Requesty     (https://requesty.ai)  — caching & routing layer',
    keyLabel: 'Requesty',
    defaultModel: 'anthropic/claude-3-5-sonnet',
    models: [
      { value: 'anthropic/claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
      { value: 'google/gemini-2.5-pro',       label: 'Gemini 2.5 Pro' },
      { value: 'openai/gpt-4o',               label: 'GPT-4o' },
      { value: 'custom', label: 'Other model... (enter identifier manually)' },
    ],
  },
];

// ──────────────────────────────────────────────────────────────
//  /connect wizard
// ──────────────────────────────────────────────────────────────

/**
 * Runs the interactive configuration wizard to connect a provider.
 * @returns {Promise<boolean>} True if connection succeeded, false otherwise
 */
export async function runConnectWizard() {
  console.log('\n' + pc.gray('  Connection Setup'));

  const providerValue = await select({
    message: 'Select the API provider:',
    options: PROVIDERS.map(p => ({ value: p.value, label: p.label })),
  });

  if (isCancel(providerValue)) {
    cancel('Connection setup cancelled.');
    return false;
  }

  const providerDef = PROVIDERS.find(p => p.value === providerValue);

  const apiKey = await password({
    message: `Enter API Key for ${providerDef.keyLabel}:`,
    validate(value) {
      if (!value || value.trim().length === 0) return 'API Key cannot be empty.';
    },
  });

  if (isCancel(apiKey)) {
    cancel('Connection setup cancelled.');
    return false;
  }

  saveUserConfig({
    provider: providerValue,
    apiKey,
    model: providerDef.defaultModel,
  });

  // Force API client to re-initialize with new keys
  resetClient();

  console.log(pc.green(`\n  Connected to ${providerDef.keyLabel} successfully.`));
  console.log(pc.gray(`  Default model: ${providerDef.defaultModel}`));
  console.log(pc.gray(`  Settings saved to .emile/config.json\n`));
  return true;
}

// ──────────────────────────────────────────────────────────────
//  /model wizard
// ──────────────────────────────────────────────────────────────

/**
 * Runs the interactive model selection wizard.
 */
export async function runModelWizard() {
  console.log('\n' + pc.gray('  Model Selection'));
  console.log(pc.gray(`  Active provider: ${config.provider}`));

  const providerDef = PROVIDERS.find(p => p.value === config.provider);
  const optionsList  = providerDef
    ? providerDef.models
    : [{ value: 'custom', label: 'Enter model identifier manually' }];

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

  console.log(pc.green(`  Model changed to: ${finalModel}`));
  console.log(pc.gray(`  Settings updated in .emile/config.json\n`));
}
