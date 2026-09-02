import { C } from './theme.js';
import { stripTerminalControls } from './control.js';

export function printSkillsInfo(skills = []) {
  console.log();
  if (skills.length === 0) {
    console.log(C.muted('  No workspace skills found in .agent/skills/.'));
    console.log();
    return;
  }
  console.log(C.info(`  Available workspace skills (${skills.length})`));
  for (const skill of skills) {
    const keywords = skill.keywords.length ? ` · ${skill.keywords.join(', ')}` : '';
    console.log(C.fg(`  ${stripTerminalControls(skill.name)}${keywords}`));
    if (skill.description) console.log(C.muted(`    ${stripTerminalControls(skill.description)}`));
  }
  console.log();
}
