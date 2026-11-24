-- Smoke test: proves the test pipeline runs (pgTAP + `supabase test db`).
-- Real tests (schema checks, RLS, RPCs) start in phase 1.
begin;
select plan(1);

select has_schema('public', 'the public schema exists');

select * from finish();
rollback;
