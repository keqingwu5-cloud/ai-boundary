/* N-ary reusable composition preview. ISOLATED / IN-MEMORY / NO AUTHORITY.
 * General-purpose: not specific to Memory, World Model, World-as-Chess or GPT.
 * `collect` combines references, NEVER asserts a true synthetic fact.
 * `sequence`, `compare`, `derive` preserve caller-declared ordering/semantics.
 * `sum_integers` is a truly executable, safe-integer-only arithmetic reducer.
 * No storage, network, production writes, or external ACK implementation.
 */
export const COMPOSITION_SCHEMA = 'firstbrain.nary-composition.preview.v1';
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const OPERATORS = new Set(['collect','sequence','compare','derive','sum_integers']);
const isPlain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const isId = x => typeof x === 'string' && ID.test(x);
const err = (reason) => Object.assign(new Error(reason), { code: reason });
const copy = x => JSON.parse(JSON.stringify(x));

/* Canonical, bounded and deterministic JSON: no undefined, dates, cycles, NaN. */
export function stableJson(value, depth=0, visiting=new WeakSet()) {
  if(depth > 20) throw err('DEPTH_LIMIT');
  if(value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if(typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if(Array.isArray(value)) {
    if(visiting.has(value)) throw err('CYCLIC_INPUT');
    visiting.add(value);
    const parts = value.map(x => stableJson(x, depth+1, visiting));
    visiting.delete(value); return '['+parts.join(',')+']';
  }
  if(isPlain(value)) {
    if(visiting.has(value)) throw err('CYCLIC_INPUT');
    visiting.add(value);
    const keys = Object.keys(value).sort();
    const out = keys.map(k => JSON.stringify(k)+':'+stableJson(value[k],depth+1,visiting));
    visiting.delete(value); return '{'+out.join(',')+'}';
  }
  throw err('UNSUPPORTED_VALUE');
}
export async function sha256(data) {
  if(typeof data !== 'string') throw err('HASH_INPUT_INVALID');
  const raw = new TextEncoder().encode(data);
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',raw));
  return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
}
const ok = packet => ({status:'candidate_only', decision:'HOLD', packet});
const blocked = reason => ({status:'blocked',decision:'HOLD', reason,packet:null});
const validReqs = rs => Array.isArray(rs) && rs.length <= 32 && rs.every(isId) && new Set(rs).size === rs.length;

export function createCompositionEngine({maxInputs=32,maxNodes=3000,maxLeaves=128,maxDepth=32}={}) {
  if(!Number.isInteger(maxInputs)||maxInputs<2||maxInputs>64 || !Number.isInteger(maxNodes)||maxNodes<1||maxNodes>50000 || !Number.isInteger(maxLeaves)||maxLeaves<2||maxLeaves>4096 || !Number.isInteger(maxDepth)||maxDepth<1||maxDepth>128)throw err('ENGINE_LIMITS_INVALID');
  const sources = new Map(); // id -> latest immutable source record
  const composites = new Map(); // deterministic id -> immutable composition record
  const cache = new Map(); // stable semantic key digest -> composite id
  const dependents = new Map(); // child node id -> Set of composite ids
  const revisionsSeen = new Map(); // block accidental reuse of an older revision label
  let cacheHits=0, cacheMisses=0;
  const nodeById = id => sources.get(id) || composites.get(id) || null;
  const isStale = node => node?.stale === true;
  function markDependentStale(id, visited=new Set()) {
    for(const c of dependents.get(id)||[]) {
      if(visited.has(c)) continue; visited.add(c);
      const n=composites.get(c); if(n) { n.stale=true; markDependentStale(c,visited); }
    }
  }
  function readGuard(node, caps, visiting=new Set()) {
    if(!node || isStale(node)) return 'STALE_OR_MISSING';
    if(visiting.has(node.id)) return 'CYCLE_DETECTED';
    visiting.add(node.id);
    if(node.kind==='source') {
      for(const c of node.capabilities) if(!caps.has(c)) return 'CAPABILITY_REQUIRED';
    } else {
      for(const child of node.directInputs){
        const cause = readGuard(nodeById(child.id),caps,visiting);
        if(cause) return cause;
        if(nodeById(child.id).fingerprint!==child.fingerprint) return 'DEPENDENCY_CHANGED';
      }
    }
    visiting.delete(node.id);
    return null;
  }
  function getSafe(id,{capabilities=[]}={}) {
    if(!validReqs(capabilities)) return blocked('CAPABILITY_CONTEXT_INVALID');
    const node=nodeById(id); if(!node) return blocked('NOT_FOUND');
    const cause=readGuard(node,new Set(capabilities));if(cause) return blocked(cause);
    if(node.kind==='source')return ok({schema:COMPOSITION_SCHEMA,kind:'source',id:node.id,revision:node.revision,content_hash:node.fingerprint,authority:'none',provenance_status:'unverified',declared_source_id:node.sourceId,payload:copy(node.payload)});
    return ok({schema:COMPOSITION_SCHEMA,kind:'composition',id:node.id,operation:copy(node.operator),input_refs:copy(node.directInputs),leaf_refs:copy(node.leaves),declared_source_id_count:node.sourceOrigins.length,computed_value:node.computedValue??null,context_hash:node.contextHash,content_hash:node.fingerprint,authority:'none',evidence_certification:'UNVERIFIED',memory_approval:'NOT_APPROVED',real_ack:'NOT_VERIFIED',stale:false});
  }
  async function registerSource({id,revision,payload,capabilities=[],sourceId=null}={}) {
    if(!isId(id)||id.startsWith('cmp:')||!isId(revision)|| (sourceId!==null&&!isId(sourceId)) || !validReqs(capabilities))return blocked('SOURCE_CONTRACT_INVALID');
    if(nodeById(id)?.kind==='composition')return blocked('ID_NAMESPACE_CONFLICT');
    let json;
    try { json=stableJson(payload); }catch(e){return blocked(e.code||'PAYLOAD_INVALID');}
    if(json.length>512*1024) return blocked('PAYLOAD_TOO_LARGE');
    const fingerprint=await sha256(json);
    const old=sources.get(id);
    if(old && old.sourceId !== (sourceId||id))return blocked('SOURCE_ID_REBIND_FORBIDDEN');
    if(old && old.revision!==revision && revisionsSeen.get(id)?.has(revision))return blocked('REVISION_ROLLBACK_UNAUTHORIZED');
    if(old){
      if(old.revision===revision && old.fingerprint===fingerprint && stableJson(old.capabilities)===stableJson([...capabilities].sort()) && old.sourceId===(sourceId||id))return {status:'reused',decision:'HOLD',id,revision,content_hash:fingerprint};
      if(old.revision===revision)return blocked('REVISION_REUSED_WITH_DIFFERENT_CONTENT_OR_POLICY');
      // revisions are opaque ids. Old version remains an external authoritative responsibility.
      markDependentStale(id);
    } else if(sources.size+composites.size>=maxNodes)return blocked('NODE_CAPACITY_REACHED');
    sources.set(id,{kind:'source',id,sourceId:sourceId||id,revision,payload:copy(payload),fingerprint,capabilities:[...capabilities].sort(),depth:0,stale:false});
    if(!revisionsSeen.has(id))revisionsSeen.set(id,new Set());
    revisionsSeen.get(id).add(revision);
    return {status:'registered',decision:'HOLD',id,revision,content_hash:fingerprint,previous_revision:old?.revision||null};
  }
  async function compose({inputIds,operator={type:'collect',ruleId:'collection',ruleVersion:'1'},context={},capabilities=[]}={}) {
    if(!Array.isArray(inputIds)||inputIds.length<2||inputIds.length>maxInputs|| !inputIds.every(isId))return blocked('INPUT_LIST_INVALID');
    if(!isPlain(operator)||Object.keys(operator).sort().join(',')!=='ruleId,ruleVersion,type'||!OPERATORS.has(operator.type)||!isId(operator.ruleId)||!isId(operator.ruleVersion))return blocked('OPERATOR_INVALID');
    if(!validReqs(capabilities))return blocked('CAPABILITY_CONTEXT_INVALID');
    if(!isPlain(context))return blocked('CONTEXT_INVALID');
    let contextJson;
    try{contextJson=stableJson(context);}catch(e){return blocked(e.code||'CONTEXT_INVALID');}
    if(contextJson.length>8192)return blocked('CONTEXT_TOO_LARGE');
    const direct=[];const leaf=[];const declaredSourceOrigins=new Set();const caps=new Set(capabilities);let depth=0;let computedValue=operator.type==='sum_integers'?0:null;
    for(const id of inputIds){
      const node=nodeById(id);if(!node)return blocked('INPUT_MISSING');
      const cause=readGuard(node,caps);if(cause)return blocked(cause);
      depth=Math.max(depth,node.depth+1);
      if(depth>maxDepth)return blocked('COMPOSITION_DEPTH_LIMIT');
      for(const source of node.kind==='source'?[node.sourceId]:node.sourceOrigins) declaredSourceOrigins.add(source);
      direct.push({id,fingerprint:node.fingerprint,revision:node.revision||null});
      // Only 'collect' and safe integer sum are associative/commutative here.
      // 'collect' is idempotent, whereas integer sum counts repeated operands.
      const flatten = (operator.type==='collect'||operator.type==='sum_integers') && node.kind==='composition' && node.operator.type===operator.type && node.operator.ruleId===operator.ruleId && node.operator.ruleVersion===operator.ruleVersion && node.contextJson===contextJson;
      if(operator.type==='sum_integers'){
        const term=node.kind==='source' ? node.payload : flatten ? node.computedValue : null;
        if(!Number.isSafeInteger(term))return blocked('NON_SAFE_INTEGER_OPERAND');
        const next=computedValue+term;
        if(!Number.isSafeInteger(next))return blocked('INTEGER_SUM_OVERFLOW');
        computedValue=next;
      }
      if(flatten) leaf.push(...node.leaves);
      else leaf.push({id:node.id,fingerprint:node.fingerprint,revision:node.revision||null});
    }
    if(operator.type==='collect'||operator.type==='sum_integers'){
      const sorted=operator.type==='collect'?[...new Map(leaf.map(x=>[x.id+':'+x.fingerprint,x])).values()]:leaf;
      leaf.splice(0,leaf.length,...sorted.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:a.fingerprint<b.fingerprint?-1:a.fingerprint>b.fingerprint?1:0));
    }
    if(leaf.length>maxLeaves)return blocked('LEAF_LIMIT_EXCEEDED');
    // Protect against repeated identity being treated as multiple independent evidence.
    const evidenceUnique=new Set(direct.map(x=>x.id+':'+x.fingerprint));
    if(evidenceUnique.size<2 && operator.type!=='sum_integers') return blocked('NOT_ENOUGH_DISTINCT_INPUTS');
    const inputKey=(operator.type==='collect'||operator.type==='sum_integers') ? leaf : direct;
    const key=stableJson({schema:COMPOSITION_SCHEMA,operation:operator,context,input_refs:inputKey});
    const hash=await sha256(key);const composedId='cmp:'+hash;
    const cachedId=cache.get(hash);
    if(cachedId && composites.has(cachedId) && !composites.get(cachedId).stale){
      cacheHits++;
      return {status:'reused',decision:'HOLD',id:cachedId,content_hash:hash,cache_hit:true,evidence_certification:'UNVERIFIED'};
    }
    if(sources.size+composites.size>=maxNodes)return blocked('NODE_CAPACITY_REACHED');
    if(sources.has(composedId))return blocked('ID_NAMESPACE_CONFLICT');
    const node={kind:'composition',id:composedId,operator:copy(operator),contextHash:await sha256(contextJson),contextJson,
      directInputs:direct,leaves:leaf,sourceOrigins:[...declaredSourceOrigins].sort(),computedValue,fingerprint:hash,depth,stale:false};
    composites.set(composedId,node);cache.set(hash,composedId);cacheMisses++;
    for(const child of direct){if(!dependents.has(child.id))dependents.set(child.id,new Set());dependents.get(child.id).add(composedId);}
    return {status:'created',decision:'HOLD',id:composedId,content_hash:hash,cache_hit:false,evidence_certification:'UNVERIFIED'};
  }
  return Object.freeze({registerSource,compose,read:getSafe,stats:()=>({source_count:sources.size,composition_count:composites.size,cache_hits:cacheHits,cache_misses:cacheMisses,authority:'none'})});
}