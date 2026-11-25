-- Where the module keeps its place in the hub's event feed (src/server/hub/events.server.ts; TASKS APM10): one row a
-- feed, `events` today. The kit's client writes it with the service role after the handlers of an answer ran, so a
-- restart resumes from here. It is in the database, not in a file beside it: a restored snapshot brings back the
-- cursor that matches its data. Every app made from the kit carries this table; admins may read it, nobody else
-- touches it.
create table public.hub_cursors (
  feed text primary key,
  cursor text not null,
  updated_at timestamptz not null default now()
);

alter table public.hub_cursors enable row level security;
alter table public.hub_cursors force row level security;
grant select, insert, update, delete on public.hub_cursors to authenticated;
revoke all on public.hub_cursors from anon;
create policy hub_cursors_select on public.hub_cursors for select to authenticated using ((select app.is_admin()));
create policy hub_cursors_insert on public.hub_cursors for insert to authenticated with check (false);
create policy hub_cursors_update on public.hub_cursors for update to authenticated using (false) with check (false);
create policy hub_cursors_delete on public.hub_cursors for delete to authenticated using (false);
