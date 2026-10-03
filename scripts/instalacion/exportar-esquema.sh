#!/usr/bin/env bash
# ============================================================
# Exporta la ESTRUCTURA de una base de la app (sin datos de clientes)
# ============================================================
# Sirve para montar una instalación nueva (demo o cliente) idéntica a la
# original: tablas, funciones, triggers, políticas RLS, permisos, buckets de
# Storage y sus políticas, triggers sobre auth.users y tablas en Realtime.
#
# Uso:
#   1. Copia scripts/instalacion/env.ejemplo a .env.instalacion (raíz del
#      repo; está en .gitignore) y pon ORIGEN_DB_URL.
#   2. bash scripts/instalacion/exportar-esquema.sh
#
# Resultado en scripts/instalacion/salida/ (también ignorado por git):
#   01_esquema.sql      esquema public completo (pg_dump --schema-only)
#   02_storage.sql      buckets + políticas de storage.objects
#   03_auth.sql         triggers sobre auth.users
#   04_realtime.sql     tablas publicadas en supabase_realtime
#   05_cron.sql         tareas de pg_cron (traen URL y secreto del origen:
#                       instalar.sh los reemplaza por los del destino)
#   06_catalogos.sql    festivos y sistemas del almacén (datos genéricos)
#   extensiones.txt     extensiones activas en el origen
#
# Requiere pg_dump/psql 17+. Si no están en el PATH, define PG_BIN con la
# carpeta que los contiene.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
ENV="$RAIZ/.env.instalacion"
[ -f "$ENV" ] || { echo "Falta $ENV (copia scripts/instalacion/env.ejemplo)"; exit 1; }
# shellcheck disable=SC1090
source "$ENV"
: "${ORIGEN_DB_URL:?Falta ORIGEN_DB_URL en .env.instalacion}"

# Por defecto, los binarios locales de scripts/instalacion/.pg17 (si existen).
if [ -z "${PG_BIN:-}" ] && [ -x "$RAIZ/scripts/instalacion/.pg17/pg_dump" ]; then
  PG_BIN="$RAIZ/scripts/instalacion/.pg17"
fi
[ -n "${PG_BIN:-}" ] && export LD_LIBRARY_PATH="$PG_BIN${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
PG_DUMP="${PG_BIN:+$PG_BIN/}pg_dump"
PSQL="${PG_BIN:+$PG_BIN/}psql"
OUT="$RAIZ/scripts/instalacion/salida"
mkdir -p "$OUT"

# search_path vacío: triggers y políticas salen con nombres completos
# (public.funcion()), así funcionan igual en la base nueva.
q() { PGOPTIONS='-c search_path=pg_catalog' "$PSQL" "$ORIGEN_DB_URL" -X -q -A -t -v ON_ERROR_STOP=1 -c "$1"; }

# Probar la conexión primero (con tiempo límite) para no quedarse colgado.
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"
VERSION="$(q 'show server_version')" || { echo "No se pudo conectar a ORIGEN_DB_URL"; exit 1; }
echo "→ Versión del servidor: $VERSION"

echo "→ 01_esquema.sql"
"$PG_DUMP" "$ORIGEN_DB_URL" --schema-only --schema=public --no-owner \
  --no-comments --quote-all-identifiers \
  | grep -v '^\\restrict\|^\\unrestrict' \
  | sed -e '/^CREATE SCHEMA "public";$/d' \
        -e '/^ALTER SCHEMA "public" OWNER/d' \
  > "$OUT/01_esquema.sql"

echo "→ 02_storage.sql"
{
  echo "-- Buckets"
  q "select format(
       'insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L, %s, %s) on conflict (id) do nothing;',
       id, name, public,
       coalesce(file_size_limit::text, 'null'),
       coalesce(quote_literal(allowed_mime_types::text) || '::text[]', 'null'))
     from storage.buckets order by id"
  echo
  echo "-- Políticas de storage.objects"
  q "select format('drop policy if exists %I on storage.objects;%screate policy %I on storage.objects as %s for %s to %s%s%s;',
       policyname, E'\n', policyname, permissive, cmd,
       array_to_string(roles, ', '),
       case when qual is not null then ' using (' || qual || ')' else '' end,
       case when with_check is not null then ' with check (' || with_check || ')' else '' end)
     from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname"
} > "$OUT/02_storage.sql"

echo "→ 03_auth.sql"
q "select format('drop trigger if exists %I on auth.users;%s%s;', t.tgname, E'\n', pg_get_triggerdef(t.oid))
   from pg_trigger t
   where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
   order by t.tgname" > "$OUT/03_auth.sql"

echo "→ 04_realtime.sql"
q "select format('alter publication supabase_realtime add table %I.%I;', schemaname, tablename)
   from pg_publication_tables where pubname = 'supabase_realtime' order by 1" > "$OUT/04_realtime.sql"

echo "→ 05_cron.sql"
if q "select 1 from pg_extension where extname = 'pg_cron'" | grep -q 1; then
  q "select format('select cron.schedule(%L, %L, %L);', jobname, schedule, command)
     from cron.job order by jobname" > "$OUT/05_cron.sql"
else
  echo "-- pg_cron no está activo en el origen" > "$OUT/05_cron.sql"
fi

echo "→ 06_catalogos.sql"
# Catálogos genéricos (sin datos de clientes): festivos y sistemas del almacén.
"$PG_DUMP" "$ORIGEN_DB_URL" --data-only --no-owner --column-inserts --on-conflict-do-nothing \
  --table=public.dias_festivos --table=public.almacen_sistemas \
  | grep -v '^\\restrict\|^\\unrestrict' > "$OUT/06_catalogos.sql"

echo "→ extensiones.txt"
q "select extname || ' ' || extversion || ' (' || n.nspname || ')'
   from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by 1" > "$OUT/extensiones.txt"

echo
echo "Listo: $OUT"
wc -l "$OUT"/*
