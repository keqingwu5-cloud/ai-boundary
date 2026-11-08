// Isolated candidate: block invalid-load fallback writes and stale-tab writes.
// Does not repair, delete, transmit, or sync browser data.
export function createBrainStorageGuard(storage,key,validate){
  let observed=null,loaded=null,blocked=null,origin='ABSENT';
  try {
    observed=storage.getItem(key);
    if(observed!==null){
      try {
        const parsed=JSON.parse(observed);
        if(!validate(parsed))blocked='INVALID_STRUCTURE';
        else {loaded=parsed;origin='VALID';}
      }catch{blocked='INVALID_JSON';}
    }
  }catch{blocked='STORAGE_READ_FAILED';}
  function save(serialized){
    if(blocked)return {ok:false,reason:blocked};
    if(typeof serialized!=='string')return {ok:false,reason:'INVALID_WRITE'};
    let current;
    try{current=storage.getItem(key);}catch{blocked='STORAGE_READ_FAILED';return {ok:false,reason:blocked};}
    if(current!==observed){blocked='CONCURRENT_CHANGE';return {ok:false,reason:blocked};}
    try{storage.setItem(key,serialized);}catch{blocked='STORAGE_WRITE_FAILED';return {ok:false,reason:blocked};}
    observed=serialized;
    return {ok:true};
  }
  return {state:loaded,origin,canWrite:()=>!blocked,reason:()=>blocked,save};
}
