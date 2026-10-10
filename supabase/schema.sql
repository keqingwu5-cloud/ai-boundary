-- =====================================================================
-- AI 認知邊界 · Supabase schema（在 Supabase Dashboard → SQL Editor 整份貼上執行；可重複執行）
-- =====================================================================
-- 設計：
--   brain_entities  共享大腦，一個「實體」一列：kind = brain | node | link | concept | pattern | meta
--                   data 是該實體的 JSON（跟 localStorage['aiBrain.v1'] 裡的物件一模一樣），
--                   deleted = 墓碑（刪除也要同步，離線的裝置才不會把它復活）。
--                   兩台裝置改「不同節點」不會互相覆蓋；改「同一個節點」以最後寫入者為準（version 每次 +1）。
--   brain_history   生長紀錄，只增不減；hkey 去重（同一筆紀錄重複上傳不會變兩筆）。
--   user_feed_marks 每個使用者自己的喜歡／收藏（一個節點一列）。
--   user_knowledge  每個使用者自己的知識掌握度（一份 jsonb）。
-- 權限（RLS）：
--   共享大腦：任何人（包含未登入）都可以讀；只有登入的使用者可以寫；不能真的 DELETE（只能寫墓碑）。
--   個人資料：只有本人可以讀寫。
-- graph_id 預設 'main'，之後要開第二顆獨立的大腦只要換 graph_id（前端 config.js 的 GRAPH_ID）。
-- =====================================================================

create table if not exists public.brain_entities (
  graph_id   text        not null default 'main',
  kind       text        not null check (kind in ('brain','node','link','concept','pattern','meta')),
  id         text        not null check (length(id) between 1 and 200),
  data       jsonb,
  deleted    boolean     not null default false,
  version    bigint      not null default 1,
  created_by text,                                   -- 'seed' | 'merlin' | 'bot'（取自 data.createdBy，方便篩選）
  updated_by uuid        default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (graph_id, kind, id),
  constraint brain_entities_data_size check (data is null or pg_column_size(data) < 262144)
);
create index if not exists brain_entities_updated_idx on public.brain_entities (graph_id, updated_at);

create table if not exists public.brain_history (
  graph_id   text        not null default 'main',
  hkey       text        not null,
  ts         bigint      not null,
  action     text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  actor      uuid        default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (graph_id, hkey)
);
create index if not exists brain_history_ts_idx on public.brain_history (graph_id, ts);

create table if not exists public.user_feed_marks (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  node_id    text        not null,
  liked_at   bigint,                                 -- ms epoch，null = 沒按喜歡
  saved_at   bigint,                                 -- ms epoch，null = 沒收藏
  updated_at timestamptz not null default now(),
  primary key (user_id, node_id)
);

create table if not exists public.user_knowledge (
  user_id    uuid        primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- 自動欄位：version / updated_at / updated_by / created_by ----------
create or replace function public.brain_entities_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  else
    new.version := 1;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.created_by := coalesce(new.data->>'createdBy', new.created_by, case when tg_op = 'UPDATE' then old.created_by end);
  return new;
end $$;
drop trigger if exists brain_entities_touch on public.brain_entities;
create trigger brain_entities_touch before insert or update on public.brain_entities
  for each row execute function public.brain_entities_touch();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists user_feed_marks_touch on public.user_feed_marks;
create trigger user_feed_marks_touch before insert or update on public.user_feed_marks
  for each row execute function public.touch_updated_at();
drop trigger if exists user_knowledge_touch on public.user_knowledge;
create trigger user_knowledge_touch before insert or update on public.user_knowledge
  for each row execute function public.touch_updated_at();

-- ---------- Row Level Security ----------
alter table public.brain_entities  enable row level security;
alter table public.brain_history   enable row level security;
alter table public.user_feed_marks enable row level security;
alter table public.user_knowledge  enable row level security;

drop policy if exists "brain read (everyone)"        on public.brain_entities;
drop policy if exists "brain insert (signed in)"     on public.brain_entities;
drop policy if exists "brain update (signed in)"     on public.brain_entities;
create policy "brain read (everyone)"    on public.brain_entities for select to anon, authenticated using (true);
create policy "brain insert (signed in)" on public.brain_entities for insert to authenticated with check (true);
create policy "brain update (signed in)" on public.brain_entities for update to authenticated using (true) with check (true);
-- 沒有 delete policy：刪除一律寫墓碑（deleted = true），service role 不受 RLS 限制，可以手動清理。

drop policy if exists "history read (everyone)"      on public.brain_history;
drop policy if exists "history insert (signed in)"   on public.brain_history;
create policy "history read (everyone)"    on public.brain_history for select to anon, authenticated using (true);
create policy "history insert (signed in)" on public.brain_history for insert to authenticated with check (true);

drop policy if exists "marks owner" on public.user_feed_marks;
create policy "marks owner" on public.user_feed_marks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "knowledge owner" on public.user_knowledge;
create policy "knowledge owner" on public.user_knowledge for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.brain_entities, public.brain_history to anon, authenticated;
grant insert, update on public.brain_entities to authenticated;
grant insert on public.brain_history to authenticated;
grant select, insert, update, delete on public.user_feed_marks, public.user_knowledge to authenticated;

-- ---------- Realtime ----------
-- 共享大腦與歷程、個人喜歡／收藏開啟 Realtime（RLS 一樣有效：個人資料只會推給本人）。
do $$
declare t text;
begin
  foreach t in array array['brain_entities','brain_history','user_feed_marks'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
alter table public.brain_entities  replica identity full;
alter table public.user_feed_marks replica identity full;

-- ---------- 種子 ----------
-- 不需要在這裡塞資料：第一個「登入」的使用者打開網站時，如果 brain_entities 是空的，
-- 前端會把目前的種子資料（data.js 的 QUESTIONS + SEED_EXTRAS + SEED_PATCHES + SEED_MEDIA，加上那台裝置的本機修改）整份上傳。
-- 之後 data.js 新增的種子（新的 SEED_EXTRAS / SEED_PATCHES / SEED_MEDIA）會在登入使用者下次載入時，
-- 用跟本機一樣的 migrate() 規則補進雲端（只做加法，使用者／bot 改過的內容不動）。

-- ---------- （選用，強烈建議）只允許指定的人寫入 ----------
-- 上面的規則是「任何登入的人都能寫」。GitHub 登入人人都能註冊，所以正式使用前建議改成白名單：
-- 1) 取消下面整段註解並執行；2) 在 Authentication → Users 找到 Merlin／bot 的 user id，
--    insert into public.brain_editors(user_id, note) values ('<uuid>', 'merlin');
--
-- create table if not exists public.brain_editors (user_id uuid primary key references auth.users(id) on delete cascade, note text);
-- alter table public.brain_editors enable row level security;
-- drop policy if exists "editors read self" on public.brain_editors;
-- create policy "editors read self" on public.brain_editors for select to authenticated using (user_id = auth.uid());
-- drop policy if exists "brain insert (signed in)"   on public.brain_entities;
-- drop policy if exists "brain update (signed in)"   on public.brain_entities;
-- drop policy if exists "history insert (signed in)" on public.brain_history;
-- create policy "brain insert (editors)"   on public.brain_entities for insert to authenticated with check (exists (select 1 from public.brain_editors e where e.user_id = auth.uid()));
-- create policy "brain update (editors)"   on public.brain_entities for update to authenticated using (exists (select 1 from public.brain_editors e where e.user_id = auth.uid())) with check (exists (select 1 from public.brain_editors e where e.user_id = auth.uid()));
-- create policy "history insert (editors)" on public.brain_history  for insert to authenticated with check (exists (select 1 from public.brain_editors e where e.user_id = auth.uid()));
