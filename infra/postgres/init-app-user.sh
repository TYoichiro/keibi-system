#!/bin/sh
set -eu
umask 077

if [ "$POSTGRES_USER" = "$POSTGRES_APP_USER" ]; then
  echo 'The database administrator and application roles must be different.' >&2
  exit 1
fi

APP_DB_PASSWORD="$(cat /run/secrets/postgres_app_password)"
ADMIN_DB_PASSWORD="$(cat /run/secrets/postgres_admin_password)"
if [ "${#APP_DB_PASSWORD}" -lt 32 ] || [ "${#ADMIN_DB_PASSWORD}" -lt 32 ]; then
  echo 'Database secrets must contain at least 32 characters.' >&2
  exit 1
fi
export APP_DB_PASSWORD ADMIN_DB_PASSWORD

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 --set=db_name="$POSTGRES_DB" \
  --set=admin_user="$POSTGRES_USER" --set=app_user="$POSTGRES_APP_USER" <<'SQL'
\getenv app_password APP_DB_PASSWORD
\getenv admin_password ADMIN_DB_PASSWORD
BEGIN;
SELECT format('CREATE ROLE %I LOGIN', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'app_user', :'app_password') \gexec
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"admin_user" IN SCHEMA public
  REVOKE ALL ON TABLES FROM :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"admin_user" IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM :"app_user";
SELECT format('ALTER ROLE %I PASSWORD %L', :'admin_user', :'admin_password') \gexec
COMMIT;
SQL

unset APP_DB_PASSWORD ADMIN_DB_PASSWORD

# Existing volumes may still trust loopback TCP connections from the original initdb.
# Keep the local Unix socket available for administrator maintenance; require SCRAM for all TCP connections.
hba_file="$(psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -Atc 'SHOW hba_file')"
updated_hba="$(mktemp)"
awk '($1 == "host" || $1 == "hostssl" || $1 == "hostnossl") && $5 == "trust" { $5 = "scram-sha-256" } { print }' "$hba_file" > "$updated_hba"
cat "$updated_hba" > "$hba_file"
rm -f "$updated_hba"
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 -c 'SELECT pg_reload_conf()'
