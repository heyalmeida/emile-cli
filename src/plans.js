import fs from 'node:fs';
import path from 'node:path';
import { confirm, isCancel } from '@clack/prompts';
import { config } from './config.js';
import { C } from './ui/theme.js';
import { stripTerminalControls } from './ui/control.js';

/**
 * Checks if a plan already exists in the workspace.
 * @returns {boolean}
 */
export function hasExistingPlan() {
  const planPath = path.join(config.workspaceDir, 'implementation_plan.md');
  return fs.existsSync(planPath);
}

/**
 * Reads the current task checklist from task.md if it exists.
 * @returns {string}
 */
export function getTaskChecklist() {
  const taskPath = path.join(config.workspaceDir, 'task.md');
  if (fs.existsSync(taskPath)) {
    try {
      return fs.readFileSync(taskPath, 'utf8');
    } catch (err) {
      return '';
    }
  }
  return '';
}

/**
 * Prompt the user to approve the proposed plan.
 * @returns {Promise<boolean>} True if approved, false otherwise
 */
export async function promptPlanApproval({ preview = '' } = {}) {
  const cleanPreview = stripTerminalControls(String(preview))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const message = cleanPreview
    ? `Approve a plan for: "${cleanPreview}"?`
    : 'Approve the agent to create and execute a plan for this task?';
  const approved = await confirm({
    message,
    active: 'Yes, execute plan.',
    inactive: 'No, cancel/modify.',
  });

  if (isCancel(approved) || !approved) {
    return false;
  }

  return true;
}

/**
 * Renders plan progress status on the terminal.
 */
export function renderPlanStatus() {
  const checklist = getTaskChecklist();
  if (!checklist) return;

  const lines = checklist.split('\n');
  const total = lines.filter(l => l.includes('[ ]') || l.includes('[x]') || l.includes('[/]')).length;
  const completed = lines.filter(l => l.includes('[x]')).length;
  
  if (total > 0) {
    console.log(C.muted(`   Plan Progress: ${completed}/${total} tasks completed`));
  }
}
