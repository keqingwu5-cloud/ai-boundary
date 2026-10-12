// AISync.ready／'aisync:ready'：停用、初始化失敗、逾時三種情況都要 resolve（不 reject、不卡住），事件只發一次。
// 啟用（真的登入流程）在 tests/mock-supabase.mjs 用假 Supabase 測；瀏覽器裡的停用／失敗在 tests/smoke.mjs 測。
import test from 'node:test';
import assert from 'node:assert/strict';
let n = 0;
function env(config){
  const et = new EventTarget(), events = [];
  const el = () => ({ style:{}, dataset:{}, classList:{ toggle(){}, contains:() => false, add(){}, remove(){} }, setAttribute(){}, getAttribute:() => null, appendChild(){}, insertBefore(){},
    querySelectorAll:() => [], contains:() => false, set onclick(_){}, set innerHTML(_){}, set textContent(_){} });
  const head = el(), body = el();
  globalThis.window = globalThis;
  globalThis.addEventListener = et.addEventListener.bind(et); globalThis.removeEventListener = et.removeEventListener.bind(et); globalThis.dispatchEvent = et.dispatchEvent.bind(et);
  globalThis.AI_BOUNDARY_CONFIG = config;
  delete globalThis.AISync; delete globalThis.AIBrain;
  globalThis.document = config.__noDom ? undefined : { head, body, createElement:el, querySelector:() => null, getElementById:() => null, addEventListener(){} };
  globalThis.localStorage = { getItem:() => null, setItem(){}, removeItem(){} }; globalThis.sessionStorage = globalThis.localStorage;
  try { Object.defineProperty(globalThis, 'navigator', { value:{ onLine:true }, configurable:true }); } catch(e){}
  addEventListener('aisync:ready', e => events.push(e.detail));
  return { events };
}
const load = () => import(new URL('../sync.js?t=' + (++n), import.meta.url).href);
const tick = ms => new Promise(r => setTimeout(r, ms));
const quiet = async fn => { const ce = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = ce; } };

test('停用（config 空白）：ready 立刻 resolve，事件發一次', async () => {
  const { events } = env({ SUPABASE_URL:'', SUPABASE_ANON_KEY:'' });
  await load();
  assert.equal(AISync.isReady, true);
  const v = await Promise.race([AISync.ready, tick(50).then(() => 'hang')]);
  assert.deepEqual(v, { enabled:false, status:'off', reason:'off', canWrite:false, user:null });
  await tick(10);
  assert.equal(events.length, 1); assert.deepEqual(events[0], v);
  dispatchEvent(new Event('online')); await tick(10); assert.equal(events.length, 1);   // 不會再發
});

test('初始化失敗：ready 還是 resolve（帶 error），狀態變成離線、不能寫', async () => {
  const { events } = env({ SUPABASE_URL:'https://x.supabase.co', SUPABASE_ANON_KEY:'k', __noDom:true });   // 沒有 document → 建 UI 時丟錯
  await quiet(async () => { await load(); const v = await Promise.race([AISync.ready, tick(2000).then(() => 'hang')]);
    assert.notEqual(v, 'hang');
    assert.equal(v.enabled, true); assert.equal(v.status, 'offline'); assert.equal(v.canWrite, false); assert.equal(v.reason, 'anon'); assert.ok(v.error);
    await tick(10); });
  assert.equal(events.length, 1); assert.equal(AISync.status(), 'offline'); assert.equal(AISync.canWrite(), false);
});

test('卡住（supabase.js 一直沒載完）：READY_TIMEOUT_MS 後 resolve，帶 timedOut', async () => {
  const { events } = env({ SUPABASE_URL:'https://x.supabase.co', SUPABASE_ANON_KEY:'k', READY_TIMEOUT_MS:150 });   // 假 DOM 的 <script> 永遠不會 onload
  await load();
  assert.equal(AISync.isReady, false);
  const v = await Promise.race([AISync.ready, tick(3000).then(() => 'hang')]);
  assert.notEqual(v, 'hang'); assert.equal(v.timedOut, true); assert.equal(v.enabled, true); assert.equal(v.status, 'syncing'); assert.equal(v.canWrite, false);
  await tick(10); assert.equal(events.length, 1);
});
