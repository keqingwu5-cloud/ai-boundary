/* Isolated task primitive; caller chooses limits/units, credentials stay in run().
   Requires a dedicated transactional store, separate from the knowledge ledger. */
const fail = code => { throw new Error(code); };
export function createTaskRunner({ store, maxAttempts, timeoutMs, maxCalls, maxCost }) {
  if (!store?.transaction || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10 || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isSafeInteger(maxCalls) || maxCalls < 0 || !Number.isFinite(maxCost) || maxCost < 0) fail('LIMITS_REQUIRED');
  return async function execute({ id, costCeiling, run }) {
    if (typeof id !== 'string' || !id || !Number.isFinite(costCeiling) || costCeiling < 0 || typeof run !== 'function') fail('INVALID_TASK');
    const start = await store.transaction(db => {
      db.tasks ||= []; db.budget ||= { calls:0, cost:0 }; db.events ||= [];
      let task = db.tasks.find(x => x.id === id);
      if (task) return { execute:false, task:structuredClone(task) };
      task = { id, status:'queued', attempts:0 }; db.tasks.push(task);
      return { execute:true };
    });
    if (!start.execute) return start.task;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const reserved = await store.transaction(db => {
        const t = db.tasks.find(x => x.id === id);
        if (db.budget.calls >= maxCalls || db.budget.cost + costCeiling > maxCost) { t.status = 'budget_blocked'; return false; }
        // Conservative reservation is never refunded on timeout/unknown usage.
        db.budget.calls++; db.budget.cost += costCeiling;
        t.status = 'running'; t.attempts = attempt; t.startedAt = Date.now(); return true;
      });
      if (!reserved) break;
      const controller = new AbortController(); let timer, status;
      try {
        await Promise.race([
          Promise.resolve().then(() => run({ signal:controller.signal, attempt, idempotencyKey:id + ':' + attempt })),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, timeoutMs); })
        ]);
        status = 'succeeded';
      } catch(e) { status = controller.signal.aborted ? 'timed_out' : 'failed'; }
      finally { clearTimeout(timer); }
      await store.transaction(db => {
        const t = db.tasks.find(x => x.id === id); t.status = status; t.finishedAt = Date.now();
        db.events.push({ type:'task_' + status, at:Date.now(), attempt });
      });
      // Do not retry a timeout: an upstream request may still be consuming budget.
      if (status !== 'failed') break;
    }
    return store.transaction(db => structuredClone(db.tasks.find(x => x.id === id)));
  };
}
