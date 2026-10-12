/* Server-only boundary. Never import into app.js. authenticate is supplied by
   the trusted server, not by the caller/body. No default identity or provider. */
import { createHash, randomUUID } from 'node:crypto';
import { validateGraph } from '../reliability/storage.mjs';
const clone = x => structuredClone(x);
const stable = x => x === null || typeof x !== 'object' ? JSON.stringify(x) : Array.isArray(x) ? '[' + x.map(stable).join(',') + ']' : '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}';
export const versionOf = x => x == null ? null : createHash('sha256').update(stable(x)).digest('hex');
const fail = code => { const e = new Error(code); e.code = code; throw e; };
const id = x => typeof x === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(x);
export function initialLedger(graph) {
  validateGraph(graph);
  return { formatVersion:1, graph:clone(graph), proposals:[], revisions:[], operations:[], events:[] };
}
function validateProposal(p) {
  if (!p || !id(p.operationId) || !id(p.taskId) || !id(p.nodeId) || !['add', 'update'].includes(p.action)) fail('INVALID_PROPOSAL');
  if (!['fact', 'hypothesis', 'inference', 'counter_evidence', 'unverified'].includes(p.classification)) fail('INVALID_CLASSIFICATION');
  if (!Array.isArray(p.sources) || !p.sources.length || p.sources.some(x => typeof x !== 'string' || !x.trim())) fail('SOURCE_REQUIRED');
  if (!p.baseVersions || typeof p.baseVersions !== 'object' || Array.isArray(p.baseVersions)) fail('BASE_VERSIONS_REQUIRED');
  if (!Object.hasOwn(p.baseVersions, p.nodeId)) fail('TARGET_VERSION_REQUIRED');
  if (Object.values(p.baseVersions).some(x => x !== null && (typeof x !== 'string' || !/^[a-f0-9]{64}$/.test(x)))) fail('INVALID_VERSION');
  if (!p.node || p.node.id !== p.nodeId || typeof p.node.title !== 'string') fail('INVALID_NODE');
  if (p.action === 'add' && p.baseVersions[p.nodeId] !== null) fail('ADD_REQUIRES_ABSENT_TARGET');
  if (p.action === 'update' && p.baseVersions[p.nodeId] === null) fail('UPDATE_REQUIRES_VERSION');
  if (p.node.parentId != null && !Object.hasOwn(p.baseVersions, p.node.parentId)) fail('PARENT_VERSION_REQUIRED');
}
function conflicts(db, p) {
  return Object.entries(p.baseVersions).filter(([key, v]) => versionOf(db.graph.nodes.find(n => n.id === key)) !== v).map(([key]) => key);
}
export function createKnowledgeService({ store, authenticate, graphId }) {
  if (!store?.transaction || typeof authenticate !== 'function' || !id(graphId)) throw new Error('SERVER_CONFIGURATION_REQUIRED');
  return async function handle(request) {
    try {
      const actor = await authenticate(request);
      if (!actor || !id(actor.id)) fail('UNAUTHENTICATED');
      const b = request.body;
      const permission = b?.type === 'submit' ? 'propose' : b?.type === 'review' ? 'review' : b?.type === 'read' ? 'read' : null;
      if (!permission) fail('INVALID_OPERATION');
      if (!actor.graphIds?.includes(graphId) || !actor.permissions?.includes(permission)) fail('FORBIDDEN');
      // BOT principals can only submit proposals, even if misconfigured with review permission.
      if (permission === 'review' && actor.kind !== 'human') fail('FORBIDDEN');
      return await store.transaction(db => {
        if (b.type === 'read') return { status:200, body:clone(db) };
        const now = new Date().toISOString();
        if (b.type === 'submit') {
          validateProposal(b.proposal);
          const p = clone(b.proposal), digest = versionOf(p);
          const previous = db.operations.find(x => x.actorId === actor.id && (x.operationId === p.operationId || x.taskId === p.taskId));
          if (previous) {
            if (previous.digest !== digest) fail('IDEMPOTENCY_CONFLICT');
            return { status:200, body:clone(db.proposals.find(x => x.id === previous.proposalId)) };
          }
          const proposal = { ...p, id:randomUUID(), createdBy:actor.id, createdAt:now, status:'pending', reviews:[] };
          proposal.conflicts = conflicts(db, p);
          if (proposal.conflicts.length) proposal.status = 'conflict';
          db.proposals.push(proposal);
          db.operations.push({ actorId:actor.id, operationId:p.operationId, taskId:p.taskId, digest, proposalId:proposal.id });
          db.events.push({ at:now, type:'proposal_submitted', id:proposal.id });
          return { status:201, body:clone(proposal) };
        }
        if (!id(b.operationId) || !['accept', 'reject', 'hold'].includes(b.decision)) fail('INVALID_REVIEW');
        const digest = versionOf(b);
        const prior = db.operations.find(x => x.actorId === actor.id && x.operationId === b.operationId);
        if (prior) {
          if (prior.digest !== digest) fail('IDEMPOTENCY_CONFLICT');
          return { status:prior.status || 200, body:clone(db.proposals.find(x => x.id === prior.proposalId)) };
        }
        const p = db.proposals.find(x => x.id === b.proposalId);
        if (!p) fail('NOT_FOUND');
        if (['accepted', 'rejected'].includes(p.status)) fail('FINALIZED');
        if (b.decision === 'accept') {
          p.conflicts = conflicts(db, p);
          if (p.conflicts.length) {
            p.status = 'conflict';
            p.reviews.push({ by:actor.id, at:now, decision:'conflict', operationId:b.operationId });
            db.events.push({ at:now, type:'version_conflict', id:p.id });
            db.operations.push({ actorId:actor.id, operationId:b.operationId, digest, proposalId:p.id, status:409 });
            return { status:409, body:clone(p) };
          }
          const index = db.graph.nodes.findIndex(n => n.id === p.nodeId);
          if ((p.action === 'add') !== (index === -1)) fail('VERSION_CONFLICT');
          const before = index < 0 ? null : clone(db.graph.nodes[index]);
          const next = { ...(before || {}), ...clone(p.node) };
          if (before) { for (const key of ["createdBy", "createdAt"]) { if (Object.hasOwn(before, key)) next[key] = before[key]; else delete next[key]; } }
          else { next.createdBy = p.createdBy; next.createdAt = Date.parse(p.createdAt); }
          const candidate = clone(db.graph);
          if (index < 0) candidate.nodes.push(next); else candidate.nodes[index] = next;
          validateGraph(candidate);
          db.graph = candidate;
          db.revisions.push({ id:randomUUID(), nodeId:p.nodeId, before, after:clone(next), beforeVersion:versionOf(before), afterVersion:versionOf(next), sources:clone(p.sources), baseVersions:clone(p.baseVersions), classification:p.classification, createdBy:p.createdBy, createdAt:p.createdAt, acceptedBy:actor.id, acceptedAt:now, proposalId:p.id });
          p.status = 'accepted';
        } else p.status = b.decision === 'reject' ? 'rejected' : 'held';
        p.reviews.push({ by:actor.id, at:now, decision:b.decision, operationId:b.operationId });
        db.operations.push({ actorId:actor.id, operationId:b.operationId, digest, proposalId:p.id });
        db.events.push({ at:now, type:'proposal_' + p.status, id:p.id });
        return { status:200, body:clone(p) };
      });
    } catch (e) {
      // Never echo request bodies, auth headers, source text, or exception details.
      const known = new Set(['UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','IDEMPOTENCY_CONFLICT','FINALIZED','VERSION_CONFLICT','INVALID_REVIEW','INVALID_OPERATION','INVALID_PROPOSAL','INVALID_CLASSIFICATION','SOURCE_REQUIRED','BASE_VERSIONS_REQUIRED','TARGET_VERSION_REQUIRED','INVALID_VERSION','INVALID_NODE','ADD_REQUIRES_ABSENT_TARGET','UPDATE_REQUIRES_VERSION','PARENT_VERSION_REQUIRED']);
      const code = known.has(e.code) ? e.code : 'INTERNAL_ERROR';
      const status = code === 'UNAUTHENTICATED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : ['IDEMPOTENCY_CONFLICT','FINALIZED','VERSION_CONFLICT'].includes(code) ? 409 : code === 'INTERNAL_ERROR' ? 503 : 400;
      return { status, body:{ error:code } };
    }
  };
}
