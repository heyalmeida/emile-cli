/**
 * ui/index.js — public barrel of the ui/ module tree.
 *
 * The former src/ui.js monolith was decomposed into single-responsibility
 * modules (see docs/architecture.md). This barrel keeps the public import
 * surface stable: `import { ... } from './ui/index.js'`.
 */
export { C, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
export { sanitizeAssistantOutput } from './sanitize.js';
export { renderMarkdown } from './markdown.js';
export { formatToolSummary, printToolSummary, printSkillsDetected } from './tool-lines.js';
export { printHeader, printStartupScreen } from './header.js';
export { printConfigBox, printConfig } from './config-panel.js';
export { printSessionBar } from './status-bar.js';
export { printUserMessage } from './user-message.js';
export { printAssistantResponse } from './response.js';
export { startThinkingStream, appendThinkingStream, endThinkingStream, printThinking } from './thinking.js';
export { printHelp } from './help.js';
export { printDiffBlock } from './diff-block.js';
export { printConversationHistory } from './history-replay.js';
export { promptInput, isShiftEnterKey } from './prompt-input.js';
export { persistentPromptInput } from './prompt-input-persistent.js';
export { MODEL_PICKER_LIMIT, filterModelOptions, matchModelOptions, promptModelPicker, sanitizeModelPickerText } from './model-picker.js';
export { listenTurnKeys } from './turn-keys.js';
export { promptSwitchSession } from './switch-session.js';
export { stripTerminalControls } from './control.js';
export { printRulesInfo } from './rules-panel.js';
export { printSkillsInfo } from './skills-panel.js';
export {
  promptWebProviderCredential,
  printWebProviderStatus,
  printWebSearchStatus,
  printWebCommandWarning,
  printWebProviderConfigured,
} from './web-config.js';
export {
  MAX_TERMINAL_TITLE_LENGTH,
  sanitizeTitlePart,
  formatTerminalTitle,
  createTerminalTitleSequence,
  canWriteTerminalTitle,
  writeTerminalTitle,
  configureTerminalTitle,
  setTerminalActivity,
  getCurrentTerminalTitle,
  describeToolActivity,
} from './title.js';
