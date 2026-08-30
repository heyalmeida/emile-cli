import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

import { config } from './config.js';

/**
 * Parses a SKILL.md file to extract frontmatter and content.
 * @param {string} filePath 
 * @returns {{ name: string, description: string, frontmatter: object, content: string } | null}
 */
export function parseSkillFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  
  try {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const matches = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    
    if (matches) {
      const yamlStr = matches[1];
      const markdownBody = matches[2];
      const frontmatter = yaml.load(yamlStr) || {};
      
      return {
        name: frontmatter.name || path.basename(path.dirname(filePath)),
        description: frontmatter.description || '',
        frontmatter,
        content: markdownBody.trim(),
      };
    } else {
      // No frontmatter, treat whole file as content
      const name = path.basename(path.dirname(filePath));
      return {
        name,
        description: '',
        frontmatter: {},
        content: rawContent.trim(),
      };
    }
  } catch (err) {
    console.warn(`[Warning] Failed to parse skill file at ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Scans the .agent/skills directory and loads available skills.
 * @returns {Array<{ name: string, description: string, content: string }>}
 */
export function loadAllSkills() {
  const skillsDir = path.join(config.workspaceDir, '.agent', 'skills');
  const loadedSkills = [];

  if (!fs.existsSync(skillsDir)) {
    return loadedSkills;
  }

  try {
    const items = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        const skillFilePath = path.join(skillsDir, item.name, 'SKILL.md');
        const parsed = parseSkillFile(skillFilePath);
        if (parsed) {
          loadedSkills.push(parsed);
        }
      }
    }
  } catch (err) {
    console.warn(`[Warning] Failed to scan skills directory: ${err.message}`);
  }

  return loadedSkills;
}

/**
 * Auto-detects relevant skills by looking at workspace package.json and project files
 * @returns {string[]} List of auto-detected skill names
 */
export function detectWorkspaceSkills() {
  const detected = [];
  const rootDir = config.workspaceDir;

  try {
    const packageJsonPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
      const pJson = JSON.parse(packageJsonContent);
      const deps = { ...(pJson.dependencies || {}), ...(pJson.devDependencies || {}) };

      if (deps['react']) detected.push('react-patterns');
      if (deps['next']) detected.push('nextjs-best-practices');
      if (deps['tailwindcss'] || deps['@tailwindcss/postcss']) detected.push('tailwind-patterns');
      if (deps['typescript']) detected.push('typescript-expert');
      if (deps['@prisma/client'] || deps['prisma']) {
        detected.push('prisma-expert');
        detected.push('database-design');
      }
      if (deps['express'] || deps['koa'] || deps['fastify'] || deps['nestjs']) {
        detected.push('nodejs-best-practices');
        detected.push('api-patterns');
      }
    }

    // File check detection
    const prismaSchemaPath = path.join(rootDir, 'prisma', 'schema.prisma');
    if (fs.existsSync(prismaSchemaPath) || fs.existsSync(path.join(rootDir, 'schema.prisma'))) {
      if (!detected.includes('prisma-expert')) detected.push('prisma-expert');
      if (!detected.includes('database-design')) detected.push('database-design');
    }

    const dockerfilePath = path.join(rootDir, 'Dockerfile');
    const dockerComposePath = path.join(rootDir, 'docker-compose.yml');
    if (fs.existsSync(dockerfilePath) || fs.existsSync(dockerComposePath)) {
      detected.push('docker-expert');
    }

    // Python project check
    if (fs.existsSync(path.join(rootDir, 'requirements.txt')) || fs.existsSync(path.join(rootDir, 'pyproject.toml')) || fs.existsSync(path.join(rootDir, 'Pipfile'))) {
      detected.push('python-patterns');
    }
  } catch (err) {
    // Ignore detection errors, fallback to default clean-code
  }

  // Always require clean-code
  if (!detected.includes('clean-code')) {
    detected.push('clean-code');
  }

  return detected;
}

function keywordTokens(value) {
  return new Set(
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 3)
  );
}

/**
 * Keeps auto-detected skills that are relevant to the current task. Explicit
 * skill lists remain authoritative so `-s react-patterns` always means that
 * skill is requested, regardless of prompt wording.
 */
export function filterSkillsByRelevance(requestedNames = [], prompt = '', {
  detectedSkills = detectWorkspaceSkills(),
  skillCatalog = loadAllSkills(),
} = {}) {
  const requested = Array.isArray(requestedNames) ? requestedNames : [];
  const autoMode = requested.length === 0 || requested.some(name => String(name).trim().toLowerCase() === 'all');
  if (!autoMode) return requested.map(name => String(name).trim()).filter(Boolean);

  const detected = detectedSkills;
  if (!String(prompt || '').trim()) return detected;

  const promptWords = keywordTokens(prompt);
  return detected.filter(name => {
    if (name === 'clean-code') return true;
    const skill = skillCatalog.find(item => item.name.toLowerCase() === name.toLowerCase());
    const metadata = skill ? `${skill.name} ${skill.description}` : name;
    return [...keywordTokens(metadata)].some(word => promptWords.has(word));
  });
}

/**
 * Filter and format skills for the system prompt.
 * @param {string[]} requestedNames 
 * @returns {string} Compiled skills instructions
 */
export function compileSkills(requestedNames = []) {
  const allSkills = loadAllSkills();
  let activeNames = requestedNames;

  if (!requestedNames || requestedNames.length === 0 || requestedNames.includes('all')) {
    const autoDetected = detectWorkspaceSkills();
    activeNames = autoDetected;
  }

  let selected = allSkills.filter(s => 
    activeNames.some(name => s.name.toLowerCase() === name.trim().toLowerCase())
  );

  if (selected.length === 0) {
    return '';
  }

  // IMPROVEMENTS.md §7.6: bound the skills block the same way rules are
  // bounded (12k cap in rules.js) — one huge skill file otherwise inflates
  // the cached system-prompt prefix on every request.
  const MAX_SKILL_CHARS = 8_000;
  const MAX_TOTAL_SKILLS_CHARS = 24_000;

  let instructions = '\n=== ACTIVE WORKSPACE SKILLS ===\n';
  let totalChars = 0;
  for (const skill of selected) {
    let content = skill.content;
    let truncated = false;
    if (content.length > MAX_SKILL_CHARS) {
      content = content.slice(0, MAX_SKILL_CHARS) + '\n[— skill truncated for context —]';
      truncated = true;
    }

    const block =
      `\n[SKILL: ${skill.name}]${truncated ? ' [truncated]' : ''}\n` +
      (skill.description ? `Description: ${skill.description}\n` : '') +
      `Instructions:\n${content}\n` +
      '-----------------------------------\n';

    if (totalChars + block.length > MAX_TOTAL_SKILLS_CHARS) {
      instructions += `\n[— remaining skills omitted: total skills context cap (${MAX_TOTAL_SKILLS_CHARS} chars) reached —]\n`;
      break;
    }
    totalChars += block.length;
    instructions += block;
  }

  return instructions;
}
