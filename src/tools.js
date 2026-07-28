import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { diffLines } from 'diff';
import { confirm, isCancel } from '@clack/prompts';
import { config } from './config.js';
import { printDiffBlock } from './ui.js';

// File read cache to prevent redundant I/O and token overhead
const fileCache = new Map();

// Rollback stack for the /undo command
export const undoStack = [];

// Exported helper to clear the read cache between agent execution turns
export function clearFileCache() {
  fileCache.clear();
}

// Whitelist of safe commands that do not trigger safe-mode confirmation prompts
const SAFE_COMMANDS_WHITELIST = [
  'git status',
  'git diff',
  'git log',
  'git show',
  'npm test',
  'npm run test',
  'ls',
  'dir',
  'pwd'
];

// Checks if a command belongs to the safe commands whitelist
function isSafeCommand(command) {
  const cleanCmd = command.trim().toLowerCase();
  return SAFE_COMMANDS_WHITELIST.some(safeCmd => 
    cleanCmd === safeCmd || cleanCmd.startsWith(safeCmd + ' ')
  );
}

// Helper to resolve and validate paths inside the workspace, protecting against path traversal
function resolveSafePath(userPath) {
  const resolved = path.resolve(config.workspaceDir, userPath);
  const relative = path.relative(config.workspaceDir, resolved);
  const isOutside = relative.startsWith('..') || path.isAbsolute(relative);
  
  if (isOutside && resolved !== config.workspaceDir) {
    throw new Error(`Access denied: path "${userPath}" resolves outside of workspace "${config.workspaceDir}"`);
  }
  return resolved;
}

// Generate and display diff using centralized UI
function showDiff(filePath, oldContent, newContent) {
  const oldText = oldContent === null ? '' : oldContent;
  const changes = diffLines(oldText, newContent);
  printDiffBlock(filePath, changes);
}

// Map of tool definitions in OpenAI format
export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: 'Read the contents of a file in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative or absolute path of the file to read.' },
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
export const toolHandlers = {
  async readFile({ path: filePath }) {
    try {
      const targetPath = resolveSafePath(filePath);
      
      // Return cached content if available
      if (fileCache.has(targetPath)) {
        return fileCache.get(targetPath);
      }

      if (!fs.existsSync(targetPath)) {
        return `Error: File not found at "${filePath}"`;
      }
      const stat = fs.statSync(targetPath);
      if (!stat.isFile()) {
        return `Error: Path "${filePath}" is a directory, not a file.`;
      }
      const content = fs.readFileSync(targetPath, 'utf8');
      
      // Store in read cache
      fileCache.set(targetPath, content);
      
      return content;
    } catch (err) {
      return `Error reading file: ${err.message}`;
    }
  },

  async writeFile({ path: filePath, content }) {
    try {
      const targetPath = resolveSafePath(filePath);
      const parentDir = path.dirname(targetPath);
      
      const oldContent = fs.existsSync(targetPath) 
        ? fs.readFileSync(targetPath, 'utf8') 
        : null;

      // Invalidate file cache
      fileCache.delete(targetPath);

      // Save previous state to undo stack (if not in dry-run mode)
      if (!config.dryRun) {
        undoStack.push({ path: targetPath, content: oldContent });
      }

      // Handle Dry-Run simulation
      if (config.dryRun) {
        showDiff(filePath, oldContent, content);
        return `Successfully simulated writing to "${filePath}" (DRY RUN - file not modified on disk)`;
      }

      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(targetPath, content, 'utf8');

      // Update cache with new content
      fileCache.set(targetPath, content);

      // Generate and display diff
      showDiff(filePath, oldContent, content);

      return `Successfully wrote file to "${filePath}"`;
    } catch (err) {
      return `Error writing file: ${err.message}`;
    }
  },

  async editFile({ path: filePath, targetContent, replacementContent }) {
    try {
      const targetPath = resolveSafePath(filePath);
      if (!fs.existsSync(targetPath)) {
        return `Error: File not found at "${filePath}"`;
      }
      const oldContent = fs.readFileSync(targetPath, 'utf8');
      if (!oldContent.includes(targetContent)) {
        return `Error: Could not find the exact targetContent in "${filePath}". Ensure whitespace and newlines match exactly.`;
      }
      
      const updatedContent = oldContent.replace(targetContent, replacementContent);

      // Invalidate file cache
      fileCache.delete(targetPath);

      // Save previous state to undo stack (if not in dry-run mode)
      if (!config.dryRun) {
        undoStack.push({ path: targetPath, content: oldContent });
      }

      // Handle Dry-Run simulation
      if (config.dryRun) {
        showDiff(filePath, oldContent, updatedContent);
        return `Successfully simulated editing "${filePath}" (DRY RUN - file not modified on disk)`;
      }

      fs.writeFileSync(targetPath, updatedContent, 'utf8');

      // Update cache with new content
      fileCache.set(targetPath, updatedContent);

      // Generate and display diff
      showDiff(filePath, oldContent, updatedContent);

      return `Successfully updated "${filePath}"`;
    } catch (err) {
      return `Error editing file: ${err.message}`;
    }
  },

  async listDir({ path: dirPath = '.' } = {}) {
    try {
      const targetPath = resolveSafePath(dirPath);
      if (!fs.existsSync(targetPath)) {
        return `Error: Directory not found at "${dirPath}"`;
      }
      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) {
        return `Error: Path "${dirPath}" is a file, not a directory.`;
      }
      const entries = fs.readdirSync(targetPath, { withFileTypes: true });
      const files = entries
        .map(entry => `${entry.isDirectory() ? '[DIR] ' : '[FILE]'} ${entry.name}`)
        .join('\n');
      return files || '(empty directory)';
    } catch (err) {
      return `Error listing directory: ${err.message}`;
    }
  },

  async runCommand({ command }) {
    // Handle Dry-Run simulation
    if (config.dryRun) {
      console.log(`\n  [DRY RUN] Would execute command: "${command}"`);
      return `(command execution simulated in dry-run mode: "${command}")`;
    }

    // Safety Gate Confirmation
    if (config.safeMode && !isSafeCommand(command)) {
      console.log();
      const approved = await confirm({
        message: `Allow execution of command: "${command}"?`,
        active: 'Yes, execute command',
        inactive: 'No, block command',
      });

      if (isCancel(approved) || !approved) {
        return `Error: Command execution blocked by user.`;
      }
    }

    return new Promise((resolve) => {
      const timeout = config.commandTimeout || 30000;
      
      exec(command, { cwd: config.workspaceDir, timeout }, (error, stdout, stderr) => {
        let output = '';
        if (stdout) output += stdout;
        if (stderr) output += `[stderr]\n${stderr}`;
        if (error) {
          if (error.killed) {
            output += `\n[Command terminated because it exceeded the timeout limit of ${timeout}ms]`;
          } else {
            output += `\n[Command failed with code ${error.code}]\n${error.message}`;
          }
        }
        resolve(output.trim() || '(command returned no output)');
      });
    });
  },
};
