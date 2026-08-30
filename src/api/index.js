/**
 * api/index.js — public barrel of the api/ module tree.
 *
 * The former src/api.js moved to client.js; this barrel keeps the public
 * import surface stable: `import { ... } from './api/index.js'`.
 */
export { getClient, resetClient, createChatCompletion, getRetryDelayMs } from './client.js';
