import { stripTerminalControls } from './control.js';
import { C, boxBottomOpen, boxTopOpen, wrapText } from './theme.js';

function width() { return Math.max(20, Math.min((process.stdout.columns || 80) - 4, 76)); }
function clean(value) { return stripTerminalControls(String(value ?? '')).replace(/\s+/g, ' ').trim(); }

function line(label, value, tone = 'muted') {
  console.log(`    ${C.dim(`${label}:`)} ${C[tone](clean(value))}`);
}

export function printMemoryStatus(status) {
  const boxW = width();
  console.log();
  process.stdout.write(`${boxTopOpen('Global memory', boxW)}\n`);
  line('Mode', status.state.mode, status.state.mode === 'off' ? 'warn' : 'success');
  line('Session', status.paused ? 'paused' : 'active', status.paused ? 'warn' : 'muted');
  line('Records', `${status.active} active · ${status.pending} pending/conflicts`);
  line('Health', status.health, status.health === 'healthy' ? 'success' : 'warn');
  line('Revision', status.state.revision);
  process.stdout.write(`${boxBottomOpen(boxW)}\n\n`);
}

export function printMemoryRecords(records, { title = 'Global memory' } = {}) {
  const boxW = width();
  console.log();
  process.stdout.write(`${boxTopOpen(title, boxW)}\n`);
  if (!records?.length) {
    console.log(C.muted('    No matching memories.'));
  } else {
    for (const record of records.slice(0, 50)) {
      const prefix = `${record.id} · ${record.state}/${record.type}/${record.activation}`;
      console.log(C.info(`    ${clean(prefix)}`));
      for (const part of wrapText(clean(record.text), Math.max(boxW - 6, 12))) {
        console.log(C.muted(`    ${part}`));
      }
    }
    if (records.length > 50) console.log(C.warn(`    ${records.length - 50} more omitted.`));
  }
  process.stdout.write(`${boxBottomOpen(boxW)}\n\n`);
}

export function printMemoryDoctor(report) {
  printMemoryStatus({
    ...report,
    active: report.state.records.filter(record => record.state === 'active').length,
    pending: report.state.records.filter(record => record.state !== 'active').length,
    paused: report.paused === true,
  });
  const failures = Object.entries(report.artifacts || {}).filter(([, item]) => item.symlink || (!item.regular && !item.directory && item.exists));
  if (report.errors?.length || failures.length) {
    console.log(C.warn(`  Doctor found ${report.errors.length + failures.length} storage issue(s); no memory content was printed.\n`));
  } else {
    console.log(C.success('  Doctor found no structural storage errors.\n'));
  }
}

export function printMemoryNotice(message, tone = 'muted') {
  console.log();
  for (const part of wrapText(clean(message), Math.max(width() - 2, 18))) console.log(C[tone](`  ${part}`));
  console.log();
}
