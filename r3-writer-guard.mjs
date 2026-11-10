/**
 * R3 research candidate: cooperative Web Locks + compare-before-write.
 * Works only when every writer participates in the same lock protocol.
 * Legacy tabs that ignore the lock can STILL write over protected data.
 *
 * No localStorage fallback, no polling, no background I/O, no global authority.
 */
export async function lockedCompareWrite({
  storage, locks, key, expectedRaw, produce, afterWrite, lockName
} = {}) {
  if (!storage || typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function' || typeof key !== 'string' || !key ||
      !(expectedRaw === null || typeof expectedRaw === 'string') ||
      typeof produce !== 'function' ||
      (afterWrite !== undefined && typeof afterWrite !== 'function') ||
      typeof lockName !== 'string' || !lockName)
    return {ok:false,reason:'WRITER_CONTRACT_INVALID'};

  if (!locks || typeof locks.request !== 'function')
    return {ok:false,reason:'WEB_LOCKS_UNAVAILABLE'};

  try {
    return await locks.request(lockName, {mode:'exclusive',ifAvailable:true},
      async lock => {
        if (!lock) return {ok:false,reason:'WRITER_BUSY'};
        // The lock is acquired before any asynchronous preparation.
        if (storage.getItem(key) !== expectedRaw)
          return {ok:false,reason:'STALE_WRITER'};

        const next = await produce();
        if (typeof next !== 'string')
          return {ok:false,reason:'SERIALIZED_VALUE_INVALID'};

        // Recheck after await before the store. The lock prevents concurrent
        // compliant writers, but cannot guard against a legacy tab.
        if (storage.getItem(key) !== expectedRaw)
          return {ok:false,reason:'STALE_WRITER'};
        storage.setItem(key,next);
        if (storage.getItem(key) !== next)
          return {ok:false,reason:'WRITE_READBACK_MISMATCH'};

        let secondaryWarning = null;
        if (afterWrite) {
          try { await afterWrite(); }
          catch { secondaryWarning = 'SECONDARY_WRITE_FAILED'; }
        }
        return {ok:true,raw:next,secondaryWarning};
      });
  } catch {
    return {ok:false,reason:'WRITER_LOCK_OR_STORAGE_FAILED'};
  }
}
