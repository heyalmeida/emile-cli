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
export const toolHandlers = {
  async readFile({ path: filePath, startLine, endLine }) {
    try {
      const targetPath = resolveSafePath(filePath);
      
      let content;
      if (fileCache.has(targetPath)) {
        content = fileCache.get(targetPath);
      } else {
        if (!fs.existsSync(targetPath)) {
          return `Error: File not found at "${filePath}"`;
        }
        const stat = fs.statSync(targetPath);
        if (!stat.isFile()) {
          return `Error: Path "${filePath}" is a directory, not a file.`;
        }
        content = fs.readFileSync(targetPath, 'utf8');
        fileCache.set(targetPath, content);
      }

      if (startLine || endLine) {
        const lines = content.split('\n');
        const start = Math.max(1, startLine || 1);
        const end = Math.min(lines.length, endLine || lines.length);
        const sliced = lines.slice(start - 1, end);
        const formatted = sliced.map((line, idx) => `${start + idx}: ${line}`).join('\n');
        return `[Lines ${start}-${end} of ${lines.length} in ${filePath}]\n${formatted}`;
      }

      // Free-model cap: limit to 300 lines to prevent context overflow
      const model = config.defaultModel || '';
      const isFree = model === 'openrouter/free' || model.endsWith(':free');
      if (isFree) {
        const lines = content.split('\n');
        if (lines.length > 300) {
          const capped = lines.slice(0, 300).join('\n');
          return `[${filePath} — showing first 300 of ${lines.length} lines (free model limit)]\n${capped}`;
        }
      }

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

      let updatedContent = null;

      // Level 1: Exact match
      if (oldContent.includes(targetContent)) {
        updatedContent = oldContent.replace(targetContent, replacementContent);
      } else {
        // Level 2: Line ending normalization (\r\n vs \n)
        const oldNorm = oldContent.replace(/\r\n/g, '\n');
        const targetNorm = targetContent.replace(/\r\n/g, '\n');
        if (oldNorm.includes(targetNorm)) {
          updatedContent = oldNorm.replace(targetNorm, replacementContent.replace(/\r\n/g, '\n'));
        } else {
          // Level 3: Line-by-line comparison ignoring trailing whitespace per line
          const oldLines = oldNorm.split('\n');
          const targetLines = targetNorm.split('\n');

          let startIdx = -1;
          for (let i = 0; i <= oldLines.length - targetLines.length; i++) {
            let match = true;
            for (let j = 0; j < targetLines.length; j++) {
              if (oldLines[i + j].trimEnd() !== targetLines[j].trimEnd()) {
                match = false;
                break;
              }
            }
            if (match) {
              startIdx = i;
              break;
            }
          }

          if (startIdx !== -1) {
            const before = oldLines.slice(0, startIdx);
            const after = oldLines.slice(startIdx + targetLines.length);
            const replLines = replacementContent.replace(/\r\n/g, '\n').split('\n');
            updatedContent = [...before, ...replLines, ...after].join('\n');
          }
        }
      }

      if (updatedContent === null) {
        return `Error: Could not find targetContent in "${filePath}". Ensure whitespace and target code block match target file.`;
      }

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

  async findFiles({ pattern, dir = '.' }) {
    try {
      const startPath = resolveSafePath(dir);
      if (!fs.existsSync(startPath)) return `Error: Directory "${dir}" not found.`;

      const results = [];
      const ignore = ['node_modules', '.git', '.emile', 'dist', 'build', '.next', 'coverage'];
      const cleanPattern = pattern.toLowerCase().replace(/\*/g, '');

      function searchDir(currentDir, depth = 0) {
        if (depth > 5 || results.length >= 50) return;
        try {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            if (ignore.includes(entry.name)) continue;
            const fullPath = path.join(currentDir, entry.name);
            const relPath = path.relative(config.workspaceDir, fullPath);

            if (entry.name.toLowerCase().includes(cleanPattern) || relPath.toLowerCase().includes(cleanPattern)) {
              results.push(`${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${relPath}`);
            }

            if (entry.isDirectory()) {
              searchDir(fullPath, depth + 1);
            }
          }
        } catch { /* ignore */ }
      }

      searchDir(startPath);

      if (results.length === 0) {
        return `No files or directories matching "${pattern}" were found.`;
      }

      return `Found ${results.length} item(s) matching "${pattern}":\n${results.join('\n')}`;
    } catch (err) {
      return `Error finding files: ${err.message}`;
    }
  },

  async grepSearch({ query, dir = '.', isRegex = false }) {
    try {
      const startPath = resolveSafePath(dir);
      if (!fs.existsSync(startPath)) return `Error: Directory "${dir}" not found.`;

      const matches = [];
      const ignore = ['node_modules', '.git', '.emile', 'dist', 'build', '.next', 'package-lock.json'];
      let regExp;
      try {
        regExp = isRegex ? new RegExp(query, 'g') : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      } catch (err) {
        return `Error: Invalid regex pattern: ${err.message}`;
      }

      function searchInDir(currentDir, depth = 0) {
        if (depth > 5 || matches.length >= 50) return;
        try {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            if (ignore.includes(entry.name)) continue;
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
              searchInDir(fullPath, depth + 1);
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
                continue;
              }

              try {
                const content = fs.readFileSync(fullPath, 'utf8');
                const lines = content.split('\n');
                const relPath = path.relative(config.workspaceDir, fullPath);

                for (let i = 0; i < lines.length; i++) {
                  if (matches.length >= 50) break;
                  regExp.lastIndex = 0;
                  if (regExp.test(lines[i])) {
                    matches.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
                  }
                }
              } catch { /* skip */ }
            }
          }
        } catch { /* ignore */ }
      }

      searchInDir(startPath);

      if (matches.length === 0) {
        return `No matches found for "${query}".`;
      }

      return `Found ${matches.length} match(es) for "${query}":\n${matches.join('\n')}`;
    } catch (err) {
      return `Error in grepSearch: ${err.message}`;
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
