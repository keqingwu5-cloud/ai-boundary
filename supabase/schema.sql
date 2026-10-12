-- =====================================================================
-- AI 認知邊界 · Supabase schema（Dashboard → SQL Editor 整份貼上 → Run；可重複執行）
-- P0 保護基線（2026-10-12，依《主腦與 World Flow Map 共用架構設計稿 v1》§6、§9、§11）：
--   1. 私人讀取：brain_entities／brain_history／brain_proposals／brain_revisions 只有「該 graph 的編輯者」讀得到；匿名（anon）完全不能讀寫。
--      未登入的公開網站只用網站內建的靜態資料（data.js），不連雲端資料。
--   2. 版本化寫入：每個實體有 version（內容版本）。用戶端不能直接 insert／update brain_entities，只能呼叫 brain_apply()；
--      每筆修改帶「我是根據哪個版本改的」（base），跟雲端目前版本不同 → 不覆寫，回報 conflict（等同 API 的 409），
--      並把被擋下的內容存進 brain_proposals（status = conflict），保留可查閱，由人決定。
--   3. 修訂只增不減：每次接受的修改在 brain_revisions 留下前後內容。
-- 編輯者名單已預填 Merlin 的 email（keqingwu5@gmail.com，比對時不分大小寫）。
-- ⚠ P0 不要把 BOT 帳號加進 brain_editors：編輯者可以直接寫入正式資料；BOT 只能提案（P1 的提案／人工審核 API）。
-- ⚠ 這份檔案未在正式 Supabase 執行；要套用請由 Merlin 決定（會移除匿名讀取，已部署的公開唯讀雲端會變成需要登入）。
-- =====================================================================
create table if not exists public.brain_editors (
  email      text primary key check (email = lower(email) and email like '%@%'),
  note       text,
  created_at timestamptz not null default now()
);
-- graph 範圍：null ＝ 所有 graph（Merlin）；否則只能讀寫列出的 graph_id
alter table public.brain_editors add column if not exists graph_ids text[];
insert into public.brain_editors (email, note) values ('keqingwu5@gmail.com', 'Merlin') on conflict (email) do nothing;

-- 共享大腦：一個實體一列（kind = brain | node | link | concept | pattern | meta），data 跟 localStorage['aiBrain.v1'] 裡的物件一樣。
-- 刪除＝墓碑（deleted = true），離線裝置才不會把它復活。version 每次被接受的修改 +1。
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
alter table public.brain_entities add column if not exists version bigint not null default 1;
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
-- 被擋下的修改（版本衝突）：保留原內容，可查閱；status：conflict → accepted（人決定以自己的版本覆蓋）／rejected（人決定保留雲端版本）
create table if not exists public.brain_proposals (
  id              bigint generated always as identity primary key,
  graph_id        text        not null,
  kind            text        not null,
  entity_id       text        not null,
  base_version    bigint,
  current_version bigint,
  patch           jsonb       check (patch is null or pg_column_size(patch) < 262144),
  deleted         boolean     not null default false,
  status          text        not null default 'conflict' check (status in ('conflict','held','accepted','rejected')),
  actor           uuid        default auth.uid(),
  created_at      timestamptz not null default now(),
  decided_by      uuid,
  decided_at      timestamptz
);
create index if not exists brain_proposals_open on public.brain_proposals (graph_id, status);
-- 修訂紀錄：只增不減（沒有 update／delete 權限）
create table if not exists public.brain_revisions (
  graph_id    text        not null,
  kind        text        not null,
  entity_id   text        not null,
  version     bigint      not null,
  before      jsonb,
  after       jsonb,
  deleted     boolean     not null default false,
  proposal_id bigint,
  actor       uuid        default auth.uid(),
  created_at  timestamptz not null default now(),
  primary key (graph_id, kind, entity_id, version)
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
-- 指定 graph 的編輯者（graph_ids 為 null ＝ 全部 graph）
create or replace function public.is_graph_editor(p_graph text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.brain_editors e join auth.users u on u.id = auth.uid()
    where e.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and lower(u.email) = e.email and u.email_confirmed_at is not null
      and (e.graph_ids is null or p_graph = any (e.graph_ids))
  );
$$;
revoke all on function public.is_brain_editor() from public, anon;
revoke all on function public.is_graph_editor(text) from public, anon;
grant execute on function public.is_brain_editor() to authenticated;
grant execute on function public.is_graph_editor(text) to authenticated;

-- ---------- 版本化寫入：brain_apply(graph, ops) ----------
-- ops：[{ kind, id, data, deleted, base, resolves? }]；base ＝ 這筆修改根據的雲端版本（新實體為 null）。
-- 每筆各自判斷（不同節點互不影響），整個呼叫在同一個交易裡：
--   雲端內容已經跟這筆一樣         → applied（冪等：重送不會變成衝突，也不會多一個版本）
--   base = 雲端目前 version         → applied，version + 1，寫 brain_revisions
--   meta 的字串陣列（種子紀錄）     → 聯集合併後 applied（種子紀錄只增不減，跟用戶端 putEntity 相同）
--   其他（雲端已被別人改過）        → 不覆寫；存進 brain_proposals（conflict），回傳 conflicts
-- 回傳 { applied:[{kind,id,version}], conflicts:[{kind,id,base,current,proposal_id,data,deleted}] }
create or replace function public.brain_apply(p_graph text, p_ops jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  op jsonb; k text; i text; base bigint; del boolean; d jsonb; res jsonb; cur public.brain_entities%rowtype; pid bigint; nv bigint; rid bigint;
  applied jsonb := '[]'::jsonb; conflicts jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_graph_editor(p_graph) then
    raise exception 'permission denied: not an editor of graph %', p_graph using errcode = '42501';
  end if;
  if p_graph is null or length(p_graph) not between 1 and 100 or jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) > 500 then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  for op in select value from jsonb_array_elements(p_ops) loop
    k := op ->> 'kind'; i := op ->> 'id';
    del := coalesce((op ->> 'deleted')::boolean, false);
    d := case when del then null else op -> 'data' end;
    base := case when jsonb_typeof(op -> 'base') = 'number' then (op ->> 'base')::bigint else null end;
    rid := case when jsonb_typeof(op -> 'resolves') = 'number' then (op ->> 'resolves')::bigint else null end;
    if k is null or k not in ('brain','node','link','concept','pattern','meta') or i is null or length(i) not between 1 and 200
       or (not del and (d is null or jsonb_typeof(d) = 'null')) then
      raise exception 'invalid op' using errcode = '22023';
    end if;
    res := null;
    select * into cur from public.brain_entities e where e.graph_id = p_graph and e.kind = k and e.id = i for update;
    if not found then
      if base is null then
        insert into public.brain_entities (graph_id, kind, id, data, deleted, version) values (p_graph, k, i, d, del, 1)
          on conflict (graph_id, kind, id) do nothing;
        if found then
          insert into public.brain_revisions (graph_id, kind, entity_id, version, before, after, deleted, proposal_id) values (p_graph, k, i, 1, null, d, del, rid);
          res := jsonb_build_object('kind', k, 'id', i, 'version', 1);
        end if;
      end if;
      if res is null then   -- 同時被別人建立，或 base 指向不存在的列
        select * into cur from public.brain_entities e where e.graph_id = p_graph and e.kind = k and e.id = i for update;
      end if;
    end if;
    if res is null and cur.id is not null then
      if cur.deleted = del and cur.data is not distinct from d then
        res := jsonb_build_object('kind', k, 'id', i, 'version', cur.version);
      elsif base is not distinct from cur.version
         or (k = 'meta' and not del and not cur.deleted and jsonb_typeof(d) = 'array' and jsonb_typeof(cur.data) = 'array') then
        if k = 'meta' and base is distinct from cur.version then   -- 種子紀錄：聯集
          select coalesce(jsonb_agg(distinct x order by x), '[]'::jsonb) into d from (select jsonb_array_elements(cur.data) x union select jsonb_array_elements(d)) s;
        end if;
        nv := cur.version + 1;
        update public.brain_entities e set data = d, deleted = del, version = nv where e.graph_id = p_graph and e.kind = k and e.id = i;
        insert into public.brain_revisions (graph_id, kind, entity_id, version, before, after, deleted, proposal_id) values (p_graph, k, i, nv, cur.data, d, del, rid);
        res := jsonb_build_object('kind', k, 'id', i, 'version', nv);
      end if;
    end if;
    if res is not null then
      if rid is not null then
        update public.brain_proposals p set status = 'accepted', decided_by = auth.uid(), decided_at = now()
          where p.id = rid and p.graph_id = p_graph and p.status in ('conflict','held');
      end if;
      applied := applied || jsonb_build_array(res);
    else
      insert into public.brain_proposals (graph_id, kind, entity_id, base_version, current_version, patch, deleted)
        values (p_graph, k, i, base, cur.version, d, del) returning id into pid;
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('kind', k, 'id', i, 'base', base, 'current', cur.version, 'proposal_id', pid,
        'data', cur.data, 'deleted', cur.deleted));
    end if;
  end loop;
  return jsonb_build_object('applied', applied, 'conflicts', conflicts);
end $$;
-- 人決定「保留雲端版本」：把衝突提案標成 rejected（內容仍保留可查）
create or replace function public.brain_reject_proposal(p_graph text, p_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_graph_editor(p_graph) then
    raise exception 'permission denied: not an editor of graph %', p_graph using errcode = '42501';
  end if;
  update public.brain_proposals p set status = 'rejected', decided_by = auth.uid(), decided_at = now()
    where p.id = p_id and p.graph_id = p_graph and p.status in ('conflict','held');
  return found;
end $$;
revoke all on function public.brain_apply(text, jsonb) from public, anon;
revoke all on function public.brain_reject_proposal(text, bigint) from public, anon;
grant execute on function public.brain_apply(text, jsonb) to authenticated;
grant execute on function public.brain_reject_proposal(text, bigint) to authenticated;

-- ---------- Row Level Security ----------
alter table public.brain_editors   enable row level security;   -- 沒有任何 policy：用戶端不能讀也不能寫，只能在 SQL Editor 管理
alter table public.brain_entities  enable row level security;
alter table public.brain_history   enable row level security;
alter table public.brain_proposals enable row level security;
alter table public.brain_revisions enable row level security;

-- 舊版（PR #2 草稿）的 policy：匿名可讀、編輯者可直接 insert／update → 全部移除
drop policy if exists "brain read"           on public.brain_entities;
drop policy if exists "brain insert editors" on public.brain_entities;
drop policy if exists "brain update editors" on public.brain_entities;
drop policy if exists "history read"           on public.brain_history;
drop policy if exists "history insert editors" on public.brain_history;
drop policy if exists "brain read editors"     on public.brain_entities;
drop policy if exists "history read editors"   on public.brain_history;
drop policy if exists "proposals read editors" on public.brain_proposals;
drop policy if exists "revisions read editors" on public.brain_revisions;

create policy "brain read editors"     on public.brain_entities  for select to authenticated using (public.is_graph_editor(graph_id));
create policy "history read editors"   on public.brain_history   for select to authenticated using (public.is_graph_editor(graph_id));
create policy "history insert editors" on public.brain_history   for insert to authenticated with check (public.is_graph_editor(graph_id));
create policy "proposals read editors" on public.brain_proposals for select to authenticated using (public.is_graph_editor(graph_id));
create policy "revisions read editors" on public.brain_revisions for select to authenticated using (public.is_graph_editor(graph_id));
-- brain_entities 沒有 insert／update／delete policy：只能透過 brain_apply()（版本檢查）寫入；刪除一律寫墓碑。

revoke all on public.brain_editors, public.brain_entities, public.brain_history, public.brain_proposals, public.brain_revisions from anon, authenticated;
grant select on public.brain_entities, public.brain_history, public.brain_proposals, public.brain_revisions to authenticated;
grant insert on public.brain_history to authenticated;

-- 之後要加人（只限真人編輯者）：insert into public.brain_editors (email, note) values ('someone@example.com', '說明');
-- 只允許某個 graph：insert into public.brain_editors (email, note, graph_ids) values ('someone@example.com', '說明', array['main']);
-- 移除：delete from public.brain_editors where email = '…';
