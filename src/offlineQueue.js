const KEY = 'tally_offline_queue';

export function getQueue() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

function save(q) {
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function enqueue(op) {
  const q = getQueue();
  const id = `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  q.push({ id, ts: Date.now(), ...op });
  save(q);
  return id;
}

export function dequeue(opId) {
  save(getQueue().filter(op => op.id !== opId));
}

export function cancelByTempId(tempId) {
  save(getQueue().filter(op => op.tempId !== tempId));
}

export function updateQueuedPayload(tempId, updates) {
  save(getQueue().map(op =>
    op.type === 'add_expense' && op.tempId === tempId
      ? { ...op, payload: { ...op.payload, ...updates } }
      : op
  ));
}

export function makeTempId() {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function isTempId(id) {
  return typeof id === 'string' && id.startsWith('offline_');
}
