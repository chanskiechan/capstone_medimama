-- Read-only structure check. Does not return patient records or API keys.
-- Run in Supabase SQL Editor, then export the results as CSV.
select 'column' as kind,
       table_name as object_name,
       column_name as item_name,
       jsonb_build_object('type', udt_name, 'nullable', is_nullable,
                          'default', column_default)::text as definition
from information_schema.columns
where table_schema = 'public'
union all
select 'policy', tablename, policyname,
       jsonb_build_object('command', cmd, 'roles', roles,
                          'using', qual, 'check', with_check)::text
from pg_policies
where schemaname = 'public'
union all
select 'constraint', c.relname, con.conname,
       pg_get_constraintdef(con.oid)
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
union all
select 'rls', c.relname, 'row_security',
       jsonb_build_object('enabled', c.relrowsecurity,
                          'forced', c.relforcerowsecurity)::text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by kind, object_name, item_name;
