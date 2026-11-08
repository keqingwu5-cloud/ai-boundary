// Local graph integrity validator. No network, persistence or automatic repair.
// Graph references are verified before a browser load/import/save is accepted.
// Legacy v1/v2 fields outside the graph topology are preserved, not deleted.
const id=x=>typeof x==='string'&&x.length>0&&x.trim()===x;
const coords=x=>Array.isArray(x)&&x.length===3&&x.every(Number.isFinite);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function acyclic(ids,lookup,parent){
  const colors=new Map(); // 1 visiting, 2 complete
  for(const id of ids){
    if(colors.get(id)===2)continue;
    let current=id;const trail=[];
    while(current!==null&&current!==undefined){
      if(colors.get(current)===1)return false;
      if(colors.get(current)===2)break;
      colors.set(current,1);trail.push(current);
      current=parent(lookup.get(current));
    }
    for(const t of trail)colors.set(t,2);
  }
  return true;
}
export function validateBrainGraph(g){
  if(!obj(g)||!Array.isArray(g.brains)||!Array.isArray(g.nodes)||
    !Array.isArray(g.links)||!Array.isArray(g.history))return false;
  const brains=new Map(),nodes=new Map(),links=new Set();
  for(const b of g.brains){
    if(!obj(b)||!id(b.id)||brains.has(b.id)||!coords(b.position))return false;
    brains.set(b.id,b);
  }
  if(!brains.has('main'))return false;
  if(brains.get('main').parentBrainId!==null&&brains.get('main').parentBrainId!==undefined)return false;
  for(const b of g.brains){
    if(b.id==='main')continue;
    if(!id(b.parentBrainId)||!brains.has(b.parentBrainId)||b.parentBrainId===b.id)return false;
  }
  if(!acyclic(brains.keys(),brains,b=>b.parentBrainId??null))return false;
  for(const n of g.nodes){
    if(!obj(n)||!id(n.id)||nodes.has(n.id)||!id(n.brainId)||
      !brains.has(n.brainId)||!coords(n.pos))return false;
    nodes.set(n.id,n);
  }
  for(const n of g.nodes){
    if(n.parentId===null||n.parentId===undefined)continue;
    if(!id(n.parentId)||n.parentId===n.id||!nodes.has(n.parentId))return false;
  }
  if(!acyclic(nodes.keys(),nodes,n=>n.parentId??null))return false;
  for(const b of g.brains){
    if(b.rootNodeId===null||b.rootNodeId===undefined){
      if(b.id!=='main')return false;
    } else if(!id(b.rootNodeId)||!nodes.has(b.rootNodeId)||
      nodes.get(b.rootNodeId).brainId!==b.id)return false;
  }
  for(const edge of g.links){
    if(!obj(edge)||!id(edge.id)||links.has(edge.id)||
      !id(edge.from)||!id(edge.to)||!nodes.has(edge.from)||!nodes.has(edge.to)||
      edge.from===edge.to)return false;
    links.add(edge.id);
    if(edge.kind==='derived'&&nodes.get(edge.to).parentId!==edge.from)return false;
  }
  return true;
}
