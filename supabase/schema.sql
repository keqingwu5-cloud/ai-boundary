-- =====================================================================
-- AI 認知邊界 · Supabase schema（Dashboard → SQL Editor 整份貼上 → Run；可重複執行）
-- 編輯者名單已預填 Merlin 的 email（keqingwu5@gmail.com，比對時不分大小寫）；bot 帳號可以照最下面的範例再加。
-- =====================================================================
create table if not exists public.brain_editors (
  email      text primary key check (email = lower(email) and email like '%@%'),
  note       text,
  created_at timestamptz not null default now()
);
insert into public.brain_editors (email, note) values ('keqingwu5@gmail.com', 'Merlin') on conflict (email) do nothing;

-- 共享大腦：一個實體一列（kind = brain | node | link | concept | pattern | meta），data 跟 localStorage['aiBrain.v1'] 裡的物件一樣。
-- 兩台裝置改不同節點互不影響；同一個節點以最後寫入者為準。刪除＝墓碑（deleted = true），離線裝置才不會把它復活。
create table if not exists public.brain_entities (
  graph_id   text        not null default 'main',
  kind       text        not null check (kind in ('brain','node','link','concept','pattern','meta')),
  id         text        not null check (length(id) between 1 and 200),
  data       jsonb       check (data is null or pg_column_size(data) < 262144),
  deleted    boolean     not null default false,
  updated_by uuid        default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (graph_id, kind, id)
);
-- 🕘 生長紀錄：只增不減，hkey（ts＋action＋payload 雜湊）去重
create table if not exists public.brain_history (
  graph_id   text        not null default 'main',
  hkey       text        not null check (length(hkey) <= 200),
  ts         bigint      not null,
  action     text        not null check (length(action) <= 40),
  payload    jsonb       not null default '{}'::jsonb check (pg_column_size(payload) < 16384),
  actor      uuid        default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (graph_id, hkey)
);

create or replace function public.brain_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists brain_entities_touch on public.brain_entities;
create trigger brain_entities_touch before insert or update on public.brain_entities for each row execute function public.brain_touch();

-- 編輯者＝JWT 裡的 email 在 brain_editors，而且這個帳號的 email 已經驗證過（magic link 登入就會驗證）。
-- security definer：用戶端讀不到 brain_editors 這張表，只能問「我是不是編輯者」。
create or replace function public.is_brain_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.brain_editors e join auth.users u on u.id = auth.uid()
    where e.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and lower(u.email) = e.email and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_brain_editor() from public;
grant execute on function public.is_brain_editor() to anon, authenticated;

-- ---------- Row Level Security ----------
alter table public.brain_editors  enable row level security;   -- 沒有任何 policy：用戶端不能讀也不能寫，只能在 SQL Editor 管理
alter table public.brain_entities enable row level security;
alter table public.brain_history  enable row level security;
revoke all on public.brain_editors from anon, authenticated;

drop policy if exists "brain read"           on public.brain_entities;
drop policy if exists "brain insert editors" on public.brain_entities;
drop policy if exists "brain update editors" on public.brain_entities;
create policy "brain read"           on public.brain_entities for select to anon, authenticated using (true);
create policy "brain insert editors" on public.brain_entities for insert to authenticated with check (public.is_brain_editor());
create policy "brain update editors" on public.brain_entities for update to authenticated using (public.is_brain_editor()) with check (public.is_brain_editor());
-- 沒有 delete policy：刪除一律寫墓碑。

drop policy if exists "history read"           on public.brain_history;
drop policy if exists "history insert editors" on public.brain_history;
create policy "history read"           on public.brain_history for select to anon, authenticated using (true);
create policy "history insert editors" on public.brain_history for insert to authenticated with check (public.is_brain_editor());

revoke all on public.brain_entities, public.brain_history from anon, authenticated;
grant select on public.brain_entities, public.brain_history to anon, authenticated;
grant insert, update on public.brain_entities to authenticated;
grant insert on public.brain_history to authenticated;

-- 種子：不用在這裡塞資料。第一位「編輯者」登入打開網站時，雲端如果是空的，會自動把種子資料整份上傳。
-- 之後要加人（例如 bot 帳號）：insert into public.brain_editors (email, note) values ('radar-bot@example.com', 'AI 邊界雷達');
-- 移除：delete from public.brain_editors where email = '…';
