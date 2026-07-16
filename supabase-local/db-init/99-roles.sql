-- Set password untuk role bawaan image supabase/postgres agar service lain
-- (postgrest sebagai 'authenticator', storage-api sebagai 'supabase_storage_admin')
-- bisa login. Password diambil dari env POSTGRES_PASSWORD.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
