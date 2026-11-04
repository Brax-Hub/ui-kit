-- The example's schema (brax-data step 3; brax-security-rbs step 3): one hub = one tenant, memberships keyed by the
-- hub's membership id, items as the business table, jobs and job_runs for the scheduler. Every table enables and
-- forces RLS in this file, grants to authenticated, revokes anon, and carries four per-command policies written on
-- (select auth.uid()) and the app.* helpers that read memberships for the acting member.

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

create type public.app_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.member_status as enum ('active', 'inactive');

-- One row: the hub this module is installed in.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  hub_member_id text not null unique,
  name text not null default '',
  hub_role text not null check (hub_role in ('owner', 'admin', 'member')),
  role public.app_role not null default 'member',
  status public.member_status not null default 'active',
  teams text[] not null default '{}',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memberships_tenant_id_idx on public.memberships (tenant_id);
create index memberships_status_idx on public.memberships (status);
create index memberships_role_idx on public.memberships (role);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  owner_id uuid not null references public.memberships(id),
  title text not null check (length(title) between 1 and 200),
  notes text not null default '',
  visibility text not null default 'team' check (visibility in ('team', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_tenant_id_idx on public.items (tenant_id);
create index items_owner_id_idx on public.items (owner_id);
create index items_visibility_idx on public.items (visibility);

create table public.jobs (
  name text primary key,
  schedule text not null,
  description text not null default '',
  enabled boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null references public.jobs(name) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'ok', 'error')),
  trigger text not null default 'cron' check (trigger in ('cron', 'manual')),
  started_at timestamptz,
  finished_at timestamptz,
  rows integer,
  error text,
  created_at timestamptz not null default now()
);
create index job_runs_job_idx on public.job_runs (job);
create index job_runs_status_idx on public.job_runs (status);
create index job_runs_created_at_idx on public.job_runs (created_at);

-- updated_at
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger memberships_touch before update on public.memberships for each row execute function app.touch_updated_at();
create trigger items_touch before update on public.items for each row execute function app.touch_updated_at();

-- The acting member, from the token the server minted (auth.uid() = memberships.id). Definer functions read
-- memberships without recursing into its own policies; search_path pinned, execute revoked from public and anon.
create or replace function app.member_row() returns public.memberships
language sql stable security definer set search_path = public, pg_temp as $$
  select m from public.memberships m where m.id = (select auth.uid()) and m.status = 'active'
$$;
create or replace function app.role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select m.role::text from public.memberships m where m.id = (select auth.uid()) and m.status = 'active'
$$;
create or replace function app.is_active() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.memberships m where m.id = (select auth.uid()) and m.status = 'active')
$$;
create or replace function app.is_writer() returns boolean
language sql stable as $$ select (select app.role()) in ('owner', 'admin', 'member') $$;
create or replace function app.is_admin() returns boolean
language sql stable as $$ select (select app.role()) in ('owner', 'admin') $$;
create or replace function app.is_owner() returns boolean
language sql stable as $$ select (select app.role()) = 'owner' $$;
revoke execute on function app.member_row(), app.role(), app.is_active(), app.is_writer(), app.is_admin(), app.is_owner() from public, anon;
grant execute on function app.member_row(), app.role(), app.is_active(), app.is_writer(), app.is_admin(), app.is_owner() to authenticated, service_role;

-- What a cron schedule runs: queue a run for the job runner in the process (src/server/jobs).
create or replace function app.enqueue_job(job_name text) returns uuid
language sql security definer set search_path = public, pg_temp as $$
  insert into public.job_runs (job, status, trigger) values (job_name, 'queued', 'cron') returning id
$$;
revoke execute on function app.enqueue_job(text) from public, anon, authenticated;
grant execute on function app.enqueue_job(text) to service_role;

-- RLS: tenants
alter table public.tenants enable row level security;
alter table public.tenants force row level security;
grant select, insert, update, delete on public.tenants to authenticated;
revoke all on public.tenants from anon;
create policy tenants_select on public.tenants for select to authenticated using ((select app.is_active()));
create policy tenants_insert on public.tenants for insert to authenticated with check (false);
create policy tenants_update on public.tenants for update to authenticated using ((select app.is_owner())) with check ((select app.is_owner()));
create policy tenants_delete on public.tenants for delete to authenticated using (false);

-- RLS: memberships. Every active member sees the team (names, roles); owners and admins change app roles and status;
-- rows are created by the identity upsert and the people sync as the service role, never by a member.
alter table public.memberships enable row level security;
alter table public.memberships force row level security;
grant select, insert, update, delete on public.memberships to authenticated;
revoke all on public.memberships from anon;
create policy memberships_select on public.memberships for select to authenticated using ((select app.is_active()));
create policy memberships_insert on public.memberships for insert to authenticated with check (false);
create policy memberships_update on public.memberships for update to authenticated
  using ((select app.is_admin()) and id <> (select auth.uid()))
  with check ((select app.is_admin()) and id <> (select auth.uid()));
create policy memberships_delete on public.memberships for delete to authenticated using (false);

-- RLS: items. A team item is everyone's to read; a private one is its owner's. Writers add their own; an owner edits
-- their own and admins edit all; admins delete, and a writer deletes their own.
alter table public.items enable row level security;
alter table public.items force row level security;
grant select, insert, update, delete on public.items to authenticated;
revoke all on public.items from anon;
create policy items_select on public.items for select to authenticated
  using ((select app.is_active()) and (visibility = 'team' or owner_id = (select auth.uid())));
create policy items_insert on public.items for insert to authenticated
  with check ((select app.is_writer()) and owner_id = (select auth.uid()));
create policy items_update on public.items for update to authenticated
  using ((select app.is_writer()) and (owner_id = (select auth.uid()) or (select app.is_admin())))
  with check ((select app.is_writer()) and (owner_id = (select auth.uid()) or (select app.is_admin())));
create policy items_delete on public.items for delete to authenticated
  using ((select app.is_admin()) or ((select app.is_writer()) and owner_id = (select auth.uid())));

-- RLS: jobs and job_runs are the scheduler's; admins read them on the Settings page, the service role writes them.
alter table public.jobs enable row level security;
alter table public.jobs force row level security;
grant select, insert, update, delete on public.jobs to authenticated;
revoke all on public.jobs from anon;
create policy jobs_select on public.jobs for select to authenticated using ((select app.is_admin()));
create policy jobs_insert on public.jobs for insert to authenticated with check (false);
create policy jobs_update on public.jobs for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy jobs_delete on public.jobs for delete to authenticated using (false);

alter table public.job_runs enable row level security;
alter table public.job_runs force row level security;
grant select, insert, update, delete on public.job_runs to authenticated;
revoke all on public.job_runs from anon;
create policy job_runs_select on public.job_runs for select to authenticated using ((select app.is_admin()));
create policy job_runs_insert on public.job_runs for insert to authenticated with check (false);
create policy job_runs_update on public.job_runs for update to authenticated using (false) with check (false);
create policy job_runs_delete on public.job_runs for delete to authenticated using (false);

-- Storage: tinbase's dev-friendly default lets every authenticated user do everything; replace it with the tenant
-- prefix rule (brax-data 3): a member reads and writes objects under <tenant id>/..., nothing else.
drop policy if exists tinbase_authenticated_all on storage.objects;
create policy objects_select on storage.objects for select to authenticated
  using ((select app.is_active()) and split_part(name, '/', 1) = (select tenant_id::text from app.member_row()));
create policy objects_insert on storage.objects for insert to authenticated
  with check ((select app.is_writer()) and split_part(name, '/', 1) = (select tenant_id::text from app.member_row()));
create policy objects_update on storage.objects for update to authenticated
  using ((select app.is_writer()) and split_part(name, '/', 1) = (select tenant_id::text from app.member_row()))
  with check ((select app.is_writer()) and split_part(name, '/', 1) = (select tenant_id::text from app.member_row()));
create policy objects_delete on storage.objects for delete to authenticated
  using ((select app.is_admin()) and split_part(name, '/', 1) = (select tenant_id::text from app.member_row()));

-- A view a page reads: items with their owner's name, as the caller.
create view public.items_with_owner with (security_invoker = true) as
  select i.id, i.tenant_id, i.owner_id, m.name as owner_name, i.title, i.notes, i.visibility, i.created_at, i.updated_at
  from public.items i join public.memberships m on m.id = i.owner_id;
grant select on public.items_with_owner to authenticated;
revoke all on public.items_with_owner from anon;
