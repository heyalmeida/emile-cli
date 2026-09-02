// web-config.js — masked enhanced-web setup and compact state rendering.
import { isCancel, password } from '@clack/prompts';
import { C, wrapText } from './theme.js';

const PROVIDER_LABELS = {
  tavily: 'Tavily',
  firecrawl: 'Firecrawl',
};

export async function promptWebProviderCredential(provider, { prompt = password } = {}) {
  const label = PROVIDER_LABELS[provider];
  if (!label) return { cancelled: true, value: '' };

  const value = await prompt({
    message: `Enter API Key for ${label}:`,
    validate(input) {
      if (!input || input.trim().length === 0) return 'API Key cannot be empty.';
    },
  });

  if (isCancel(value)) return { cancelled: true, value: '' };
  return { cancelled: false, value: String(value).trim() };
}

export function printWebProviderStatus(provider, config) {
  const label = PROVIDER_LABELS[provider] || provider;
  const enabled = config?.[`${provider}Enabled`] === true;
  const credentialed = Boolean(config?.[`${provider}ApiKey`]);
  const state = enabled ? C.success('Enabled') : C.dim('Disabled');
  const keyState = credentialed ? C.success('configured') : C.warn('missing');

  console.log();
  console.log(`  ${label}: ${state}`);
  console.log(C.muted(`  API key: ${keyState}`));
  console.log();
}

export function printWebSearchStatus(config) {
  const enabled = config?.webSearch === true;
  const mode = config?.webSearchMode === 'enhanced' ? 'enhanced' : 'native';
  const state = enabled ? C.success('Enabled') : C.dim('Disabled');

  console.log();
  console.log(`  Web search: ${state}`);
  console.log(C.muted(`  Mode: ${mode}`));
  if (mode === 'enhanced') {
    const tavily = config?.tavilyEnabled && config?.tavilyApiKey ? 'ready' : 'unavailable';
    const firecrawl = config?.firecrawlEnabled && config?.firecrawlApiKey ? 'ready' : 'unavailable';
    console.log(C.muted(`  Tavily: ${tavily} · Firecrawl: ${firecrawl}`));
  }
  if (enabled) {
    console.log(C.warn('  Web providers may add charges.'));
    console.log(C.warn('  External results are untrusted.'));
  }
  console.log();
}

export function printWebCommandWarning(message) {
  const width = Math.max((process.stdout.columns || 80) - 4, 20);
  console.log();
  for (const line of wrapText(String(message || ''), width)) {
    console.log(C.warn(`  ${line}`));
  }
  console.log();
}

export function printWebProviderConfigured(provider) {
  const label = PROVIDER_LABELS[provider] || provider;
  console.log(C.success(`\n  ${label} configured and enabled.\n`));
}
