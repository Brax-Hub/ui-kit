-- Deterministic seed (brax-data step 5): the hub as one tenant, one membership per role with the hub member ids the
-- stub edge sends (kit/dev/dev-member.ts), and a few items so no screen is empty. Applied once, on an empty database.
insert into public.tenants (id, name) values ('00000000-0000-4000-8000-000000000001', 'Local hub');

insert into public.memberships (id, tenant_id, hub_member_id, name, hub_role, role, status, teams) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'dev-owner',  'Olivia Owner',  'owner',  'owner',  'active', '{Leadership}'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'dev-admin',  'Adam Admin',    'admin',  'admin',  'active', '{Leadership,Operations}'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'dev-member', 'Mia Member',    'member', 'member', 'active', '{Operations}'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'dev-viewer', 'Victor Viewer', 'member', 'viewer', 'active', '{}');

insert into public.items (id, tenant_id, owner_id, title, notes, visibility) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Renew the office lease', 'Due end of quarter.', 'team'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Order the new laptops', 'Three for the new starters.', 'team'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'Draft the Q1 newsletter', '', 'team'),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Board pack notes', 'Owner only.', 'private'),
  ('20000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'My reading list', 'Mia only.', 'private');
