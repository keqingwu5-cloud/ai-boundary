// Isolated safety guard for raw browser storage.
// Bad or unverified originals remain untouched. Validation runs at load AND write.
// The pre-write comparison is best effort across tabs (not an atomic DB transaction).
export function createBrainStorageGuard(storage,key,validate){
  if(typeof validate!=='function')throw new TypeError('validator required');
  let observed=null,loaded=null,blocked=null,origin='ABSENT';
  try {
    observed=storage.getItem(key);
    if(observed!==null){
      let parsed;
      try{parsed=JSON.parse(observed);}catch{blocked='INVALID_JSON';}
      if(!blocked){
        try{
          if(!validate(parsed))blocked='INVALID_STRUCTURE';
          else {loaded=parsed;origin='VALID';}
        }catch{blocked='VALIDATION_ERROR';}
      }
    }
  }catch{blocked='STORAGE_READ_FAILED';}
  function save(serialized){
    if(blocked)return {ok:false,reason:blocked};
    if(typeof serialized!=='string')return {ok:false,reason:'INVALID_WRITE'};
    let current;
    try{current=storage.getItem(key);}catch{blocked='STORAGE_READ_FAILED';return {ok:false,reason:blocked};}
    if(current!==observed){blocked='CONCURRENT_CHANGE';return {ok:false,reason:blocked};}
    let parsed;
    try{parsed=JSON.parse(serialized);}catch{blocked='INVALID_WRITE_JSON';return {ok:false,reason:blocked};}
    try{
      if(!validate(parsed)){blocked='INVALID_WRITE_STRUCTURE';return {ok:false,reason:blocked};}
    }catch{blocked='VALIDATION_ERROR';return {ok:false,reason:blocked};}
    try{storage.setItem(key,serialized);}catch{blocked='STORAGE_WRITE_FAILED';return {ok:false,reason:blocked};}
    observed=serialized;
    return {ok:true};
  }
  return {state:loaded,origin,canWrite:()=>!blocked,reason:()=>blocked,save};
}
