#!/usr/bin/env bash
# ============================================================
# Instala la estructura de la app en un proyecto Supabase NUEVO
# ============================================================
# Usa lo que generó exportar-esquema.sh (scripts/instalacion/salida/).
#
# En .env.instalacion:
#   DESTINO_DB_URL        base nueva (Connect → Session pooler)
#   DESTINO_APP_URL       dirección de la app en Vercel, p. ej. https://servitec-demo.vercel.app
#   DESTINO_CRON_SECRET   secreto nuevo para los avisos programados (el mismo
#                         que se pone como CRON_SECRET en Vercel). Generar con:
#                         openssl rand -hex 32
#
# Uso: bash scripts/instalacion/instalar.sh
#
# Se niega a correr si el destino ya tiene tablas de la app o si es la misma
# base que el origen.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
ENV="$RAIZ/.env.instalacion"
SAL="$RAIZ/scripts/instalacion/salida"
[ -f "$ENV" ] || { echo "Falta $ENV"; exit 1; }
# shellcheck disable=SC1090
source "$ENV"
: "${DESTINO_DB_URL:?Falta DESTINO_DB_URL}"
: "${DESTINO_APP_URL:?Falta DESTINO_APP_URL}"
: "${DESTINO_CRON_SECRET:?Falta DESTINO_CRON_SECRET}"
for f in 01_esquema.sql 02_storage.sql 03_auth.sql 04_realtime.sql 05_cron.sql 06_catalogos.sql; do
  [ -f "$SAL/$f" ] || { echo "Falta $SAL/$f: corre primero exportar-esquema.sh"; exit 1; }
done

if [ -z "${PG_BIN:-}" ] && [ -x "$RAIZ/scripts/instalacion/.pg17/psql" ]; then
  PG_BIN="$RAIZ/scripts/instalacion/.pg17"
fi
[ -n "${PG_BIN:-}" ] && export LD_LIBRARY_PATH="$PG_BIN${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
PSQL="${PG_BIN:+$PG_BIN/}psql"
export PGCONNECT_TIMEOUT=15

q() { "$PSQL" "$DESTINO_DB_URL" -X -q -A -t -v ON_ERROR_STOP=1 -c "$1"; }
archivo() { "$PSQL" "$DESTINO_DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$1" > /dev/null; }

# ---------- Seguros ----------
if [ -n "${ORIGEN_DB_URL:-}" ] && [ "$ORIGEN_DB_URL" = "$DESTINO_DB_URL" ]; then
  echo "DESTINO_DB_URL es la misma base que ORIGEN_DB_URL. No se instala."; exit 1
fi
q 'select 1' > /dev/null || { echo "No se pudo conectar a DESTINO_DB_URL"; exit 1; }
if [ "$(q "select to_regclass('public.profiles') is not null")" = "t" ]; then
  echo "El destino ya tiene tablas de la app (public.profiles existe). No se instala encima."; exit 1
fi
DESTINO_APP_URL="${DESTINO_APP_URL%/}"

echo "→ Extensiones"
q "create extension if not exists pg_cron; create extension if not exists pg_net with schema extensions;"

echo "→ Esquema (tablas, funciones, políticas)"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
# Los privilegios por defecto de supabase_admin ya vienen en todo proyecto
# nuevo y el usuario postgres no puede cambiarlos.
grep -v '^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"' "$SAL/01_esquema.sql" > "$TMP"
archivo "$TMP"

echo "→ Storage (buckets y políticas)"
archivo "$SAL/02_storage.sql"

echo "→ Trigger de usuarios nuevos"
archivo "$SAL/03_auth.sql"

echo "→ Realtime"
[ -s "$SAL/04_realtime.sql" ] && archivo "$SAL/04_realtime.sql"

echo "→ Catálogos (festivos, sistemas del almacén)"
archivo "$SAL/06_catalogos.sql"

echo "→ Plan de la empresa"
q "insert into public.empresa_plan (id) values (true) on conflict (id) do nothing;"

echo "→ Avisos programados (cron) con la dirección y el secreto del destino"
python3 - "$SAL/05_cron.sql" "$TMP" "$DESTINO_APP_URL" "$DESTINO_CRON_SECRET" <<'PY'
import re, sys
src, dst, url, secreto = sys.argv[1:5]
s = open(src).read()
s = re.sub(r"https://[^/']+(/api/cron/)", url + r"\1", s)
s = re.sub(r"(''x-cron-secret'', '')[^']+('')", r"\g<1>" + secreto + r"\2", s)
open(dst, "w").write(s)
PY
archivo "$TMP"

echo
echo "Verificación:"
q "select 'tablas: ' || count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"
q "select 'funciones: ' || count(*) from pg_proc where pronamespace = 'public'::regnamespace"
q "select 'buckets: ' || count(*) from storage.buckets"
q "select 'cron: ' || string_agg(jobname, ', ' order by jobname) from cron.job"
q "select 'suscripción: ' || (public.estado_suscripcion() ->> 'fase')"
echo
echo "Listo. Siguiente: crear usuarios (crear-usuarios-demo.mjs para el demo)."
