import {
 defaultManifest,validateManifest,draftMessage,resolveInbound,resolveOutbound,
 receiptDecision,transition,CONNECTOR_SCHEMA
} from "./tcvl-transfer-contract.mjs";

const $=id=>document.getElementById(id);
const DIRECTIONS=["inbound","outbound"];
const PRESETS={
 "gpt-1":{connector_id:"gpt1-manual",display_name:"GPT①｜研究與整理",provider:"AI role (manual only)"},
 "gpt-2":{connector_id:"gpt2-manual",display_name:"GPT②｜反證審查",provider:"AI role (manual only)"},
 "bot-3":{connector_id:"bot3-manual",display_name:"BOT③｜測試回報",provider:"AI role (manual only)"},
 "custom":{connector_id:"external-planned",display_name:"新的外部接口",provider:"custom"}
};
let maps={inbound:[],outbound:[]};
const safe=x=>String(x||"").trim();
function selectedEvents(select){
 return [...select.options].filter(x=>x.selected).map(x=>x.value);
}
function fillEvents(select,values){
 for(const option of select.options)option.selected=values.includes(option.value);
}
function setForm(direction,cfg){
 $(direction+"Enabled").checked=cfg.enabled;
 $(direction+"Mode").value=cfg.mode;
 $(direction+"Schema").value=cfg.payload_schema;
 $(direction+"Failure").value=cfg.on_failure;
 $(direction+"Max").value=String(cfg.max_bytes);
 $(direction+"Verify").checked=cfg.require_source_verification;
 $(direction+"Approval").checked=cfg.require_human_approval;
 $(direction+"Receipt").checked=cfg.require_receipt;
 fillEvents($(direction+"Event"),cfg.allowed_event_types);
 maps[direction]=cfg.field_map.map(x=>({...x}));renderMappings(direction);
}
function applyPreset(){
 const p=PRESETS[$("profile").value];
 $("connectorId").value=p.connector_id;
 $("connectorName").value=p.display_name;
 $("provider").value=p.provider;
 const m=defaultManifest(p.connector_id,p.display_name,p.provider);
 for(const dir of DIRECTIONS)setForm(dir,m[dir]);
 update();
}
function readConfig(dir){
 const mode=$(dir+"Mode").value;
 const max=Number($(dir+"Max").value);
 return {
  enabled:$(dir+"Enabled").checked,mode,
  payload_schema:$(dir+"Schema").value,
  allowed_event_types:selectedEvents($(dir+"Event")),
  require_source_verification:$(dir+"Verify").checked,
  require_human_approval:$(dir+"Approval").checked,
  require_receipt:$(dir+"Receipt").checked,
  max_bytes:max,field_map:maps[dir].map(x=>({...x})),
  retry:{max_attempts:0,backoff_seconds:60},
  on_failure:$(dir+"Failure").value
 };
}
function readManifest(){
 const m=defaultManifest(safe($("connectorId").value),safe($("connectorName").value),safe($("provider").value));
 m.inbound=readConfig("inbound");
 m.outbound=readConfig("outbound");
 m.status=m.inbound.enabled||m.outbound.enabled?"configured":"planned";
 return m;
}
function addMap(dir){
 const source=safe($(dir+"Source").value),target=safe($(dir+"Target").value);
 if(!source||!target){
  $("status").textContent="請先填寫 "+(dir==="inbound"?"接收":"送出")+" 的來源與目標欄位。";return
 }
 if(maps[dir].length>=12){$("status").textContent="每個方向最多 12 組欄位對應。";return}
 if(maps[dir].some(x=>x.source===source||x.target===target)){
  $("status").textContent="同方向欄位來源或目標不可重複。";return
 }
 maps[dir].push({source,target});
 $(dir+"Source").value="";$(dir+"Target").value="";
 renderMappings(dir);update();
}
function renderMappings(dir){
 const el=$(dir+"Mapping");el.replaceChildren();
 if(maps[dir].length===0){
  const desc=document.createElement("p");desc.className="mini";desc.textContent="尚未定義欄位對應；系統仍會檢查基本訊息 ID 和任務關聯。";el.append(desc);return;
 }
 maps[dir].forEach((entry,i)=>{
  const row=document.createElement("div");row.className="mapItem";
  const label=document.createElement("small");label.textContent=entry.source+" → "+entry.target;
  const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent="移除";
  button.addEventListener("click",()=>{maps[dir].splice(i,1);renderMappings(dir);update()});
  row.append(label,button);el.append(row);
 });
}
function update(){
 const m=readManifest();const errors=validateManifest(m);
 for(const direction of DIRECTIONS){
  const cfg=m[direction],el=$(direction+"Status");
  el.textContent=cfg.enabled?(cfg.mode==="manual"?"人工操作待審":"網路自動執行尚未允許"):
    cfg.mode==="manual"?"未啟用":"未接通／僅設計";
 }
 $("preview").textContent=JSON.stringify({manifest:m,validation:{valid:errors.length===0,errors},automatic_delivery:false},null,2);
 return {m,errors};
}
function setResult(message){$("status").textContent=message}
function validate(){
 const {m,errors}=update();
 setResult(errors.length?"規格需要修正："+errors.join("、"):
  "通過格式檢查；接收／送出規則彼此獨立。沒有實際送達或外部接口驗收。");
}
function simulate(){
 const {m,errors}=update();
 if(errors.length){setResult("無法模擬：請先修正 "+errors.join("、"));return}
 const uuid=()=>crypto.randomUUID();
 const messages=DIRECTIONS.map(direction=>{
  const type=m[direction].allowed_event_types[0];
  return draftMessage({
   message_id:uuid(),correlation_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
   project_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
   task_id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
   connector_id:m.connector_id,direction,event_type:type,payload_schema:m[direction].payload_schema,
   created_at:new Date().toISOString(),payload:{demo:true,purpose:"用虛構資料檢查雙向規格"},attempt:0
  });
 });
 const decisions=messages.map((x,i)=>!x.ok?{decision:"invalid",errors:x.errors}:
   (DIRECTIONS[i]==="inbound"?resolveInbound(m.inbound,x.value):resolveOutbound(m.outbound,x.value)));
 const forged=receiptDecision({previous_status:"sent",next_status:"accepted",
   receipt_message_id:uuid(),correlation_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
   claimed_source:"Unverified external model",verified_source:false});
 $("preview").textContent=JSON.stringify({
  demonstration_only:true,connector_id:m.connector_id,
  inbound:{requested:m.inbound,preview:decisions[0]},
  outbound:{requested:m.outbound,preview:decisions[1]},
  spoofed_receipt_example:{status:"不接受未驗證身分的收件回執",result:forged},
  stop_example:{requested:"stop_requested",remote_stopped:false},
  transmission_performed:false,live_api_connected:false
 },null,2);
 setResult("已跑完虛構資料的雙向預檢：未傳送、未接收、未連線。未驗證的回執會被拒絕。");
}
function exportManifest(){
 const {m,errors}=update();
 if(errors.length){setResult("不能匯出無效的規格："+errors.join("、"));return}
 const blob=new Blob([JSON.stringify(m,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob);
 const link=document.createElement("a");
 link.download="tcvl-connector-"+m.connector_id+".json";link.href=url;
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1100);
 setResult("已啟動下載 "+m.connector_id+" 的雙向設計規格。它不是能直接執行的 API 金鑰設定。");
}
for(const direction of DIRECTIONS){
 $(direction+"Add").addEventListener("click",()=>addMap(direction));
 for(const suffix of ["Enabled","Mode","Schema","Event","Verify","Approval","Receipt","Max","Failure"]){
  $(direction+suffix).addEventListener("change",update);
 }
}
$("profile").addEventListener("change",applyPreset);
for(const name of ["connectorId","connectorName","provider"])$(name).addEventListener("input",update);
$("validate").addEventListener("click",validate);
$("simulate").addEventListener("click",simulate);
$("export").addEventListener("click",exportManifest);
$("reset").addEventListener("click",()=>{applyPreset();setResult("已還原所選接口的雙向規格。")});
applyPreset();
setResult("先設定接收與送出，再按「檢查雙向規格」。所有網路傳輸預設為關閉。");
