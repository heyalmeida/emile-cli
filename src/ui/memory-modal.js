import { select, confirm, isCancel } from '@clack/prompts';
import { printMemoryRecords } from './memory-panel.js';
import { printMemoryNotice } from './memory-panel.js';

/**
 * Runs the interactive pending-confirmation modal.
 *
 * @param {Array} pending — array of pending memory records (already filtered)
 * @param {object} handlers — { onAccept, onReject, onAcceptAll }
 * @returns {Promise<{action: 'accept-all' | 'dismissed', count: number}>}
 */
export async function runMemoryConfirmModal(pending, handlers) {
  if (!Array.isArray(pending) || pending.length === 0) {
    return { action: 'dismissed', count: 0 };
  }
  const { onAccept, onReject, onAcceptAll } = handlers;
  let processed = 0;
  for (let index = 0; index < pending.length; index += 1) {
    const record = pending[index];
    printMemoryRecords([record], { title: `Pending memory ${index + 1} of ${pending.length}` });
    const choice = await select({
      message: `Decision for ${record.id}?`,
      options: [
        { value: 'accept', label: 'Aceitar' },
        { value: 'reject', label: 'Recusar' },
        { value: 'accept-all', label: 'Aceitar todas' },
      ],
    });
    if (isCancel(choice) || !choice) {
      printMemoryNotice('Modal canceled; pending records unchanged.', 'muted');
      return { action: 'dismissed', count: processed };
    }
    if (choice === 'accept-all') {
      const remaining = pending.length - index;
      const approved = await confirm({
        message: `Accept all ${remaining} remaining record(s)?`,
        active: 'Accept all',
        inactive: 'Cancel',
      });
      if (isCancel(approved) || !approved) continue;
      await onAcceptAll(pending.slice(index));
      return { action: 'accept-all', count: pending.length - index };
    }
    if (choice === 'accept') {
      await onAccept(record);
      processed += 1;
    } else if (choice === 'reject') {
      await onReject(record);
      processed += 1;
    }
  }
  return { action: 'dismissed', count: processed };
}
