// definitions.js — OpenAI-format schemas for the built-in tools.

export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: 'Read the contents of a file in the workspace, with optional line range.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative or absolute path of the file to read.' },
          startLine: { type: 'integer', description: 'Optional 1-based start line number to read from.' },
          endLine: { type: 'integer', description: 'Optional 1-based end line number to read to.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'writeFile',
      description: 'Write (or overwrite) a file in the workspace with content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative or absolute path of the file to write.' },
          content: { type: 'string', description: 'The exact content to write.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'editFile',
      description: 'Replace a specific block of target text with replacement text in a file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative or absolute path of the file to edit.' },
          targetContent: { type: 'string', description: 'The exact code block to be replaced.' },
          replacementContent: { type: 'string', description: 'The replacement code block.' },
        },
        required: ['path', 'targetContent', 'replacementContent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listDir',
      description: 'List all files and folders in a workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative directory path to list (defaults to workspace root).' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'findFiles',
      description: 'Find files in the workspace matching a pattern or filename.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Substring or pattern to match in filenames (e.g. "ui", "config.js", "*.ts").' },
          dir: { type: 'string', description: 'Relative directory path to search in (defaults to workspace root).' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grepSearch',
      description: 'Search for a text string or regex pattern across files in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text substring or regex pattern to search for.' },
          dir: { type: 'string', description: 'Relative directory path to search in (defaults to workspace root).' },
          isRegex: { type: 'boolean', description: 'Set to true if query is a regular expression.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'runCommand',
      description: 'Run a shell command on the host machine within the workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The exact terminal command line to execute.' },
        },
        required: ['command'],
      },
    },
  },
];

// Tool handlers implementation
