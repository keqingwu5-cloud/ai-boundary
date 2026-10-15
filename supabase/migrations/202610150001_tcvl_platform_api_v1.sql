-- Proposed migration only. NOT applied to the user's Supabase project.
-- TCVL v1 is per-user, with RLS for all records. No provider credentials live in this schema.
create extension if not exists pgcrypto;

create table if not exists public.tcvl_projects (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 100),
 settings jsonb not null default '{"notifications":{"rejection_alerts":true,"status_alerts":true},"image":{"aspect_ratio":"16:9","quality":"standard"},"ui":{"show_inbound":true,"show_outbound":true,"dim_inactive":true}}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id, owner_id)
);

create table if not exists public.tcvl_conversations (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 project_id uuid not null,
 title text not null check (char_length(title) between 1 and 160),
 goal text not null default '' check (char_length(goal)<=1200),
 status text not null default 'active' check(status in ('active','archived')),
 created_at timestamptz not null default now(),
 unique(id, project_id, owner_id),
 foreign key (project_id, owner_id) references public.tcvl_projects(id, owner_id) on delete cascade
);

create table if not exists public.tcvl_tasks (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 project_id uuid not null,
 conversation_id uuid,
 title text not null check(char_length(title) between 1 and 160),
 description text not null default '' check(char_length(description)<=3500),
 status text not null default 'queued' check(status in ('queued','running','stop_requested','stopped','completed','refused','failed')),
 progress jsonb not null default '{}'::jsonb,
 stop_requested_at timestamptz,
 stopped_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id, project_id, owner_id),
 foreign key (project_id, owner_id) references public.tcvl_projects(id, owner_id) on delete cascade,
 foreign key (conversation_id, project_id, owner_id) references public.tcvl_conversations(id, project_id, owner_id)
);

create table if not exists public.tcvl_connectors (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 connector_id text not null check(connector_id ~ '^[a-z0-9][a-z0-9_.-]{0,74}$'),
 display_name text not null check(char_length(display_name) between 1 and 150),
 provider text not null check(char_length(provider) between 1 and 120),
 capabilities text[] not null default array[]::text[] check(cardinality(capabilities) between 1 and 8),
 status text not null default 'planned' check(status in ('planned','configured','disabled','error')),
 last_verified_at timestamptz,
 created_at timestamptz not null default now(),
 unique(owner_id, connector_id)
);

create table if not exists public.tcvl_events (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null,
 task_id uuid,
 direction text not null default 'internal' check(direction in ('inbound','outbound','internal')),
 kind text not null check(kind in ('status','rejection','correction','validation','inbound','outbound')),
 actor_kind text not null default 'system' check(actor_kind in ('system','user','verified_connector','claimed_external')),
 details jsonb not null default '{}'::jsonb,
 recorded_at timestamptz not null default now(),
 foreign key (project_id, owner_id) references public.tcvl_projects(id, owner_id) on delete cascade,
 foreign key (task_id, project_id, owner_id) references public.tcvl_tasks(id, project_id, owner_id) on delete cascade
);
create index if not exists tcvl_task_owner_project_idx on public.tcvl_tasks(owner_id,project_id,created_at desc);
create index if not exists tcvl_event_owner_project_idx on public.tcvl_events(owner_id,project_id,recorded_at desc);
create index if not exists tcvl_conversation_owner_project_idx on public.tcvl_conversations(owner_id,project_id,created_at desc);

alter table public.tcvl_projects enable row level security;
alter table public.tcvl_conversations enable row level security;
alter table public.tcvl_tasks enable row level security;
alter table public.tcvl_connectors enable row level security;
alter table public.tcvl_events enable row level security;

create policy "tcvl_projects_user_only" on public.tcvl_projects
 for all to authenticated using (owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "tcvl_conversations_user_only" on public.tcvl_conversations
 for all to authenticated using (owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "tcvl_tasks_user_only" on public.tcvl_tasks
 for all to authenticated using (owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "tcvl_connectors_user_only" on public.tcvl_connectors
 for all to authenticated using (owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "tcvl_events_read_only" on public.tcvl_events
 for select to authenticated using (owner_id=auth.uid());

-- Security-definer narrow functions for atomic lifecycle changes with audit events.
-- A stop request is NOT proof that an external model stopped; future worker must acknowledge separately.
create or replace function public.tcvl_request_stop(p_task_id uuid)
returns public.tcvl_tasks
language plpgsql security definer set search_path = ''
as $$
declare v_task public.tcvl_tasks;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select * into v_task from public.tcvl_tasks where id=p_task_id and owner_id=auth.uid() for update;
 if not found then raise exception 'task not found or not owned'; end if;
 if v_task.status in ('queued','running') then
   update public.tcvl_tasks set status='stop_requested',stop_requested_at=now(),updated_at=now()
     where id=v_task.id returning * into v_task;
   insert into public.tcvl_events (owner_id,project_id,task_id,kind,direction,actor_kind,details)
     values(v_task.owner_id,v_task.project_id,v_task.id,'status','inbound','user',
       jsonb_build_object('action','stop_requested','note','executor_acknowledgement_pending'));
 end if;
 return v_task;
end; $$;

create or replace function public.tcvl_refuse_task(
 p_task_id uuid, p_reason text, p_impact text, p_next_action text
)
returns public.tcvl_tasks
language plpgsql security definer set search_path = ''
as $$
declare v_task public.tcvl_tasks;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 1800 or
    length(trim(coalesce(p_impact,''))) not between 1 and 1800 or
    length(trim(coalesce(p_next_action,''))) not between 1 and 1800 then
    raise exception 'reason, impact and next action required';
 end if;
 select * into v_task from public.tcvl_tasks where id=p_task_id and owner_id=auth.uid() for update;
 if not found then raise exception 'task not found or not owned'; end if;
 if v_task.status in ('completed','stopped','refused','failed') then
   raise exception 'cannot refuse terminal task';
 end if;
 update public.tcvl_tasks set status='refused',updated_at=now() where id=v_task.id returning * into v_task;
 insert into public.tcvl_events(owner_id,project_id,task_id,kind,direction,actor_kind,details)
   values(v_task.owner_id,v_task.project_id,v_task.id,'rejection','inbound','user',
    jsonb_build_object('reason',trim(p_reason),'impact',trim(p_impact),
      'next_action',trim(p_next_action),'attention_required',true));
 return v_task;
end; $$;

-- Task insert audit; this only logs the fact a local task was created, not remote delivery.
create or replace function public.tcvl_task_audit_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 insert into public.tcvl_events(owner_id,project_id,task_id,kind,direction,actor_kind,details)
  values(new.owner_id,new.project_id,new.id,'status','inbound','user',
    jsonb_build_object('action','created','delivery','not_sent'));
 return new;
end; $$;
create trigger tcvl_after_task_insert after insert on public.tcvl_tasks
 for each row execute function public.tcvl_task_audit_insert();

-- Restrict writes that could forge delivery, online status, or audit records.
revoke all on public.tcvl_events from anon, authenticated;
grant select on public.tcvl_events to authenticated;
revoke all on public.tcvl_connectors from anon, authenticated;
grant select on public.tcvl_connectors to authenticated;
grant insert(owner_id,connector_id,display_name,provider,capabilities) on public.tcvl_connectors to authenticated;
revoke all on public.tcvl_tasks from anon, authenticated;
grant select on public.tcvl_tasks to authenticated;
grant insert(owner_id,project_id,conversation_id,title,description) on public.tcvl_tasks to authenticated;
revoke all on public.tcvl_conversations from anon, authenticated;
grant select on public.tcvl_conversations to authenticated;
grant insert(owner_id,project_id,title,goal) on public.tcvl_conversations to authenticated;
revoke all on public.tcvl_projects from anon, authenticated;
grant select on public.tcvl_projects to authenticated;
grant insert(owner_id,name) on public.tcvl_projects to authenticated;
grant update(name,settings,updated_at) on public.tcvl_projects to authenticated;

revoke all on function public.tcvl_request_stop(uuid) from public, anon;
revoke all on function public.tcvl_refuse_task(uuid,text,text,text) from public, anon;
grant execute on function public.tcvl_request_stop(uuid) to authenticated;
grant execute on function public.tcvl_refuse_task(uuid,text,text,text) to authenticated;

-- Do not grant write rights to public tcvl_events. Only narrow audited procedures may append.
