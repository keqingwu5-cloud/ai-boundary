/* TCVL architecture visual helpers. Pure functions only: no network, storage or credentials. */
(function (root,factory) {
  const api=factory();
  if (typeof module!=="undefined" && module.exports) module.exports=api;
  if (root) root.TcvlArchitectureCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const SCHEMA="tcvl.quick-blueprint.v0.1";
  const MEMORY_PACK="ai-boundary.memory-pack.v1";
  const ARCH_PREFIX="【主腦架構】";
  const STATUSES={
    local_manual:{label:"人工交接",note:"需使用者複製、匯入或人工確認接收，不是 AI 自動連線",weight:1},
    local_review:{label:"本機審核",note:"僅本機加密記憶候選與人工審核，未經跨裝置驗收",weight:1},
    demo:{label:"展示模式",note:"只有虛構資料的可視化，不代表真實資料已同步",weight:3},
    planned:{label:"規劃中／尚未接通",note:"是未來資料流設計，並無自動發送及回報能力",weight:5}
  };
  const ROUTES=[
    {from:"launcher",to:"governance",status:"local_manual",action:"把發射器指令或回報包人工匯入本機審核"},
    {from:"governance",to:"launcher",status:"local_manual",action:"來源不明或資料不合格，退回人工調整任務"},
    {from:"governance",to:"collaboration",status:"local_manual",action:"人工分享已篩選的必要候選資料到三方"},
    {from:"collaboration",to:"correction",status:"local_manual",action:"由使用者貼回三方測試或反證回報"},
    {from:"correction",to:"collaboration",status:"planned",action:"未來由主腦自動分派重新驗證任務"},
    {from:"correction",to:"vault",status:"local_review",action:"把修正作為候選送至本機記憶審核"},
    {from:"vault",to:"traceback",status:"planned",action:"未來授權唯讀事件連接；目前回溯頁無法讀取正式記憶"},
    {from:"traceback",to:"governance",status:"planned",action:"將回溯發現的錯誤自動轉成新的審查候選"},
    {from:"launcher",to:"traceback",status:"demo",action:"發射器可開啟展示型回溯頁，未綁定真實任務"}
  ];
  const INTERFACES=[
    {id:"launcher",title:"發射器／人工指令",status:"local_manual",detail:"本機草稿及人工分享；收件 AI 是否收到仍需人工確認"},
    {id:"vault",title:"本機加密共同記憶",status:"local_review",detail:"人工提交、拒絕、修正與審批；不支援雲端同步"},
    {id:"traceback",title:"回溯視覺原型",status:"demo",detail:"虛構案例可播放及跑測試邏輯，不讀取真實記憶"},
    {id:"ai_api",title:"GPT①／GPT②／BOT③ 自動接口",status:"planned",detail:"目前沒有三方身分認證、實際 API 自動互傳"},
    {id:"external",title:"其他 AI／Webhook／企業資料接口",status:"planned",detail:"需後端授權、安全存放金鑰與資料治理後才可使用"}
  ];
  const FIELD_TEMPLATES={
    inbound:{name:"資料進站紀錄",fields:[["recordId","資料 ID"],["source","來源聲稱"],["receivedAt","取得時間"],["version","版本"],["evidence","證據或檔案引用"],["validation","格式／權限檢查"],["next","下一步"]]},
    outbound:{name:"資料送出紀錄",fields:[["recordId","任務／資料 ID"],["destination","預計送達對象"],["sentAt","人工操作時間"],["delivery","接收確認狀態"],["version","版本"],["permissions","分享範圍"],["next","回報要求"]]},
    rejection:{name:"拒絕紀錄",fields:[["recordId","原始候選 ID"],["reason","拒絕的具體理由"],["evidence","仍成立的反證"],["impact","可能影響範圍"],["owner","退回對象"],["retest","補件／重測要求"]]},
    correction:{name:"修正紀錄",fields:[["recordId","原記錄 ID"],["revision","修正版本／候選"],["changed","變更內容"],["newEvidence","新證據"],["remaining","仍未解決事項"],["verify","重測方式"],["approval","核准狀態"]]},
    interface:{name:"接口狀態紀錄",fields:[["recordId","接口 ID"],["status","狀態"],["lastChecked","最後確認時間"],["direction","允許資料流向"],["permission","認證／權限"],["failure","錯誤／阻塞"],["next","下一步驗收"]]}
  };
  const str=(v,max=500)=>typeof v==="string"&&v.trim().length>0&&v.length<=max;
  const validModuleId=id=>str(id,120)&&/^[a-z0-9_-]+$/i.test(id);
  function validateBlueprint(draft) {
    const errors=[];
    if(!draft||draft.schema!==SCHEMA||!str(draft.name,140)||!Array.isArray(draft.steps)||!draft.steps.length||draft.steps.length>30)return ["architecture_schema_or_size_invalid"];
    const ids=new Set();
    for(const s of draft.steps) {
      if(!s||!validModuleId(s.id)||ids.has(s.id)||!str(s.title,250)||!str(s.input,1000)||!str(s.action,1600)||!str(s.output,1000)||!str(s.next,300))errors.push("invalid_or_duplicate_step");
      else ids.add(s.id);
    }
    if(!str(draft.reverseRule,3000)||!str(draft.verificationGates,3000))errors.push("gate_or_rollback_missing");
    return [...new Set(errors)];
  }
  function routePlan(start,end,edges=ROUTES) {
    if(!validModuleId(start)||!validModuleId(end))throw Error("起點或終點 ID 無效");
    if(start===end)return {steps:[],summary:"同一個節點，無需跨模組傳遞",fullyConnected:false,containsDemo:false,automatic:false};
    if(!Array.isArray(edges)||edges.length>150)throw Error("路徑連線數量無效");
    for(const e of edges)if(!e||!validModuleId(e.from)||!validModuleId(e.to)||!STATUSES[e.status]||!str(e.action,500))throw Error("不合法的路徑連線");
    const best=new Map([[start,{score:0,steps:[]}]]),q=[start],closed=new Set();
    while(q.length){
      q.sort((a,b)=>best.get(a).score-best.get(b).score);
      const node=q.shift();
      if(closed.has(node))continue;
      closed.add(node);
      if(node===end)break;
      for(const edge of edges.filter(e=>e.from===node)){
        const score=best.get(node).score+STATUSES[edge.status].weight;
        if(!best.has(edge.to)||score<best.get(edge.to).score){best.set(edge.to,{score,steps:[...best.get(node).steps,edge]});q.push(edge.to)}
      }
    }
    if(!best.has(end))return {steps:[],summary:"沒有定義這兩個節點之間的交接路徑",fullyConnected:false,unreachable:true,containsDemo:false};
    const steps=best.get(end).steps;
    const hasPlanned=steps.some(s=>s.status==="planned");
    const hasDemo=steps.some(s=>s.status==="demo");
    const hasManual=steps.some(s=>["local_manual","local_review"].includes(s.status));
    const summary=hasPlanned?"路徑包含尚未接通的接口；無法直接自動執行":hasDemo?"含展示路徑，僅能示範，不等於真實資料已送達":"目前只能人工操作與核對；不是全自動接口";
    return {steps,summary,fullyConnected:false,containsDemo:hasDemo,hasUnbuilt:hasPlanned,requiresManual:hasManual,automatic:false};
  }
  function fullArchitectureText(draft,interfaces=INTERFACES,edges=ROUTES) {
    const problems=validateBlueprint(draft);if(problems.length)throw Error("架構草稿格式錯誤："+problems.join(", "));
    const titles=new Map(draft.steps.map(s=>[s.id,s.title]));
    return [
      "【主腦架構完整快照｜設計草稿，未部署】",
      "架構名稱："+draft.name,
      "架構格式："+SCHEMA,
      "此紀錄保存設計主張，不代表 AI 已連線、驗收或資料來源已驗證。",
      "流程節點數："+draft.steps.length,
      ...draft.steps.flatMap((s,i)=>["","節點 "+(i+1)+"｜"+s.id+"｜"+s.title,"狀態："+(s.status||"未提供狀態，待核對"),"接收："+s.input,"處理："+s.action,"產出："+s.output,"檢查："+(s.check||"未定義，待補齊"),"交接："+(s.forward||s.next),"出錯退回："+(s.reverse||draft.reverseRule),"下一步："+s.next]),
      "","反向退回規則："+draft.reverseRule,
      "審查與驗收門檻："+draft.verificationGates,
      "","【路徑與接口狀態｜靜態盤點，不是即時連線檢查】",
      ...edges.filter(e=>titles.has(e.from)&&titles.has(e.to)).map(e=>e.from+" → "+e.to+"｜"+STATUSES[e.status].label+"｜"+e.action),
      ...interfaces.map(x=>"接口 "+x.id+"｜"+x.title+"｜"+STATUSES[x.status]?.label+"｜"+x.detail)
    ].join("\n");
  }
  function memoryPack(name,content,reason,evidence,uid) {
    if(!str(name,3000)||!str(content,12000)||!str(reason,8000)||typeof evidence!=="string"||evidence.length>8000||!str(uid,65))throw Error("記憶包內容過長或必填欄位缺失；請拆分架構或補齊原因");
    return {schema:MEMORY_PACK,items:[{
      id:"ARCH-"+uid,question:ARCH_PREFIX+name,purpose:"經人工審核保存主腦架構、資料路徑、接口狀態及版本／修正／否決的完整追溯依據。",
      content,reason,evidence,evidenceLevel:"hypothesis",eventType:"new_question"
    }]};
  }
  function architecturePack(draft,uid) {
    return memoryPack(draft.name,fullArchitectureText(draft),"從架構導覽匯出完整流程草稿，等待使用者審查，非正式核准。","來源：架構導覽／人工設計。接口狀態是靜態盤點；各模組需獨立驗收。",uid);
  }
  function recordPack(templateId,fields,uid) {
    const t=FIELD_TEMPLATES[templateId];
    if(!t||!fields||typeof fields!=="object"||Array.isArray(fields))throw Error("未知紀錄模板");
    const rows=[];
    for(const [key,label] of t.fields){
      const value=fields[key];
      if(typeof value!=="string"||value.trim().length===0||value.length>1200)throw Error("請填寫："+label);
      rows.push(label+"："+value.trim());
    }
    const content="【"+t.name+"｜設計／人工記錄，尚未查證】\n"+rows.join("\n")+"\n資料未經 API 自動送達確認；不得直接當成事實成立。";
    const title="紀錄｜"+t.name+"｜"+fields.recordId;
    return memoryPack(title,content,"將紀錄模板作為記憶候選；具體身分及來源仍須人工驗證。","人工提交，來源聲稱未自動認證；待審核、未送達其他 AI。",uid);
  }
  function filterHistory(history,{showInbound=true,showOutbound=true,kinds=[]}={}) {
    if(!Array.isArray(history))return [];
    return history.filter(x=>x&&typeof x==="object"&&(x.direction==="inbound"?showInbound:x.direction==="outbound"?showOutbound:false)
      &&(!kinds.length||kinds.includes(x.kind)));
  }
  return {SCHEMA,MEMORY_PACK,ARCH_PREFIX,STATUSES,ROUTES,INTERFACES,FIELD_TEMPLATES,
    validateBlueprint,routePlan,fullArchitectureText,architecturePack,recordPack,filterHistory};
});