// index.js — parent enhanced-web capability surface.
export { hydrateEnhancedWebConfig, saveEnhancedWebConfig } from './config.js';
export { getEnhancedWebToolDefinitions } from './definitions.js';
export { createWebToolHandlers, webToolHandlers } from './handlers.js';
export { modelSupportsImages } from './model-capabilities.js';
export {
  MAX_WEB_QUERY_CHARS,
  MAX_WEB_RESULTS,
  MAX_WEB_IMAGES,
  MAX_WEB_MARKDOWN_CHARS,
  validatePublicWebUrl,
  isPublicIpAddress,
  normalizeHttpUrl,
  normalizeWebQuery,
  boundedRemoteText,
  formatWebProviderError,
} from './security.js';
