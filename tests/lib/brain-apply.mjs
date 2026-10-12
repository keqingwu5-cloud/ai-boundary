/* supabase/schema.sql 的 brain_apply() 在 JS 裡的對照實作（給 sync-core 單元測試與 mock-supabase 用）。
   真正的語意以 SQL 為準，並由 tests/rls.test.mjs 在 PGlite 上驗證；兩邊規則必須一致：
     內容已一樣 → applied（冪等）；base = 目前版本 → applied（+1）；meta 字串陣列 → 聯集；其他 → conflict（存提案、不覆寫） */
const stable = v => v === null || typeof v !== 'object' ? JSON.stringify(v) ?? 'null'
  : Array.isArray(v) ? '[' + v.map(x => x === undefined ? 'null' : stable(x)).join(',') + ']'
  : '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
export function createVersionedStore(opts = {}){
  const own = [], proposals = [], revisions = [];
  const R = () => (opts.rows ? opts.rows() : own);           // mock-supabase 會把 db.brain_entities 整個換掉，所以每次重新取
  const find = (g, kind, id) => R().find(r => (r.graph_id || 'main') === g && r.kind === kind && r.id === id);
  function apply(graph, ops, actor = 'u'){
    const applied = [], conflicts = [];
    for (const op of ops){
      const del = !!op.deleted, data = del ? null : JSON.parse(stable(op.data)), base = typeof op.base === 'number' ? op.base : null;
      if (!['brain','node','link','concept','pattern','meta'].includes(op.kind) || !op.id || (!del && data == null)) throw Object.assign(new Error('invalid op'), { code:'22023' });
      const cur = find(graph, op.kind, op.id);
      if (cur && cur.version == null) cur.version = 1;
      let res = null;
      if (!cur){
        if (base === null){ R().push({ graph_id:graph, kind:op.kind, id:op.id, data, deleted:del, version:1, updated_by:actor }); revisions.push({ graph, kind:op.kind, id:op.id, version:1, before:null, after:data }); res = { kind:op.kind, id:op.id, version:1 }; }
      } else if (cur.deleted === del && stable(cur.data) === stable(data)) res = { kind:op.kind, id:op.id, version:cur.version };
      else if (base === cur.version || (op.kind === 'meta' && !del && !cur.deleted && Array.isArray(data) && Array.isArray(cur.data))){
        let next = data;
        if (op.kind === 'meta' && base !== cur.version) next = [...new Set([...cur.data, ...data].map(x => stable(x)))].sort().map(x => JSON.parse(x));
        revisions.push({ graph, kind:op.kind, id:op.id, version:cur.version + 1, before:cur.data, after:next });
        Object.assign(cur, { data:next, deleted:del, version:cur.version + 1, updated_by:actor });
        res = { kind:op.kind, id:op.id, version:cur.version };
      }
      if (res){
        if (typeof op.resolves === 'number'){ const p = proposals.find(x => x.id === op.resolves && x.graph_id === graph); if (p && p.status === 'conflict') p.status = 'accepted'; }
        applied.push(res);
      } else {
        const p = { id:proposals.length + 1, graph_id:graph, kind:op.kind, entity_id:op.id, base_version:base, current_version:cur ? cur.version : null, patch:data, deleted:del, status:'conflict', actor };
        proposals.push(p);
        conflicts.push({ kind:op.kind, id:op.id, base, current:cur ? cur.version : null, proposal_id:p.id, data:cur ? cur.data : null, deleted:cur ? cur.deleted : false });
      }
    }
    return { applied, conflicts };
  }
  function reject(graph, id){ const p = proposals.find(x => x.id === id && x.graph_id === graph); if (p && p.status === 'conflict'){ p.status = 'rejected'; return true; } return false; }
  return { get rows(){ return R(); }, proposals, revisions, apply, reject };
}
