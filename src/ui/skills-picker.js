// skills-picker.js — read-only, bounded discovery for /skills.
import { promptSearchPicker } from './model-picker.js';

export const SKILLS_PICKER_LIMIT = 10;

export function skillPickerOptions(skills = []) {
  return (Array.isArray(skills) ? skills : []).map(skill => ({
    value: skill.name,
    label: skill.description ? `${skill.name} — ${skill.description}` : skill.name,
  }));
}

/** Opens the /skills search surface and returns the selected skill metadata. */
export async function promptSkillsPicker(skills = []) {
  const options = skillPickerOptions(skills);
  const selectedName = await promptSearchPicker(options, {
    message: `Browse workspace skills (${options.length})`,
    limit: SKILLS_PICKER_LIMIT,
    emptyMessage: 'No matching skills.',
    itemLabel: 'skills',
  });
  return (Array.isArray(skills) ? skills : []).find(skill => skill.name === selectedName) || null;
}
