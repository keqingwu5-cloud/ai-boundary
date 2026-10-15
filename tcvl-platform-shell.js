/* Shared UI controls; localStorage contains only display preferences and custom status labels, never tasks or chats. */
(function(){
"use strict";
const KEY="tcvl.publicUiSettings.v1",core=globalThis.TcvlPlatformCore;
const defaults={images:"standard",fit:"contain",customStatuses:[]};
function read(){
 try{
  const raw=localStorage.getItem(KEY);
  if(!raw||raw.length>12000)return {...defaults};
  const d=JSON.parse(raw);
  if(!d||!["standard","simplified","hidden"].includes(d.images)||!["contain","cover"].includes(d.fit))return {...defaults};
  const statuses=Array.isArray(d.customStatuses)?d.customStatuses:[];
  if(core)core.registry(statuses);
  return {images:d.images,fit:d.fit,customStatuses:statuses};
 }catch(e){return {...defaults}}
}
let prefs=read();
function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));return true}catch(e){return false}}
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
function choose(select,items){for(const [value,label]of items){const o=el("option",label);o.value=value;select.append(o)}}
function render(){
 const css=document.createElement("style");
 css.textContent=[
 "#tcvlSharedBar{display:flex;flex-wrap:wrap;gap:7px;align-items:center;padding:10px 12px;background:#17243e;border-bottom:1px solid #536c95;color:#edf5ff;font:13px/1.5 system-ui,-apple-system,sans-serif;position:relative;z-index:20}",
 "#tcvlSharedBar a{color:#e1edff;text-decoration:none;border:1px solid #657da2;border-radius:8px;padding:5px 8px}",
 "#tcvlSharedBar button,#tcvlSharedSettings button{font:inherit;border:1px solid #7792b7;border-radius:8px;background:#314f77;color:#fff;padding:6px 11px;cursor:pointer}",
 "#tcvlSharedSettings{color:#edf5ff;background:#14233c;border:1px solid #607a9f;border-radius:12px;padding:16px;max-width:790px;margin:12px auto;font:13px/1.7 system-ui,-apple-system,sans-serif}",
 "#tcvlSharedSettings[hidden],#tcvlLiveNotice[hidden]{display:none!important}",
 "#tcvlSharedSettings label{display:block;margin:8px 0 4px;color:#dfebff}",
 "#tcvlSharedSettings select,#tcvlSharedSettings input{width:100%;background:#0c1a30;color:white;border:1px solid #6d83a9;padding:9px;border-radius:8px;font:inherit}",
 "#tcvlSharedSettings .tcvl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}",
 "#tcvlSharedSettings .tcvl-info{color:#bed0e9;font-size:12px;margin:5px 0}",
 "#tcvlLiveNotice{background:#3c3026;border:1px solid #d1a76c;color:#fff0cc;border-radius:11px;padding:12px;margin:9px;font:13px/1.7 system-ui,-apple-system,sans-serif}",
 "body[data-tcvl-images=hidden] img:not([data-essential]){visibility:hidden!important}",
 "body[data-tcvl-images=simplified] img:not([data-essential]){filter:grayscale(1)!important;opacity:.55!important}",
 "body[data-tcvl-fit=contain] img:not([data-essential]){object-fit:contain}",
 "body[data-tcvl-fit=cover] img:not([data-essential]){object-fit:cover}"
 ].join("\n");
 document.head.append(css);
 const nav=el("nav");nav.id="tcvlSharedBar";nav.setAttribute("aria-label","TCVL 共用平台入口");
 const brand=el("strong","TCVL｜共同平台");brand.style.marginRight="auto";nav.append(brand);
 for(const [name,href]of [["主腦首頁","./mainbrain.html#workspace"],["專案治理","./governance-board.html"],["架構圖","./architecture-hub.html"],["發射器","./launcher.html"],["回溯","./traceback-visual.html"],["記憶審核","./memory.html"]]){const a=el("a",name);a.href=href;nav.append(a)}
 const toggle=el("button","狀態／圖片設定");toggle.type="button";toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-controls","tcvlSharedSettings");nav.append(toggle);
 const panel=el("section");panel.id="tcvlSharedSettings";panel.hidden=true;
 const heading=el("h2","共用設定");heading.style.fontSize="18px";heading.style.margin="0";panel.append(heading);
 const info=el("p","只儲存圖片顯示偏好與自訂狀態名稱，不儲存專案、聊天與加密記憶。請勿在狀態名稱輸入私人資訊。");info.className="tcvl-info";panel.append(info);
 const grid=el("div");grid.className="tcvl-grid";
 function field(title,options){const col=el("div"),label=el("label",title),input=el("select");choose(input,options);col.append(label,input);grid.append(col);return input}
 const imageSelect=field("圖片顯示",[["standard","標準"],["simplified","淡化／簡化"],["hidden","隱藏"]]);imageSelect.value=prefs.images;
 const fitSelect=field("圖片填滿方式",[["contain","顯示完整"],["cover","裁切填滿"]]);fitSelect.value=prefs.fit;
 const statusCol=el("div"),statusLabel=el("label","新增任務狀態選項"),statusInput=el("input");statusInput.maxLength=48;statusInput.placeholder="例如：等待外部核對";
 statusCol.append(statusLabel,statusInput);
 const baseLabel=el("label","對應基礎類別"),baseSelect=el("select");if(core)choose(baseSelect,core.DEFAULT_STATUSES.map(s=>[s.id,s.label]));
 statusCol.append(baseLabel,baseSelect);grid.append(statusCol);panel.append(grid);
 const add=el("button","新增狀態"),list=el("div"),feedback=el("p");add.type="button";feedback.className="tcvl-info";list.className="tcvl-info";feedback.setAttribute("role","status");
 panel.append(add,list,feedback);
 const attention=el("div");attention.id="tcvlLiveNotice";attention.hidden=true;attention.setAttribute("role","alert");
 document.body.prepend(panel);document.body.prepend(attention);document.body.prepend(nav);
 function apply(){document.body.dataset.tcvlImages=prefs.images;document.body.dataset.tcvlFit=prefs.fit}
 function listStatuses(){
  list.replaceChildren();
  if(!core)return;
  list.append(el("p","基礎選項："+core.DEFAULT_STATUSES.map(s=>s.label).join("、")));
  for(const item of prefs.customStatuses){
   const row=el("div",item.label+"（類別："+core.DEFAULT_STATUSES.find(x=>x.id===item.base)?.label+"） ");
   const remove=el("button","移除");remove.type="button";remove.addEventListener("click",()=>{prefs.customStatuses=prefs.customStatuses.filter(x=>x.id!==item.id);save();listStatuses();document.dispatchEvent(new Event("tcvl:statuses-updated"))});row.append(remove);list.append(row);
  }
 }
 imageSelect.addEventListener("change",()=>{prefs.images=imageSelect.value;apply();feedback.textContent=save()?"已套用圖片偏好。":"僅本頁有效，儲存失敗。"});
 fitSelect.addEventListener("change",()=>{prefs.fit=fitSelect.value;apply();feedback.textContent=save()?"已套用圖片版面。":"僅本頁有效，儲存失敗。"});
 add.addEventListener("click",()=>{
  try{
   const value=statusInput.value.trim();if(!value||value.length>48)throw Error("狀態名稱應為 1 至 48 個字");
   if(!core)throw Error("缺少共用狀態核心");
   const id="custom_"+Date.now().toString(36)+"_"+(prefs.customStatuses.length+1);
   prefs.customStatuses=core.addCustomStatus(prefs.customStatuses,{id,label:value,base:baseSelect.value,note:"人工自訂；僅顯示與分類，不代表實際執行"});
   statusInput.value="";save();listStatuses();feedback.textContent="已新增共用狀態。";document.dispatchEvent(new Event("tcvl:statuses-updated"));
  }catch(e){feedback.textContent=e.message}
 });
 toggle.addEventListener("click",()=>{panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden))});
 document.addEventListener("tcvl:attention",event=>{
  const d=event.detail||{};
  attention.hidden=false;attention.textContent="需要處理｜原因："+String(d.reason||"未填寫")+"｜影響："+String(d.impact||"待評估")+"｜下一步："+String(d.next||"待補充");
  attention.tabIndex=-1;attention.focus();
 });
 apply();listStatuses();
 globalThis.TcvlPlatformShell={getStatuses:()=>core?core.registry(prefs.customStatuses):[],getSettings:()=>JSON.parse(JSON.stringify(prefs)),showSettings:()=>{panel.hidden=false;toggle.setAttribute("aria-expanded","true")}};
 document.dispatchEvent(new Event("tcvl:statuses-updated"));
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",render,{once:true});else render();
})();