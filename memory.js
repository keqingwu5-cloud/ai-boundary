"use strict";
/* Private-in-browser prototype. No fetch, external scripts, or automatic AI communication. */
(()=>{
const STORE="aiBoundary.privateMemory.v1",FORMAT="ai-boundary.encrypted-memory.v1",VAULT="ai-boundary.memory.v1",ROUNDS=260000;
const $=id=>document.getElementById(id);
let key=null,salt=null,state=null,revising=null,writeChain=Promise.resolve(),observedEnvelope=null,lastBackupEnvelope=null;
const utc=()=>new Date().toISOString(),uid=()=>crypto.randomUUID();
const encoder=new TextEncoder(),decoder=new TextDecoder();
function b64(bytes){let str="";for(let i=0;i<bytes.length;i+=4096)str+=String.fromCharCode(...bytes.subarray(i,i+4096));return btoa(str);}
function unb64(str){const raw=atob(str);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
function feedback(s){$("feedback").textContent=s;}
function stored(){try{return localStorage.getItem(STORE);}catch(e){return null;}}
function readEnvelope(raw){const e=JSON.parse(raw);if(e.format!==FORMAT||e.kdf!=="PBKDF2-SHA256"||e.cipher!=="AES-256-GCM"||e.iterations!==ROUNDS||typeof e.salt!=="string"||typeof e.iv!=="string"||typeof e.payload!=="string"||e.salt.length>80||e.iv.length>80||e.payload.length>1200000)throw Error("backup_format_invalid");return e;}
async function derive(password,derivedSalt){const material=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt:derivedSalt,iterations:ROUNDS},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);}
function fresh(){const at=utc();return {schema:VAULT,vaultId:uid(),revision:0,updatedAt:at,createdAt:at,memories:[],candidates:[],audit:[]};}
function migrateMeta(obj){if(obj.vaultId&&Number.isSafeInteger(obj.revision)&&obj.revision>=0)return false;obj.vaultId=uid();obj.revision=0;obj.updatedAt=obj.updatedAt||obj.createdAt||utc();return true;}
function validState(obj){return obj&&obj.schema===VAULT&&Array.isArray(obj.memories)&&Array.isArray(obj.candidates)&&Array.isArray(obj.audit)&&obj.memories.length<2500&&obj.candidates.length<10000&&obj.audit.length<30000;}
async function decryptEnvelope(e,password){const sl=unb64(e.salt),iv=unb64(e.iv);if(sl.length!==16||iv.length!==12)throw Error("bad_nonce");const k=await derive(password,sl);const plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv},k,unb64(e.payload));const parsed=JSON.parse(decoder.decode(plaintext));if(!validState(parsed))throw Error("invalid_vault");return {data:parsed,key:k,salt:sl};}
async function encryptCurrent(){if(!key||!state||!salt)throw Error("locked");const iv=crypto.getRandomValues(new Uint8Array(12));const raw=encoder.encode(JSON.stringify(state));if(raw.length>700000)throw Error("vault_too_large");const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,raw);return JSON.stringify({format:FORMAT,kdf:"PBKDF2-SHA256",cipher:"AES-256-GCM",iterations:ROUNDS,salt:b64(salt),iv:b64(iv),payload:b64(new Uint8Array(encrypted))});}
async function persist(){
 if(stored()!==observedEnvelope)throw Error("其他分頁已修改記憶庫，已停止寫入避免覆蓋。請先備份並重新開啟頁面。");
 if(!state.vaultId)migrateMeta(state);
 const r=state.revision,t=state.updatedAt;
 state.revision=r+1;state.updatedAt=utc();
 try{const value=await encryptCurrent();localStorage.setItem(STORE,value);observedEnvelope=value;}
 catch(e){state.revision=r;state.updatedAt=t;throw e;}
}
function showLocked(){key=null;salt=null;state=null;revising=null;observedEnvelope=null;lastBackupEnvelope=null;$("architectureHistoryList").replaceChildren();$("architectureHistoryCount").textContent="";$("workspace").hidden=true;$("lockedState").hidden=false;const exists=!!stored();$("lockTitle").textContent=exists?"解鎖本機加密記憶庫":"首次建立本機加密記憶庫";$("lockHint").textContent=exists?"輸入原密碼以讀取此瀏覽器中加密的記憶。密碼不會儲存在網站。":"設定至少 12 字元的密碼；忘記密碼便無法復原內容。請妥善保管加密備份。";$("confirmArea").hidden=exists;$("unlockButton").textContent=exists?"解鎖記憶庫":"建立記憶庫";$("passphrase").value="";$("confirmPassphrase").value="";}
function showOpen(){ $("lockedState").hidden=true;$("workspace").hidden=false;$("passphrase").value="";$("confirmPassphrase").value="";renderAll();}
$("unlockButton").addEventListener("click",async()=>{
 const pass=$("passphrase").value;
 if(!globalThis.crypto?.subtle){feedback("瀏覽器不支援安全加密，請使用新版 HTTPS 瀏覽器。");return;}
 const existing=stored();if(!existing&&(pass.length<12||pass!==$("confirmPassphrase").value)){feedback("首次建立需要至少 12 字元密碼，且兩次輸入相同。");return;}
 try{
  if(existing){const envelope=readEnvelope(existing);const unlocked=await decryptEnvelope(envelope,pass);state=unlocked.data;key=unlocked.key;salt=unlocked.salt;observedEnvelope=existing;
    if(migrateMeta(state)){await persist();feedback("舊版記憶庫已加入識別與版本資訊，請更新加密備份。");}
    else feedback("記憶庫解鎖成功。");
   }
  else{salt=crypto.getRandomValues(new Uint8Array(16));key=await derive(pass,salt);state=fresh();observedEnvelope=null;await persist();feedback("本機記憶庫已加密建立。請下載備份避免資料遺失。");}
  showOpen();
 }catch(e){key=null;salt=null;state=null;feedback(existing?"無法解鎖：密碼錯誤、資料已損毀或瀏覽器禁止存取。":"無法建立：儲存空間不足或瀏覽器拒絕存取。");}
});
$("lockButton").addEventListener("click",async()=>{await writeChain.catch(()=>{});showLocked();feedback("已鎖定記憶庫。");});
function evt(kind,ref,summary){state.audit.unshift({id:uid(),kind,ref,summary,at:utc()});}
function queueChange(action){writeChain=writeChain.catch(()=>{}).then(async()=>{if(!state)return;const backup=JSON.stringify(state);try{const msg=await action();await persist();feedback(msg||"變更已加密儲存。");renderAll();}catch(e){state=JSON.parse(backup);feedback("操作未儲存："+(e.message==="vault_too_large"?"記憶庫容量已滿；下載備份不會釋放空間。請暫停新增並等待封存／清理功能。":(e.message||"未知錯誤")));}});}
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
function appendText(parent,tag,cls,text){const e=node(tag,cls,text);parent.append(e);return e;}
function action(parent,title,callback,cls){const b=node("button",cls||"",title);b.type="button";b.addEventListener("click",callback);parent.append(b);return b;}
function fmtDate(s){try{return new Date(s).toLocaleString("zh-TW");}catch(e){return String(s);}}
const names={new_question:"提出新問題",revise_answer:"修正答案",revise_question:"修正問題",pitfall:"踩坑經驗"};
const levels={hypothesis:"假設／待驗證",fact:"事實",derived:"直接推導",inference:"推論",forecast:"條件預測"};
const sources={user:"使用者",GPT1:"GPT①（自填）",GPT2:"GPT②（自填）",BOT3:"BOT③（自填）",other:"其他（自填）"};
const parentOf=id=>state.memories.find(m=>m.id===id);
function renderSelectors(){const select=$("parentMemory"),value=select.value;select.replaceChildren(new Option("無／獨立主題",""));state.memories.forEach(m=>select.add(new Option(m.question.slice(0,72)+" · "+m.id.slice(0,8),m.id)));if([...select.options].some(x=>x.value===value))select.value=value;updateFormHint();}
function updateFormHint(){
 const type=$("eventType").value,parent=parentOf($("parentMemory").value);
 if(type==="revise_answer"){$("typeHint").textContent="修正答案必須選擇既有記憶，原問題與目的沿用該記憶；核准會追加版本。";if(parent){$("question").value=parent.question;$("purpose").value=parent.purpose;}}
 else if(type==="revise_question"){$("typeHint").textContent="修正問題必須選擇既有記憶；核准後另建關聯分支，原問題完整保留。";}
 else if(type==="pitfall"){$("typeHint").textContent="踩坑記憶請交代錯誤觸發情境、已確認與尚未確認的原因、修復方式和適用邊界。";}
 else{$("typeHint").textContent="提出新問題可關聯既有記憶，也可建立獨立新記憶。";}
}
$("eventType").addEventListener("change",updateFormHint);
$("parentMemory").addEventListener("change",updateFormHint);
function resetForm(){revising=null;$("candidateForm").reset();renderSelectors();$("eventType").value="new_question";$("proposer").value="user";$("evidenceLevel").value="hypothesis";updateFormHint();}
$("resetProposal").addEventListener("click",resetForm);
$("importReport").addEventListener("click",()=>$("reportInput").click());
$("reportInput").addEventListener("change",async e=>{
 const file=e.target.files&&e.target.files[0];e.target.value="";if(!file)return;
 try{
  if(file.size>250000)throw Error("檔案超過大小限制");
  const pkg=JSON.parse(await file.text());
  if(pkg.schema!=="ai-boundary.response.v0.1"||!pkg.source_command||
     typeof pkg.source_command.title!=="string"||typeof pkg.source_command.instructions!=="string"||
     typeof pkg.response_text!=="string"||!pkg.response_text.trim()||
     pkg.response_text.length>12000)throw Error("回報格式不符，或內容太長");
  resetForm();$("eventType").value="new_question";$("parentMemory").value="";
  $("question").value=pkg.source_command.title.slice(0,3000);
  $("purpose").value=(pkg.source_command.completion_criteria||pkg.source_command.instructions||"待使用者重新界定目的").slice(0,3000);
  $("content").value=pkg.response_text;
  $("reason").value="來源為發射器的 AI 人工回報；此為尚未完成記憶分類與事實驗證的候選草稿。";
  $("evidence").value="來源任務："+(pkg.source_command.task_ref||pkg.source_command.title)+"；AI 回報來源為人工聲稱，未獨立驗證。";
  const p=pkg.reported_by;
  $("proposer").value=p==="GPT①"?"GPT1":p==="GPT②"?"GPT2":p==="BOT③"?"BOT3":"other";
  $("evidenceLevel").value="hypothesis";updateFormHint();
  selectTab("propose");feedback("已從回報 JSON 填入未提交的候選草稿，請人工檢查與分類後再提交。");
 }catch(error){feedback("AI 回報匯入失敗："+error.message);}
});
function norm(s){return String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();}
function semantic(s){return norm(s).toLocaleLowerCase("zh-TW").replace(/[\s.,，。;；:：!?！？"'“”‘’、]+/g,"");}
function fingerprint(c){return [c.eventType,c.parentId||"",c.question,c.purpose,c.content,c.evidence,c.evidenceLevel,c.reason].map(norm).join("\u241f");}
function coreKey(c){return [c.eventType,c.parentId||"",c.question,c.content].map(semantic).join("\u241f");}
function validateCandidate(c){
 const parent=parentOf(c.parentId);
 if(["revise_answer","revise_question"].includes(c.eventType)&&!parent)return "修正答案或問題，必須選既有記憶。";
 if(c.eventType==="revise_answer"&&parent&&(c.question!==parent.question||c.purpose!==parent.purpose))return "修正答案不能改寫原問題或目的，請選擇修正問題。";
 if(!c.question||!c.purpose||!c.content||!c.reason)return "請完整填寫原問題、目的、內容與修正理由。";
 const prior=c.repairOf?state.candidates.find(x=>x.id===c.repairOf&&x.status==="rejected"):null;
 if(c.repairOf&&!prior)return "找不到被拒絕的原始候選。";
 if(prior&&fingerprint(c)===fingerprint(prior))return "原樣重新提交被拒絕內容，請先修改內容、證據或理由。";
 const match=state.candidates.find(x=>x.id!==c.id&&coreKey(x)===coreKey(c));
 if(match?.status==="pending")return "相同核心內容已有待審候選，請先處理舊提案。";
 if(match?.status==="rejected"&&!match.resolvedBy&&c.repairOf!==match.id)return "相同內容曾被拒絕（理由："+(match.review?.reason||"未記錄")+"）。請由該拒絕項目按「修正後重新提交」。";
 if(match?.status==="approved"&&c.eventType==="new_question")return "已有相同核心內容的已核准提案，請檢查是否應使用原記憶的答案修正。";
 if(c.eventType==="new_question"&&state.memories.some(m=>semantic(m.question)===semantic(c.question)&&semantic(m.versions.at(-1)?.content)===semantic(c.content)))return "已有相同問題與內容的已核准記憶，請勿重複建立。";
 return null;
}
$("candidateForm").addEventListener("submit",e=>{
 e.preventDefault();
 const c={id:uid(),eventType:$("eventType").value,parentId:$("parentMemory").value||null,question:$("question").value.trim(),purpose:$("purpose").value.trim(),content:$("content").value.trim(),evidence:$("evidence").value.trim(),reason:$("reason").value.trim(),proposer:$("proposer").value,evidenceLevel:$("evidenceLevel").value,createdAt:utc(),status:"pending",repairOf:revising,review:null};
 const problem=validateCandidate(c);if(problem){feedback(problem);return;}
 if(c.eventType==="new_question"&&state.memories.some(m=>semantic(m.question)===semantic(c.question))&&!confirm("記憶庫已有相同問題。確定要另外建立新問題，而不是修正既有答案？"))return;
 queueChange(()=>{const again=validateCandidate(c);if(again)throw Error(again);
 state.candidates.unshift(c);evt("candidate.created",c.id,names[c.eventType]+"・"+c.question.slice(0,56));resetForm();selectTab("review");return "候選已加密儲存，等待你的審核。";});
});
function reviewApproval(c){
 const parent=parentOf(c.parentId);
 if(["revise_answer","revise_question"].includes(c.eventType)&&!parent){feedback("原記憶不存在，無法核准此修正。");return;}
 if(c.eventType==="revise_answer"&&parent&&(c.question!==parent.question||c.purpose!==parent.purpose)){feedback("問題或目的與原版不同，須另建分支。");return;}
 if(c.proposer!=="user"&&["revise_answer","revise_question"].includes(c.eventType)){
  if(c.eventType==="revise_answer"){
   if(!confirm("此為其他 AI 的答案修訂。目前系統無法驗證原提出者回覆。只有你確實向原提出者核對，並確認問題與目的都不變，才能追加答案版本。是否已人工核對完成？"))return;
  }else{
   if(!confirm("此為其他 AI 提出的問題修訂；核准將另建分支，原問題不會覆蓋。請確認已檢查語意差異及來源，是否繼續？"))return;
  }
 }
 if(!confirm("核准後會新增本機權威版本或記憶分支並保留歷史。確定核准？"))return;
 queueChange(()=>{
  if(c.status!=="pending")throw Error("此提案已被審核。");
  const when=utc(),v={number:1,content:c.content,evidence:c.evidence,reason:c.reason,evidenceLevel:c.evidenceLevel,source:c.proposer,candidateId:c.id,approvedAt:when};
  if(c.eventType==="revise_answer"){
   const m=parentOf(c.parentId);v.number=m.versions.length+1;m.versions.push(v);evt("memory.revised",m.id,"修正答案・版本 "+v.number+"・"+m.question.slice(0,56));
  }else{
   const relation=c.eventType==="revise_question"?"question_revision":c.eventType==="new_question"?"new_branch":"pitfall";
   const m={id:uid(),question:c.question,purpose:c.purpose,parentId:c.parentId,relation,createdAt:when,versions:[v]};
   state.memories.unshift(m);evt("memory.created",m.id,names[c.eventType]+"・"+m.question.slice(0,56));
  }
  c.status="approved";c.review={action:"approved",reason:"使用者在本機手動核准",at:when,verifiedBy:"user_local_manual"};
  evt("candidate.approved",c.id,"候選核准・"+c.question.slice(0,56));
  if(c.repairOf){const old=state.candidates.find(x=>x.id===c.repairOf);if(old&&old.status==="rejected"){old.resolvedBy=c.id;evt("candidate.repaired",old.id,"已修復拒絕項目・"+old.question.slice(0,56));}}
  return "候選已由你人工核准；原始版本與審核事件均保留在本機加密庫。";
 });
}
function reviewRejection(c){const reason=prompt("請輸入拒絕理由，以及原提出者需要修正的方向：");if(reason===null)return;if(!reason.trim()){feedback("拒絕必須說明理由。");return;}if(reason.length>4000){feedback("拒絕理由過長。");return;}
 queueChange(()=>{if(c.status!=="pending")throw Error("已審核");c.status="rejected";c.review={action:"rejected",reason:reason.trim(),at:utc(),verifiedBy:"user_local_manual"};evt("candidate.rejected",c.id,"已拒絕："+reason.slice(0,70));return "拒絕原因已加密儲存；可再修正後重新提交。";});
}
function repair(c){revising=c.id;selectTab("propose");$("eventType").value=c.eventType;renderSelectors();$("parentMemory").value=c.parentId||"";updateFormHint();$("question").value=c.question;$("purpose").value=c.purpose;$("content").value=c.content;$("evidence").value=c.evidence;$("reason").value=c.reason;$("proposer").value=c.proposer;$("evidenceLevel").value=c.evidenceLevel;$("typeHint").textContent="正在修復候選 "+c.id.slice(0,8)+"。請修改內容或理由；新提案會保留與原拒絕版本的關聯。";window.scrollTo({top:0,behavior:"smooth"});}
function exportJSON(obj,filename){const blob=new Blob([JSON.stringify(obj,null,2)],{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportCandidate(c){if(!confirm("將匯出「未加密」的單一候選 JSON，可能含個人資料。請確認內容與分享對象。"))return;
 exportJSON({schema:"ai-boundary.candidate-handoff.v1",exportedAt:utc(),delivery:"manual_not_sent",candidate:c}, "candidate-"+c.id.slice(0,8)+".json");feedback("單一候選已匯出，尚未自動交給其他 AI。");
}
function renderReviews(){const box=$("reviewList");box.replaceChildren();const cs=[...state.candidates].sort((a,b)=> (a.status==="pending"?0:a.status==="rejected"?1:2)-(b.status==="pending"?0:b.status==="rejected"?1:2));if(!cs.length){box.append(node("div","empty","尚無候選。先在「提交候選」新增一份。"));return;}
 for(const c of cs){const card=node("article","card");const top=appendText(card,"div","tags");appendText(top,"span","pill",names[c.eventType]||c.eventType);appendText(top,"span","pill "+(c.status==="pending"?"warn":""),c.status==="pending"?"待審":c.status==="approved"?"已核准":c.resolvedBy?"已修復／結案":"已拒絕・待修復");appendText(card,"h3","",c.question);appendText(card,"p","small","提出者："+(sources[c.proposer]||c.proposer)+"｜證據層級："+(levels[c.evidenceLevel]||c.evidenceLevel)+"｜"+fmtDate(c.createdAt));
 appendText(card,"p","",c.content);appendText(card,"p","small","目的："+c.purpose);
 const more=node("details");appendText(more,"summary","","依據、修正理由與關聯");
 appendText(more,"p","","修正理由："+c.reason);
 appendText(more,"p","","證據／未知："+(c.evidence||"未提供"));
 if(c.parentId)appendText(more,"p","small","來源記憶："+c.parentId);
 if(c.repairOf)appendText(more,"p","small","修復原候選："+c.repairOf);
 if(c.review)appendText(more,"p","small","審核："+c.review.action+"；理由："+c.review.reason+"；"+fmtDate(c.review.at));
 card.append(more);
 const buttons=appendText(card,"div","actions");
 if(c.status==="pending"){action(buttons,"核准並保留版本",()=>reviewApproval(c),"primary");action(buttons,"拒絕並寫理由",()=>reviewRejection(c),"danger");}
 if(c.status==="rejected"&&!c.resolvedBy)action(buttons,"修正後重新提交",()=>repair(c));
 action(buttons,"匯出此候選 JSON",()=>exportCandidate(c));
 box.append(card);
 }
}
function renderMemories(){const box=$("memoryList");box.replaceChildren();if(!state.memories.length){box.append(node("div","empty","尚無已核准記憶。核准候選後將在這裡保留版本。"));return;}
 for(const m of state.memories){const card=node("article","card");const top=appendText(card,"div","tags");
 appendText(top,"span","pill",m.relation==="question_revision"?"修正問題分支":m.relation==="new_branch"?"新問題／延伸":m.relation==="pitfall"?"踩坑教訓":"原主題");
 appendText(top,"span","pill","版本 "+m.versions.length);
 appendText(card,"h3","",m.question);appendText(card,"p","small","目的："+m.purpose+(m.parentId?"｜父記憶："+m.parentId.slice(0,8):""));
 const latest=m.versions[m.versions.length-1];appendText(card,"p","",latest.content);
 const d=node("details");appendText(d,"summary","","完整版本與證據（舊版不覆蓋）");
 for(const v of [...m.versions].reverse()){appendText(d,"h3","","版本 "+v.number+"・"+fmtDate(v.approvedAt));appendText(d,"p","",v.content);appendText(d,"p","small","修正理由："+v.reason+"｜來源："+(sources[v.source]||v.source)+"｜證據層級："+(levels[v.evidenceLevel]||v.evidenceLevel));appendText(d,"p","small","證據："+(v.evidence||"未提供"));}card.append(d);box.append(card);
 }
}
function localDay(ts){const d=new Date(ts),pad=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function renderDiff(){const box=$("auditList");box.replaceChildren();const date=$("dateFilter").value,events=state.audit.filter(x=>!date||localDay(x.at)===date);
 $("diffSummary").textContent=(date?date+"｜":"全部日期｜")+events.length+" 筆事件；新增 "+events.filter(x=>x.kind==="memory.created").length+"、答案修正 "+events.filter(x=>x.kind==="memory.revised").length+"、拒絕 "+events.filter(x=>x.kind==="candidate.rejected").length+"、修復 "+events.filter(x=>x.kind==="candidate.repaired").length+"。";
 if(!events.length){box.append(node("div","empty","這段期間沒有記憶事件。"));return;}
 for(const e of events.slice(0,300)){const row=node("div","card");appendText(row,"span","small",fmtDate(e.at)+" · "+e.kind+" · "+e.ref.slice(0,8));appendText(row,"p","",e.summary);box.append(row);}
}
$("dateFilter").addEventListener("change",renderDiff);
function renderAll(){if(!state)return;
 const info=$("vaultMetadata");if(info)info.textContent="本機記憶庫："+state.vaultId+"｜版本 "+state.revision+"｜儲存 "+fmtDate(state.updatedAt);
 $("countMemories").textContent=String(state.memories.length);$("countPending").textContent=String(state.candidates.filter(c=>c.status==="pending").length);$("countRejected").textContent=String(state.candidates.filter(c=>c.status==="rejected"&&!c.resolvedBy).length);renderSelectors();renderReviews();renderMemories();renderDiff();}
const tabs=[...document.querySelectorAll("[data-tab]")];
function selectTab(name){for(const t of tabs){const on=t.dataset.tab===name;t.setAttribute("aria-selected",String(on));t.tabIndex=on?0:-1;$("tab-"+t.dataset.tab).hidden=!on;}}
tabs.forEach((t,i)=>{t.addEventListener("click",()=>selectTab(t.dataset.tab));t.addEventListener("keydown",e=>{if(!["ArrowRight","ArrowLeft"].includes(e.key))return;e.preventDefault();const next=tabs[(i+(e.key==="ArrowRight"?1:tabs.length-1))%tabs.length];next.focus();selectTab(next.dataset.tab);});});
async function downloadBackup(){await writeChain.catch(()=>{});const raw=stored();if(!raw){feedback("本機找不到加密記憶庫。");return;}
 exportJSON(JSON.parse(raw),"mainbrain-memory-encrypted-"+new Date().toISOString().slice(0,10)+".json");lastBackupEnvelope=raw;feedback("已觸發加密備份下載，請確定檔案存在於裝置後才進行覆蓋還原。");}
$("exportBackup").addEventListener("click",downloadBackup);$("saveBackupTop").addEventListener("click",downloadBackup);
$("restoreBackup").addEventListener("click",()=>{$("backupInput").click();});$("importLocked").addEventListener("click",()=>{$("backupInput").click();});
$("backupInput").addEventListener("change",async e=>{
 const f=e.target.files[0];e.target.value="";if(!f)return;
 try{
  if(f.size>1200000)throw Error("too_large");
  const raw=await f.text(),env=readEnvelope(raw);
  const pass=prompt("請輸入這份加密備份的原始密碼。密碼僅用於此裝置本次解密：");if(pass===null)return;
  const decoded=await decryptEnvelope(env,pass);
  await writeChain.catch(()=>{});
  const previous=stored();
  if(previous&&!state){feedback("這台裝置已有記憶庫，請先解鎖並下載目前備份才能還原。");return;}
  if(previous&&previous!==observedEnvelope){feedback("偵測到其他分頁已更新記憶庫。為避免覆蓋，請重新開啟並解鎖。");return;}
  if(previous){
   if(lastBackupEnvelope!==previous){feedback("請先點擊「下載加密備份」並確認檔案保存成功，才可覆蓋目前記憶。");return;}
   const older=decoded.data.vaultId===state.vaultId&&Number.isSafeInteger(decoded.data.revision)&&decoded.data.revision<=state.revision;
   const different=!decoded.data.vaultId||decoded.data.vaultId!==state.vaultId;
   const warning=different?"備份來自其他／無識別碼的記憶庫。":older?"此備份的版次不比目前新版，可能回滾你的歷史。":"此備份將完整取代目前記憶，不會自動合併。";
   if(!confirm(warning+"\n現有："+state.vaultId+"（修訂 "+state.revision+"）"+
     "\n備份："+(decoded.data.vaultId||"舊格式／未知")+"（修訂 "+(decoded.data.revision??"未知")+"）"+
     "\n確定已保留本機目前的加密備份，要繼續嗎？"))return;
   if(prompt("此動作會整庫覆蓋，確認已保留舊備份請輸入「確認覆蓋」：")!=="確認覆蓋")return;
  }
  localStorage.setItem(STORE,raw);
  key=decoded.key;salt=decoded.salt;state=decoded.data;observedEnvelope=raw;lastBackupEnvelope=null;
  if(migrateMeta(state))await persist();
  showOpen();feedback("已按你的明確確認還原本機加密備份；尚未合併不同版本。");
 }catch(err){feedback("還原失敗：密碼不符、檔案格式錯誤、資料過大或儲存空間受限；原本記憶庫未更動。");}
});

/* GPT① memory handoff: manual local import, encrypted audit, contextual recall. */
const workflowCore=globalThis.MemoryWorkflowCore;
let latestRecall=[];
$("importMemoryPack").addEventListener("click",()=>{if(!state){feedback("請先解鎖記憶庫。");return;}$("memoryPackInput").click();});
$("memoryPackInput").addEventListener("change",async e=>{
 const file=e.target.files?.[0];e.target.value="";if(!file)return;
 if(!state){feedback("請先解鎖記憶庫。");return;}
 try{
  if(file.size>250000)throw Error("檔案超過250KB");
  if(!workflowCore)throw Error("記憶匯入模組尚未載入");
  const pack=JSON.parse(await file.text());
  const plan=workflowCore.planImport(pack,state);
  if(!plan.accepted.length){feedback("沒有新增候選；重複 "+plan.duplicated.length+" 筆。");return;}
  const msg="匯入 "+plan.accepted.length+" 筆待審候選，跳過重複 "+plan.duplicated.length+" 筆，偵測同題不同內容 "+plan.conflicts.length+" 筆（只新增候選，絕不覆寫原記憶）。是否繼續？";
  if(!confirm(msg))return;
  queueChange(()=>{
   const next=workflowCore.planImport(pack,state);
   if(next.accepted.length!==plan.accepted.length)throw Error("資料已變動，請重新選檔檢查");
   for(const {item,possibleConflictWith} of next.accepted){
    const c={id:uid(),originId:item.id,eventType:"new_question",parentId:null,
      question:item.question,purpose:item.purpose,content:item.content,
      evidence:item.evidence,reason:item.reason+(possibleConflictWith.length?"；同題不同版本需人工比較："+possibleConflictWith.join(","):""),
      proposer:"GPT1",evidenceLevel:item.evidenceLevel||"hypothesis",
      createdAt:utc(),status:"pending",repairOf:null,review:null};
    const problem=validateCandidate(c);if(problem)throw Error(problem);
    state.candidates.unshift(c);evt("candidate.created",c.id,"GPT①記憶包 "+item.id+"・"+c.question.slice(0,50));
   }
   evt("memory.pack_imported",pack.schema,"新增 "+next.accepted.length+" 筆，跳過 "+next.duplicated.length+" 筆，待人工比較 "+next.conflicts.length+" 筆");
   selectTab("review");
   return "已加密匯入 "+next.accepted.length+" 筆待審候選；無核心記憶覆寫。";
  });
 }catch(err){feedback("記憶包匯入失敗："+err.message);}
});
function workflowRender(){
 const box=$("workflowList");box.replaceChildren();
 if(!state)return;
 const all=workflowCore.processLatest(state.audit);
 const statuses={queued:"待交接",received:"已接收",in_progress:"進行中",blocked:"阻塞／未完成",refused:"被拒絕",review:"待驗收",done:"已完成"};
 const summary=appendText(box,"p","small","已記錄任務："+all.length+"；未完成／阻塞："+all.filter(x=>x.status!=="done").length+"；拒絕："+all.filter(x=>x.status==="refused").length);
 for(const x of all.slice(0,30)){
  const row=node("div","card");appendText(row,"b","",x.taskTitle+" · "+x.ref);
  appendText(row,"p","small",x.actor+"｜"+(statuses[x.status]||x.status)+"｜"+fmtDate(x.at));
  if(x.reason)appendText(row,"p","small","證據／原因："+x.reason);
  if(x.nextAction)appendText(row,"p","small","下一步："+x.nextAction);
  box.append(row);
 }
 if(!all.length)appendText(box,"p","small","尚無人工交接的三方任務紀錄。");
}
$("workflowSave").addEventListener("click",()=>{
 if(!state)return;
 const ref=$("workflowId").value.trim(),taskTitle=$("workflowTitle").value.trim();
 const actor=$("workflowActor").value,status=$("workflowStatus").value;
 const reason=$("workflowReason").value.trim(),nextAction=$("workflowNext").value.trim();
 if(!ref||!taskTitle||!reason||!nextAction){feedback("請完整填寫任務ID、標題、證據／原因、下一步。");return;}
 if(!confirm("將這筆任務進度加密保存至本機記憶庫。此操作不代表其他AI已實際接收或完成任務。確定？"))return;
 queueChange(()=>{
  state.audit.unshift({id:uid(),kind:"workflow.recorded",ref,taskTitle,actor,status,reason,nextAction,at:utc(),summary:taskTitle+"｜"+status});
  workflowRender();
  return "任務進度已加密保存，舊版本仍保留在事件歷史。";
 });
});
$("workflowCopy").addEventListener("click",async()=>{
 if(!state)return;
 const all=workflowCore.processLatest(state.audit).filter(x=>x.status!=="done");
 const out="主腦三方未完成與拒絕摘要（人工匯出，請檢查是否含私人資料）\n"+
 all.map(x=>[x.ref,x.taskTitle,x.actor,x.status,"原因："+x.reason,"下一步："+x.nextAction].join("｜")).join("\n");
 if(!confirm("將把未完成與拒絕紀錄複製到系統剪貼簿，可能含私人內容；請確認分享對象。"))return;
 try{await navigator.clipboard.writeText(out);feedback("已複製未完成／拒絕摘要，尚未送給其他AI。");}catch(err){feedback("無法複製，請確認瀏覽器剪貼簿權限。");}
});
function recallRender(){
 const box=$("recallResults");box.replaceChildren();
 if(!state||!workflowCore)return;
 const query=$("recallQuery").value.trim();
 latestRecall=workflowCore.recall(query,state,7);
 if(!latestRecall.length){appendText(box,"p","small","未找到相符記憶。可能尚未核准、未匯入或用詞不同。");return;}
 const labels={approved:"已核准",pending:"待審候選",rejected:"被拒絕"};
 for(const x of latestRecall){
  const row=node("div","card");appendText(row,"b","",x.title);
  appendText(row,"p","small","狀態："+(labels[x.type]||x.type)+"｜來源ID："+x.id);
  appendText(row,"p","small",x.content.slice(0,1500));
  if(x.evidence)appendText(row,"p","small","證據／原因："+x.evidence.slice(0,700));
  box.append(row);
 }
}
$("recallRun").addEventListener("click",recallRender);
let recallTimer=null;
$("recallQuery").addEventListener("input",()=>{
 clearTimeout(recallTimer);
 recallTimer=setTimeout(()=>{if(state)recallRender();},450);
});
$("workflowTitle").addEventListener("blur",()=>{
 if(!state||!workflowCore)return;
 const title=$("workflowTitle").value.trim();
 if(title.length<2)return;
 $("recallQuery").value=title;
 recallRender();
});
$("recallQuery").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();recallRender();}});
$("recallCopy").addEventListener("click",async()=>{
 if(!state||!latestRecall.length){feedback("請先搜尋相關記憶。");return;}
 if(!confirm("將回溯結果複製到系統剪貼簿；請確認是否包含私人資訊，再交給其他AI。"))return;
 const txt=latestRecall.map(x=>"【"+x.type+"】"+x.title+"\n"+x.content+"\n來源："+x.id+"\n證據："+x.evidence).join("\n\n");
 try{await navigator.clipboard.writeText(txt);feedback("已複製回溯摘要，未自動發送。");}catch(err){feedback("無法複製，請檢查剪貼簿權限。");}
});
/* Architecture governance lens: read-only views of already decrypted, locally approved/rejected records. */
const ARCH_PREFIX="【主腦架構】";
let architecturePageSize=60;
function isArchitecture(item){return item && typeof item.question==="string" && item.question.startsWith(ARCH_PREFIX);}
function architectureHistoryRender(){
 const box=$("architectureHistoryList");box.replaceChildren();
 if(!state || $("architectureHistoryWrap").hidden)return;
 const mode=$("architectureFilter").value;
 const candidates=(state.candidates||[]).filter(isArchitecture);
 const memories=(state.memories||[]).filter(isArchitecture);
 const rows=[];
 for(const c of candidates){
  const revised=c.eventType==="revise_answer"||c.eventType==="revise_question"||!!c.repairOf||!!c.resolvedBy;
  if(mode==="rejected" && c.status!=="rejected" && !c.repairOf && !c.resolvedBy)continue;
  if(mode==="corrected"&&!revised)continue;
  if(mode==="pending"&&c.status!=="pending")continue;
  if(mode==="approved"&&c.status!=="approved")continue;
  rows.push({type:"candidate",at:c.createdAt||"",ref:c.id,entry:c});
 }
 for(const m of memories){
  if(mode==="rejected"||mode==="pending")continue;
  const revised=m.relation==="question_revision"||(Array.isArray(m.versions)&&m.versions.length>1);
  if(mode==="corrected"&&!revised)continue;
  rows.push({type:"memory",at:m.createdAt||"",ref:m.id,entry:m});
 }
 rows.sort((a,b)=>b.at.localeCompare(a.at)||a.ref.localeCompare(b.ref));
 $("architectureHistoryCount").textContent="共找到 "+rows.length+" 項（架構候選 "+candidates.length+" 筆、已核准架構主題 "+memories.length+" 筆）。目前僅顯示前 "+Math.min(rows.length,architecturePageSize)+" 項；所有核准與否決仍依原庫版本保存。";
 if(!rows.length){box.append(node("div","empty","沒有符合條件的架構紀錄。可先在架構導覽匯出待審記憶包，再於提交候選頁人工匯入；未匯入的草稿不會出現在這裡。"));return;}
 for(const x of rows.slice(0,architecturePageSize)){
  const item=x.entry,card=node("article","card");
  if(x.type==="candidate"){
   const stateLabel=item.status==="pending"?"待審":item.status==="rejected"?"被拒絕":item.status==="approved"?"已核准":"未知";
   appendText(card,"b","",item.question);
   appendText(card,"p","small","候選 "+item.id+"｜"+stateLabel+"｜"+fmtDate(item.createdAt));
   appendText(card,"p","small","提出者："+(sources[item.proposer]||item.proposer||"未知")+"（人工標示）｜事件："+(names[item.eventType]||item.eventType));
   if(item.review)appendText(card,"p","small","人工審核："+(item.review.action||"未知")+"；理由："+(item.review.reason||"未提供")+"；時間："+fmtDate(item.review.at));
   if(item.repairOf)appendText(card,"p","small","修復原拒絕 ID："+item.repairOf);
   if(item.resolvedBy)appendText(card,"p","small","後續修復候選 ID："+item.resolvedBy);
   if(item.parentId)appendText(card,"p","small","來源架構記憶 ID："+item.parentId);
   const d=node("details");appendText(d,"summary","","展開完整候選內容、證據與修正理由");
   appendText(d,"p","",item.content||"");appendText(d,"p","small","來源／證據："+(item.evidence||"無"));
   appendText(d,"p","small","提出／修正理由："+(item.reason||"無"));
   card.append(d);
  } else {
   appendText(card,"b","",item.question);
   appendText(card,"p","small","核准架構 "+item.id+"｜"+(Array.isArray(item.versions)?item.versions.length:0)+" 個版本｜"+fmtDate(item.createdAt));
   if(item.parentId)appendText(card,"p","small","父記憶 ID："+item.parentId+"｜分支："+item.relation);
   for(const v of [...(item.versions||[])].reverse()){
    const d=node("details");appendText(d,"summary","","版本 "+v.number+"｜"+fmtDate(v.approvedAt)+"｜來源候選 "+(v.candidateId||"未知"));
    appendText(d,"p","",v.content||"");appendText(d,"p","small","來源："+(sources[v.source]||v.source||"未知")+"（來源聲稱）");
    appendText(d,"p","small","依據："+(v.evidence||"無")+"｜修正原因："+(v.reason||"無"));card.append(d);
   }
  }
  box.append(card);
 }
 if(rows.length>architecturePageSize){
  const more=node("button","", "再顯示 "+Math.min(60,rows.length-architecturePageSize)+" 項");more.type="button";
  more.addEventListener("click",()=>{architecturePageSize+=60;architectureHistoryRender();});box.append(more);
 }
}
$("architectureFilter").addEventListener("change",()=>{architecturePageSize=60;architectureHistoryRender();});
$("toggleArchitectureHistory").addEventListener("click",()=>{
 const wrap=$("architectureHistoryWrap");wrap.hidden=!wrap.hidden;
 $("toggleArchitectureHistory").setAttribute("aria-expanded",String(!wrap.hidden));
 $("toggleArchitectureHistory").textContent=wrap.hidden?"顯示架構歷史":"隱藏架構歷史";
 if(!wrap.hidden)architectureHistoryRender();
});
$("jumpArchitectureReview").addEventListener("click",()=>{selectTab("review");});
const originalRenderAll=renderAll;
renderAll=function(){originalRenderAll();workflowRender();architectureHistoryRender();};

$("dateFilter").value=localDay(utc());
showLocked();selectTab("overview");
})();