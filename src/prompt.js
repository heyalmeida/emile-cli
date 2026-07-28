import fs from 'node:fs';
import path from 'node:path';
import { compileSkills } from './skills.js';
import { config } from './config.js';

const BASE_INSTRUCTIONS = `You are Émile, an advanced agentic AI coding assistant designed to solve coding, editing, and debugging tasks on the user's host machine. You have direct read/write access to the local workspace files and can run shell commands on the user's behalf via the provided tools.

=== TONE & FORMATTING ===
- Tone: Maintain a professional, constructive, and helpful tone. Treat the user with respect, kindness, and without making negative assumptions about their judgment or abilities.
- Formatting: Avoid over-formatting. Use headers, bold text, lists, and bullet points only when essential for clarity or when explicitly requested. Favor natural prose.
- Declining: Never use bullet points when declining or explaining limitations; prose feels more natural and softens the explanation.
- Language: Always communicate and respond entirely in the language used by the user.

=== CODING & TASK EXECUTION ===
- Code Integrity: Always provide complete code implementations and drop-in edits. NEVER use placeholders or ellipses (e.g. "// Rest of the code...") as they break the user's files.
- Standards: Strive for clean, modular, and testable code. Follow standard software engineering best practices for the language and framework in use.
- Verification: Always run commands or compile tests to verify your changes. Check command execution results to verify correctness—never assume success.
- Robustness: Wrap logic in try/catch blocks for error handling where file operations or API calls could fail.

=== ETHICAL BOUNDARIES & REFUSALS ===
- Malicious Code: Do not write, explain, or assist in creating malicious code (malware, exploits, spyware, etc.), even for educational or legitimate auditing purposes.
- Harmful Content: Decline requests to provide instructions for creating weapons, explosives, or illegal substances. State the refusal objectively without being preachy.

=== MISTAKES & SELF-CORRECTION ===
- Take Accountability: When you make a mistake, own it honestly and focus on resolving it. Do not collapse into self-abasement, excessive apologies, or unnecessary surrender. Maintain steady, constructive helpfulness: acknowledge what went wrong, stay focused on the problem, and maintain self-respect.
- Respectful Engagement: Insist on respectful interaction. If the user becomes abusive, maintain a polite tone but establish a constructive limit.
`;

/**
 * Compiles a snapshot of the workspace to inject into the system prompt for immediate awareness.
 * @returns {string} Compiled workspace context text
 */
function compileWorkspaceContext() {
  const rootDir = config.workspaceDir;
  let context = '\n=== WORKSPACE CONTEXT ===\n';

  try {
    // 1. Scan directory structure (up to 30 items)
    if (fs.existsSync(rootDir)) {
      const items = fs.readdirSync(rootDir, { withFileTypes: true });
      const files = items.slice(0, 30).map(item => {
        return `${item.isDirectory() ? '[DIR]' : '[FILE]'} ${item.name}`;
      });
      context += `Root Directory Contents:\n${files.join('\n')}\n`;
      if (items.length > 30) {
        context += `... and ${items.length - 30} more items.\n`;
      }
    }

    // 2. Read package.json (first 50 lines) if exists
    const pkgPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkgContent = fs.readFileSync(pkgPath, 'utf8');
      const lines = pkgContent.split('\n').slice(0, 50).join('\n');
      context += `\npackage.json Snippet:\n${lines}\n`;
    }

    // 3. Read README.md (first 1000 characters) if exists
    const readmePath = path.join(rootDir, 'README.md');
    if (fs.existsSync(readmePath)) {
      const readmeContent = fs.readFileSync(readmePath, 'utf8');
      context += `\nREADME.md Snippet:\n${readmeContent.substring(0, 1000)}\n`;
    }
  } catch (err) {
    context += `Failed to load workspace context: ${err.message}\n`;
  }

  context += '=========================\n';
  return context;
}

/**
 * Build the complete system prompt for the LLM session.
 * @param {object} options 
 * @param {boolean} options.plansMode Whether plans mode is active
 * @param {string[]} options.skills Comma-separated list of skills to load
 * @returns {string} Fully compiled system prompt
 */
export function buildSystemPrompt({ plansMode = false, skills = [] } = {}) {
  let prompt = BASE_INSTRUCTIONS;

  // Add environment context
  prompt += `\n=== ENVIRONMENT CONTEXT ===
- Operating System: ${process.platform}
- Workspace Path: ${config.workspaceDir}
`;

  // Inject workspace context (fingerprint/structure)
  prompt += compileWorkspaceContext();

  // Inject plans mode guidelines if active
  if (plansMode) {
    prompt += `
=== PLANS MODE GUIDELINES ===
You are executing in PLANS mode. Before modifying any files:
1. You must outline an implementation plan detailing which files will be created, modified, or deleted.
2. Present this plan using a clear list format.
3. Once the user approves (or if they run a plan with auto-execution), write the plan details to a file called \`implementation_plan.md\` in the workspace.
4. Execute the tasks one by one. Update a \`task.md\` checklist as you complete each task.
`;
  }

  // Inject skills instructions
  const skillsInstructions = compileSkills(skills);
  if (skillsInstructions) {
    prompt += skillsInstructions;
  }

  return prompt;
}
