-- The example's use of the hub's event feed (src/server/events/register.ts): the last change the hub reported for
-- each calendar event of a member, by the hub's id of the event. An event of the feed holds ids only, so this is a
-- note that something changed, never a copy of the record. The primary key is what makes the handlers safe to run
-- twice: the same event noted again leaves the same row. The service role writes it; a member reads the notes about
-- their own calendar.
create table public.calendar_changes (
  event text primary key,
  member_id uuid not null references public.memberships(id) on delete cascade,
  uid text,
  change text not null check (change in ('created', 'changed', 'deleted')),
  changed_at timestamptz not null,
  noted_at timestamptz not null default now()
);
create index calendar_changes_member_id_idx on public.calendar_changes (member_id);

alter table public.calendar_changes enable row level security;
alter table public.calendar_changes force row level security;
grant select, insert, update, delete on public.calendar_changes to authenticated;
revoke all on public.calendar_changes from anon;
create policy calendar_changes_select on public.calendar_changes for select to authenticated
  using ((select app.is_active()) and member_id = (select auth.uid()));
create policy calendar_changes_insert on public.calendar_changes for insert to authenticated with check (false);
create policy calendar_changes_update on public.calendar_changes for update to authenticated using (false) with check (false);
create policy calendar_changes_delete on public.calendar_changes for delete to authenticated using (false);
