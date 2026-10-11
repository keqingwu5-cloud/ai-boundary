/* Optional single-host durable adapter for testing/integration; not a cloud
   selection. Lock contention fails closed; stale locks need operator review. */
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export function fileStore(path, initial) {
  return { async transaction(fn) {
    await mkdir(dirname(path), { recursive:true, mode:0o700 });
    const lock = await open(path + '.lock', 'wx', 0o600);
    const tmp = path + '.' + randomUUID() + '.tmp';
    try {
      let db;
      try { db = JSON.parse(await readFile(path, 'utf8')); }
      catch(e) { if (e.code !== 'ENOENT') throw e; db = structuredClone(initial); }
      if (db?.formatVersion !== 1) throw new Error('UNSUPPORTED_LEDGER');
      const result = await fn(db);
      const file = await open(tmp, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(db)); await file.sync(); } finally { await file.close(); }
      await rename(tmp, path);
      const dir = await open(dirname(path), 'r');
      try { await dir.sync(); } finally { await dir.close(); }
      return result;
    } finally {
      await unlink(tmp).catch(() => {});
      await lock.close(); await unlink(path + '.lock');
    }
  }};
}
