import { select, confirm, isCancel } from '@clack/prompts';
import { printMemoryRecords } from './memory-panel.js';
import { printMemoryNotice } from './memory-panel.js';

/**
 * Runs the interactive pending-confirmation modal.
 *
 * Behavior: collects decisions for every pending record first, then performs
 * a single atomic mutation. This guarantees that an Esc / Ctrl+C / crash
 * during the modal never leaves the store in a partial state.
 *
 * Decisions collected:
 *   - 'accept' → include in accept set
 *   - 'reject' → include in reject set
 *   - 'accept-all' → stop iterating, include every remaining record in accept set
 *   - cancel (Esc/Ctrl+C) → return without calling onAccept/onReject
 *
 * After the loop, the handler receives:
 *   - onAccept(ids)  called once with the array of accepted ids (atomic mutation)
 *   - onReject(ids)  called once with the array of rejected ids (atomic mutation)
 *
 * @param {Array} pending
 * @param {object} handlers — { onAccept(ids), onReject(ids) }
 * @returns {Promise<{action: 'accept-all' | 'completed' | 'dismissed', accepted: number, rejected: number}>}
 */
export async function runMemoryConfirmModal(pending, handlers) {
  if (!Array.isArray(pending) || pending.length === 0) {
    return { action: 'dismissed', accepted: 0, rejected: 0 };
  }
  const { onAccept, onReject } = handlers;
  const acceptIds = [];
  const rejectIds = [];
  let action = 'completed';

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
      return { action: 'dismissed', accepted: 0, rejected: 0 };
    }
    if (choice === 'accept-all') {
      const remaining = pending.length - index;
      const approved = await confirm({
        message: `Accept all ${remaining} remaining record(s)?`,
        active: 'Accept all',
        inactive: 'Cancel',
      });
      if (isCancel(approved) || !approved) continue;
      for (let j = index; j < pending.length; j += 1) acceptIds.push(pending[j].id);
      action = 'accept-all';
      break;
    }
    if (choice === 'accept') acceptIds.push(record.id);
    else if (choice === 'reject') rejectIds.push(record.id);
  }

  // Single atomic batch. If anything throws, the store stays at the same
  // revision because we have not yet committed.
  if (rejectIds.length > 0) {
    await onReject(rejectIds);
  }
  if (acceptIds.length > 0) {
    await onAccept(acceptIds);
  }
  return { action, accepted: acceptIds.length, rejected: rejectIds.length };
}
