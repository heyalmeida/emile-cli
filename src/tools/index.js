/**
 * tools/index.js — public barrel of the tools/ module tree.
 *
 * The former src/tools.js monolith was decomposed into single-responsibility
 * modules (see docs/architecture.md). This barrel keeps the public import
 * surface stable: `import { ... } from './tools/index.js'`.
 */
export { toolDefinitions } from './definitions.js';
export { toolHandlers } from './handlers/index.js';
export { fileCache, undoStack, pushUndo, UNDO_STACK_LIMIT, clearFileCache } from './file-state.js';
export { resolveSafePath, isSafeCommand } from './security.js';
export { showDiff } from './show-diff.js';
