-- The hub as the one tenant (brax-data step 5). It lives in a migration, not in seed.sql: a real install runs with
-- APP_ENV=hub, which skips the seed, and every page and the membership upsert need this row. Reference data the app
-- cannot work without (kinds, categories, default settings) belongs here too; demo rows stay in seed.sql.
insert into public.tenants (id, name) values ('00000000-0000-4000-8000-000000000001', 'This hub')
on conflict (id) do nothing;
