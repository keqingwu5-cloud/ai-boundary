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

  /* A node's validation outcome is not the lifecycle state of the entire module. */
  const NODE_CHECKS=Object.freeze([
    {id:"input",label:"輸入資料與來源"},
    {id:"processing",label:"功能處理與規則"},
    {id:"output",label:"輸出與結果"},
    {id:"testing",label:"測試及反證"},
    {id:"handoff",label:"交接與接口"},
    {id:"traceability",label:"版本及回溯"}
  ]);
  const NODE_STATES=Object.freeze({
    unverified:"待驗證",reviewing:"驗證中",verified:"節點已驗證",failed:"驗證不成立"
  });
  const MODULE_STATES=Object.freeze({
    planned:"規劃中",building:"建置中",review:"待整體驗收",completed:"✅ 已完成（人工確認）"
  });
  const completionCopy=value=>JSON.parse(JSON.stringify(value));
  function initialModuleCompletion(stage="planned"){
    if(!["planned","building"].includes(stage))throw Error("新的模組不能跳過驗證直接進入待驗收或已完成");
    return {stage,nodes:NODE_CHECKS.map(x=>({id:x.id,state:"unverified",evidence:""})),reviewer:"",acceptanceRef:"",approvedAt:"",history:[]};
  }
  function assertCompletion(c){
    if(!c||!MODULE_STATES[c.stage]||!Array.isArray(c.nodes)||c.nodes.length!==NODE_CHECKS.length||!Array.isArray(c.history)||c.history.length>200)throw Error("模組驗收資料格式不合法");
    const ids=new Set();
    for(const n of c.nodes){
      if(!n||!NODE_CHECKS.some(x=>x.id===n.id)||ids.has(n.id)||!NODE_STATES[n.state]||typeof n.evidence!=="string"||n.evidence.length>1000||(n.state==="verified"&&!n.evidence.trim()))throw Error("節點驗證狀態或證據不合法");
      ids.add(n.id);
    }
    for(const h of c.history)if(!h||typeof h.at!=="string"||h.at.length>40||typeof h.action!=="string"||h.action.length>90)throw Error("驗收歷史資料格式不合法");
    if(c.stage==="completed"&&(!c.nodes.every(n=>n.state==="verified")||typeof c.reviewer!=="string"||!c.reviewer.trim()||typeof c.acceptanceRef!=="string"||!c.acceptanceRef.trim()||typeof c.approvedAt!=="string"||!c.approvedAt.trim()))throw Error("完成模組缺少全部節點驗證及人工驗收");
    return true;
  }
  function moduleCompletionSummary(c){
    assertCompletion(c);
    const verified=c.nodes.filter(x=>x.state==="verified").length;
    return {label:MODULE_STATES[c.stage],verified,total:NODE_CHECKS.length,completed:c.stage==="completed",missing:c.nodes.filter(x=>x.state!=="verified").map(x=>x.id)};
  }
  function updateNodeVerification(c,{nodeId,state,evidence,at}){
    assertCompletion(c);
    if(!NODE_STATES[state]||!NODE_CHECKS.some(x=>x.id===nodeId)||typeof evidence!=="string"||evidence.length>1000||typeof at!=="string"||!at.trim())throw Error("節點結果缺少必要欄位");
    if(state==="verified"&&!evidence.trim())throw Error("節點驗證通過必須有具體證據或驗收引用");
    const next=completionCopy(c),item=next.nodes.find(x=>x.id===nodeId);
    item.state=state;item.evidence=evidence.trim();
    if(next.stage==="completed"){next.stage="review";next.reviewer="";next.acceptanceRef="";next.approvedAt="";}
    else next.stage=next.nodes.every(x=>x.state==="verified")?"review":"building";
    next.history.push({at,action:"node."+state,nodeId,note:evidence.trim()});
    assertCompletion(next);return next;
  }
  function approveModuleCompletion(c,{reviewer,acceptanceRef,at}){
    assertCompletion(c);
    if(typeof reviewer!=="string"||!reviewer.trim()||reviewer.length>80||typeof acceptanceRef!=="string"||!acceptanceRef.trim()||acceptanceRef.length>250||typeof at!=="string"||!at.trim())throw Error("完成確認需要核准人與驗收紀錄引用");
    if(c.nodes.some(x=>x.state!=="verified"))throw Error("六個必要節點尚未全部驗證，不能標示 ✅ 已完成");
    const next=completionCopy(c);next.stage="completed";next.reviewer=reviewer.trim();next.acceptanceRef=acceptanceRef.trim();next.approvedAt=at;
    next.history.push({at,action:"module.completed",note:"人工確認："+next.reviewer+"｜驗收："+next.acceptanceRef});
    assertCompletion(next);return next;
  }
  function reopenModuleCompletion(c,{reason,at}){
    assertCompletion(c);
    if(typeof reason!=="string"||!reason.trim()||reason.length>500||typeof at!=="string"||!at.trim())throw Error("退回重審須保留理由");
    const next=completionCopy(c);next.stage="review";next.reviewer="";next.acceptanceRef="";next.approvedAt="";
    next.history.push({at,action:"module.reopened",note:reason.trim()});
    assertCompletion(next);return next;
  }
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
      ...draft.steps.flatMap((s,i)=>["","節點 "+(i+1)+"｜"+s.id+"｜"+s.title,"狀態："+(s.status||"未提供狀態，待核對"),"接收："+s.input,"處理："+s.action,"產出："+s.output,"檢查："+(s.check||"未定義，待補齊"),"交接："+(s.forward||s.next),"出錯退回："+(s.reverse||draft.reverseRule),"節點驗證及模組完成："+(s.completion?JSON.stringify((assertCompletion(s.completion),s.completion)):"未建立人工驗收紀錄"),"下一步："+s.next]),
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
  function architecturePack(draft,uid,interfaces=INTERFACES,edges=ROUTES) {
    return memoryPack(draft.name,fullArchitectureText(draft,interfaces,edges),"從架構導覽匯出完整流程草稿，等待使用者審查，非正式核准。","來源：架構導覽／人工設計。接口狀態是靜態盤點；各模組需獨立驗收。",uid);
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
    const custom=fields.extraFields||[];
    if(!Array.isArray(custom)||custom.length>8)throw Error("自訂欄位最多 8 項");
    const seenLabels=new Set();
    for(const extra of custom){
      if(!extra||!str(extra.label,80)||!str(extra.value,1200)||seenLabels.has(extra.label.trim()))throw Error("自訂欄位名稱或內容無效、重複");
      seenLabels.add(extra.label.trim());
      rows.push(extra.label.trim()+"："+extra.value.trim());
    }
    const content="【"+t.name+"｜設計／人工記錄，尚未查證】\n"+rows.join("\n")+"\n資料未經 API 自動送達確認；不得直接當成事實成立。";
    const title="紀錄｜"+t.name+"｜"+fields.recordId;
    return memoryPack(title,content,"將紀錄模板作為記憶候選；具體身分及來源仍須人工驗證。","人工提交，來源聲稱未自動認證；待審核、未送達其他 AI。",uid);
  }
  function normalizeCandidateTransfer(input,existingIds=[]){
    if(!input||input.schema!=="tcvl.candidate-map-transfer.v0.1"||!input.project||!str(input.project.title,140)||!Array.isArray(input.nodes)||!Array.isArray(input.links)||input.nodes.length>30||input.links.length>100)
      throw Error("不是有效的候選版圖，或數量過多");
    const existing=new Set(existingIds),local=new Set(),nodes=[],edges=[];
    for(const n of input.nodes){
      if(!n||!validModuleId(n.id)||existing.has(n.id)||local.has(n.id)||!str(n.title,140)||!str(n.purpose,1000)||!validModuleId(n.fromNode)||!["candidate","review","rejected","approved_plan"].includes(n.stage))
        throw Error("候選節點不完整、重複或與正式節點 ID 衝突");
      local.add(n.id);
      nodes.push({id:n.id,n:"NEW",title:n.title,short:n.purpose.slice(0,60),status:"候選規劃／未接線",
        desc:"規劃所屬專案："+input.project.title+"。原始階段："+n.stage+"。目前沒有已驗收的接口連線。",
        input:"未來資料來源待設計",work:n.purpose,output:"待驗證的規劃產出",
        check:"待定義來源與完成標準，不可宣稱已驗證",forward:"依候選版圖關聯進行交接規劃",
        reverse:"失敗時返回方案提出者並保留版本",links:[]});
    }
    const known=new Set([...existing,...local]);
    const linkKeys=new Set();
    for(const e of input.links){
      if(!e||!validModuleId(e.from)||!validModuleId(e.to)||!known.has(e.from)||!known.has(e.to)||e.from===e.to||!["handoff","branch","depends_on"].includes(e.kind))
        throw Error("候選連線不存在或關聯類型不合法");
      const key=e.from+"->"+e.to+"#"+e.kind;
      if(linkKeys.has(key))continue;linkKeys.add(key);
      edges.push({from:e.from,to:e.to,status:"planned",action:"匯入的"+({"handoff":"交接","branch":"分支","depends_on":"依賴"}[e.kind])+"規劃，尚未接線；不能視為因果或實際傳輸"});
    }
    for(const n of input.nodes)if(known.has(n.fromNode)&&n.fromNode!==n.id){
      const key=n.fromNode+"->"+n.id+"#branch";
      if(!linkKeys.has(key)){linkKeys.add(key);edges.push({from:n.fromNode,to:n.id,status:"planned",action:"候選版塊原始延伸來源，尚未接線"});}
    }
    return {nodes,edges};
  }
  function filterHistory(history,{showInbound=true,showOutbound=true,kinds=[]}={}) {
    if(!Array.isArray(history))return [];
    return history.filter(x=>x&&typeof x==="object"&&(x.direction==="inbound"?showInbound:x.direction==="outbound"?showOutbound:false)
      &&(!kinds.length||kinds.includes(x.kind)));
  }
  return {SCHEMA,MEMORY_PACK,ARCH_PREFIX,STATUSES,ROUTES,INTERFACES,FIELD_TEMPLATES,NODE_CHECKS,NODE_STATES,MODULE_STATES,initialModuleCompletion,assertCompletion,moduleCompletionSummary,updateNodeVerification,approveModuleCompletion,reopenModuleCompletion,
    validateBlueprint,routePlan,fullArchitectureText,architecturePack,recordPack,filterHistory,normalizeCandidateTransfer};
});