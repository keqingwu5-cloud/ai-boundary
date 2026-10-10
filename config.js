/* 雲端同步設定（Supabase）。兩個值都是空的 → 網站完全跟以前一樣，只用這台裝置的 localStorage。
   設定方式見 README「☁️ 雲端即時同步（Supabase）」。anon key 本來就是公開的（權限由資料庫的 RLS 控管），可以 commit。
   ⚠ 絕對不要把 service_role key 放在這裡。 */
window.AI_BOUNDARY_CONFIG = {
  SUPABASE_URL: '',        // 例如 'https://abcdefghijkl.supabase.co'
  SUPABASE_ANON_KEY: '',   // Project Settings → API → anon public
  GRAPH_ID: 'main'         // 共享大腦的名字（brain_entities.graph_id）
};

/* 登入回跳（magic link / GitHub）的 token 放在網址 #access_token=…；feed.js 一載入就會改寫 #node=…，
   所以先把它收起來，交給 sync.js 在建立 Supabase client 前放回去。 */
(function(){ try { var h = location.hash || '';
  if (/(^#|&)(access_token|error_description|error_code)=/.test(h)){ sessionStorage.setItem('aiBrain.authHash', h); history.replaceState(null, '', location.pathname + location.search); }
} catch(e){} })();
