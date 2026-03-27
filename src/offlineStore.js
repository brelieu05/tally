const EXPENSES_KEY  = 'tally_expenses';
const CATS_KEY      = 'tally_categories';
const QUEUE_KEY     = 'tally_sync_queue';
const BD_PREFIX     = 'tally_bd_';

function r(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function w(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export const localCache = {
  getExpenses:    ()        => r(EXPENSES_KEY, []),
  setExpenses:    (v)       => w(EXPENSES_KEY, v),
  getCategories:  ()        => r(CATS_KEY, null),
  setCategories:  (v)       => w(CATS_KEY, v),
  getBreakdown:   (key)     => r(BD_PREFIX + key, null),
  setBreakdown:   (key, v)  => w(BD_PREFIX + key, v),
};

export const syncQueue = {
  getAll: ()    => r(QUEUE_KEY, []),
  push:   (op)  => {
    const q = syncQueue.getAll();
    q.push({ qid: `${Date.now()}_${Math.random().toString(36).slice(2)}`, ...op });
    w(QUEUE_KEY, q);
  },
  remove: (qid) => w(QUEUE_KEY, syncQueue.getAll().filter(o => o.qid !== qid)),
  clear:  ()    => w(QUEUE_KEY, []),
};

export function tempId() {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
