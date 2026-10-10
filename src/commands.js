import { select, password, text, confirm, isCancel, cancel } from '@clack/prompts';
import { C, printRulesInfo, promptModelPicker } from './ui/index.js';
import {
  saveUserConfig,
  config,
  getProviderSlots,
  removeProvider,
  getActiveProviderDef,
  isCustomProvider,
  isValidProviderURL,
} from './config.js';
import { resetClient } from './api/index.js';
import { loadRules, MAX_RULES_CHARS } from './rules.js';
import { getModelInfo, getProviderModelOptions, isDynamicCatalogActive, isKnownModel } from './models.js';

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
    defaultModel: 'claude-sonnet-4-5',
    models: [
      { value: 'claude-sonnet-4-5',  label: 'Claude Sonnet 4.5  (Recommended for Code)' },
      { value: 'claude-opus-4-5',    label: 'Claude Opus 4.5  (Most powerful)' },
      { value: 'gemini-3.1-pro',     label: 'Gemini 3.1 Pro  (Giant context)' },
      { value: 'gemini-3.7-flash',   label: 'Gemini 3.7 Flash  (Fast & cheap)' },
      { value: 'gpt-5.6-luna',       label: 'GPT 5.6 Luna  (OpenAI latest)' },
      { value: 'deepseek-v4-pro',    label: 'DeepSeek V4 Pro  (Cost-efficient)' },
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

/** Kebab-case slot id derived from a user-supplied provider name. */
function toProviderSlug(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const RESERVED_GATEWAY_IDS = ['requesty', 'openrouter', 'opencode', 'opencode-go'];

const CUSTOM_FORMAT_OPTIONS = [
  { value: 'anthropic-messages', label: 'Anthropic messages (/v1/messages)' },
  { value: 'chat-completions', label: 'Chat completions (/chat/completions)' },
  { value: 'responses', label: 'Responses (/responses)' },
];

// Effort-parameter dialects for custom Chat completions endpoints. Each value
// is the exact request-body key the endpoint expects (or the composition
// documented in specs/2026-10-09-provider-system § 3.1 rule 13).
const REASONING_STYLE_OPTIONS = [
  { value: '', label: 'Auto (model catalog gate — unchanged default)' },
  { value: 'none', label: 'None (send no effort parameter)' },
  { value: 'reasoning_effort', label: 'reasoning_effort (string, sent always)' },
  { value: 'reasoning', label: 'reasoning ({ effort } object)' },
  { value: 'thinking', label: 'thinking (Anthropic-native budget object)' },
  { value: 'enable_thinking', label: 'enable_thinking (boolean)' },
  { value: 'chat_template_kwargs', label: 'chat_template_kwargs ({ enable_thinking } — vLLM/Qwen)' },
  { value: 'effort', label: 'effort (top-level string)' },
  { value: 'reasoningEffort', label: 'reasoningEffort (camelCase string)' },
  { value: 'both', label: 'both (reasoning_effort + enable_thinking)' },
];

/**
 * Custom-endpoint flow: name, URL, optional key, API format, model id.
 * @returns {Promise<boolean>} True if saved, false if cancelled.
 */
async function runCustomEndpointSetup() {
  let name = await text({
    message: 'Name for this provider (e.g. LM Studio):',
    validate(value) {
      if (!value || value.trim().length === 0) return 'Name cannot be empty.';
    },
  });

  if (isCancel(name)) {
    cancel('Connection setup cancelled.');
    return false;
  }

  let slug = toProviderSlug(name);
  while (!slug || RESERVED_GATEWAY_IDS.includes(slug) || getProviderSlots().some(s => s.id === slug)) {
    name = await text({
      message: 'That name is taken or invalid — try another:',
      validate(value) {
        if (!value || value.trim().length === 0) return 'Name cannot be empty.';
      },
    });

    if (isCancel(name)) {
      cancel('Connection setup cancelled.');
      return false;
    }

    slug = toProviderSlug(name);
  }

  const url = await text({
    message: 'API base URL (https://… or http://localhost:…):',
    validate(value) {
      if (isValidProviderURL(String(value || '').trim())) return;
      return 'Use https:// for remote endpoints; plain http:// only for localhost or 127.0.0.1.';
    },
  });

  if (isCancel(url)) {
    cancel('Connection setup cancelled.');
    return false;
  }

  const key = await password({
    message: 'API key (leave empty for a local server that needs none):',
  });

  if (isCancel(key)) {
    cancel('Connection setup cancelled.');
    return false;
  }

  const format = await select({
    message: 'API format:',
    options: CUSTOM_FORMAT_OPTIONS,
  });

  if (isCancel(format)) {
    cancel('Connection setup cancelled.');
    return false;
  }

  // The effort knob only needs a dialect choice for Chat completions: the
  // other two formats fix their own reasoning parameter (Anthropic
  // `thinking`, Responses `reasoning.effort`).
  let reasoningStyle = '';
  if (format === 'chat-completions') {
    reasoningStyle = await select({
      message: 'Reasoning effort parameter (how this endpoint receives the effort knob):',
      options: REASONING_STYLE_OPTIONS,
      initialValue: '',
    });

    if (isCancel(reasoningStyle)) {
      cancel('Connection setup cancelled.');
      return false;
    }
  }

  const model = await text({
    message: 'Model id served by this endpoint (e.g. qwen2.5-coder):',
    validate(value) {
      if (!value || value.trim().length === 0) return 'Model id cannot be empty.';
    },
  });

  if (isCancel(model)) {
    cancel('Connection setup cancelled.');
    return false;
  }

  saveUserConfig({
    provider: slug,
    apiKey: String(key).trim(),
    baseURL: String(url).trim(),
    format,
    reasoningStyle,
    model: String(model).trim(),
    label: String(name).trim(),
  });

  resetClient();

  console.log(pc.green(`\n  Connected to ${String(name).trim()} (custom endpoint).`));
  console.log(pc.gray(`  Format: ${format}`));
  console.log(pc.gray(`  Endpoint: ${String(url).trim()}`));
  console.log(pc.gray(`  Default model: ${String(model).trim()}`));
  console.log(pc.gray(`  Settings saved to ~/.emile/config.json\n`));
  return true;
}

/**
 * Runs the interactive configuration wizard to connect a provider.
 * @returns {Promise<boolean>} True if connection succeeded, false otherwise
 */
export async function runConnectWizard() {
  console.log('\n' + pc.gray('  Connection Setup'));

  const providerValue = await select({
    message: 'Select the API provider:',
    options: [
      ...PROVIDERS.map(p => ({ value: p.value, label: p.label })),
      { value: '__custom__', label: 'Custom endpoint (any API URL)' },
    ],
  });

  if (isCancel(providerValue)) {
    cancel('Connection setup cancelled.');
    return false;
  }

  if (providerValue === '__custom__') {
    return runCustomEndpointSetup();
  }

  const providerDef = PROVIDERS.find(p => p.value === providerValue);

  // Credential manager: only offered when a slot already exists for this
  // gateway. A provider with no slot falls through to the plain key prompt.
  const slot = getProviderSlots().find(s => s.id === providerValue);
  if (slot) {
    const manage = await select({
      message: 'Choose:',
      options: [
        { value: 'keep', label: `Keep stored key (last 4: ${slot.keyTail})` },
        { value: 'update', label: 'Update stored key' },
        { value: 'remove', label: 'Remove stored credentials' },
      ],
    });

    if (isCancel(manage)) {
      cancel('Connection setup cancelled.');
      return false;
    }

    if (manage === 'keep') {
      console.log(pc.gray(`\n  Already connected to ${providerDef.keyLabel}.\n`));
      return true;
    }

    if (manage === 'remove') {
      await removeProvider(providerValue);
      console.log(pc.gray(`\n  Removed stored credentials for ${providerDef.keyLabel}.\n`));
      return true;
    }
  }

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

  // IMPROVEMENTS.md §4.2: a model chosen for the previous provider may not
  // exist on the new one — the next turn would fail with model-not-found.
  // When the live catalog is available, validate and offer to pick a new one.
  if (isDynamicCatalogActive() && !isKnownModel(config.defaultModel)) {
    console.log(pc.yellow(`\n  ⚠ Model "${config.defaultModel}" was not found in the live catalog for ${providerDef.keyLabel}.`));
    const pickOne = await confirm({
      message: 'Choose a model for the new provider now?',
      active: 'Yes, pick a model',
      inactive: 'No, keep it as-is',
    });
    if (pickOne && !isCancel(pickOne)) {
      await runModelWizard();
    }
  }

  console.log(pc.green(`\n  Connected to ${providerDef.keyLabel} successfully.`));
  console.log(pc.gray(`  Default model: ${providerDef.defaultModel}`));
  console.log(pc.gray(`  Settings saved to ~/.emile/config.json\n`));
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

  // Custom endpoints have no discoverable catalog — the model id is typed in.
  if (isCustomProvider(config.provider)) {
    const def = getActiveProviderDef();
    const customOptions = def.lastModel
      ? [
          { value: '__current__', label: `Current: ${def.lastModel}` },
          { value: 'custom', label: 'Other model... (enter identifier manually)' },
        ]
      : [{ value: 'custom', label: 'Enter model identifier manually' }];

    const customChoice = await promptModelPicker(customOptions, {
      message: 'Select the model you want to use:',
    });

    if (customChoice === null || isCancel(customChoice)) {
      cancel('Model selection cancelled.');
      return;
    }

    let customFinalModel = customChoice === '__current__' ? def.lastModel : customChoice;
    if (customChoice === 'custom') {
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
      customFinalModel = customModel.trim();
    }

    saveUserConfig({ model: customFinalModel });

    console.log(pc.green(`  Model changed to: ${customFinalModel}`));
    console.log(pc.gray(`  Settings updated in ~/.emile/config.json\n`));
    return;
  }

  const providerDef = PROVIDERS.find(p => p.value === config.provider);
  let optionsList = providerDef
    ? providerDef.models
    : [{ value: 'custom', label: 'Enter model identifier manually' }];

  // Prefer the provider's live model list (OpenRouter catalog or the OpenCode
  // `/models` endpoints). On failure the curated options above remain usable.
  const liveModels = await getProviderModelOptions({ provider: config.provider });
  if (liveModels.length > 0) {
    console.log(pc.gray(`  Loaded ${liveModels.length} models from the live catalog.`));
    optionsList = liveModels.map(({ id, info }) => ({
      value: id,
      label: formatCatalogModelLabel(id, info),
    }));
    optionsList.push({ value: 'custom', label: 'Other model... (enter identifier manually)' });
  } else if (['openrouter', 'opencode', 'opencode-go'].includes(config.provider)) {
    console.log(pc.yellow('  Live model list unavailable — showing curated options.'));
  }

  const modelChoice = await promptModelPicker(optionsList, {
    message: 'Select the model you want to use:',
  });

  if (modelChoice === null || isCancel(modelChoice)) {
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
  console.log(pc.gray(`  Settings updated in ~/.emile/config.json\n`));
}

/** Formats remote catalog data as a readable, bounded select label. */
export function formatCatalogModelLabel(model, info = getModelInfo(model)) {
  const id = String(model || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 80);
  const contextValue = Number(info?.context);
  const context = Number.isFinite(contextValue) && contextValue > 0
    ? contextValue >= 1_000_000
      ? `${Math.round(contextValue / 1_000_000)}M ctx`
      : `${Math.round(contextValue / 1000)}k ctx`
    : 'context n/a';
  const input = Number.isFinite(Number(info?.inputPrice)) ? Number(info.inputPrice).toFixed(2) : 'n/a';
  const output = Number.isFinite(Number(info?.outputPrice)) ? Number(info.outputPrice).toFixed(2) : 'n/a';
  return `${id}  (${context} · $${input}/$${output} per 1M)`;
}

// ──────────────────────────────────────────────────────────────
//  /rules command — inspect active project rules
// ──────────────────────────────────────────────────────────────

/**
 * Displays the active user-authored rules source without modifying it.
 */
export function runRulesCommand() {
  printRulesInfo(loadRules(), { maxChars: MAX_RULES_CHARS });
}
