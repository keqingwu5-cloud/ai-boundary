"use strict";
/* User-authored local memory direction and final-gate notes only.
 * No automatic approval, routing, ranking, or enforcement. */
(function(root){
  const KEYS=["direction","threshold"];
  const blank=()=>({direction:{text:"",version:0},threshold:{text:"",version:0},history:[]});
  function view(raw){
    if(raw==null)return blank(); // Older encrypted vaults remain readable, without mutation.
    if(typeof raw!=="object"||Array.isArray(raw)||!Array.isArray(raw.history))throw Error("memory_controls_invalid");
    const result={history:raw.history.map(e=>({...e}))};
    for(const k of KEYS){
      const item=raw[k];
      if(!item||typeof item.text!=="string"||item.text.length>6000||
        !Number.isSafeInteger(item.version)||item.version<0)throw Error("memory_controls_invalid");
      result[k]={text:item.text,version:item.version};
    }
    for(const h of result.history){
      if(!h||!KEYS.includes(h.kind)||typeof h.before!=="string"||typeof h.after!=="string"||
        typeof h.reason!=="string"||typeof h.at!=="string"||typeof h.id!=="string"||
        !Number.isSafeInteger(h.version)||h.version<1)throw Error("memory_controls_history_invalid");
    }
    return result;
  }
  function revise(raw,kind,nextText,reason,at,id){
    if(!KEYS.includes(kind))throw Error("memory_controls_kind_invalid");
    const current=view(raw);
    if(typeof nextText!=="string"||nextText.length>6000)throw Error("memory_controls_text_invalid");
    if(typeof reason!=="string"||!reason.trim()||reason.length>1000)throw Error("memory_controls_reason_required");
    if(typeof at!=="string"||Number.isNaN(Date.parse(at))||typeof id!=="string"||!id)throw Error("memory_controls_event_invalid");
    if(nextText===current[kind].text)throw Error("memory_controls_no_change");
    const next={
      direction:{...current.direction},threshold:{...current.threshold},
      history:current.history
    };
    const version=current[kind].version+1;
    next[kind]={text:nextText,version};
    next.history=[...current.history,{
      id,kind,version,before:current[kind].text,after:nextText,reason:reason.trim(),at
    }];
    return next;
  }
  const api={view,revise};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.MemoryControlsCore=api;
})(typeof globalThis!=="undefined"?globalThis:this);
