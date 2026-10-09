-- ============================================================
-- Evidencia en video
-- ============================================================
-- La app graba videos cortos ya comprimidos (720p, 30 s, ~4 MB) como
-- evidencia en servicios, bitácora y reportes. El video se guarda junto a
-- una imagen suya (su «portada»), que va donde siempre ha ido la foto: así
-- todo lo que ya muestra fotos sigue funcionando y solo se agrega el video.
--
-- 1) servicio_eventos y actividad_eventos: ruta del video y su duración.
--    (En los reportes va dentro de data.fotos; no necesita columnas.)
-- 2) uso_almacenamiento(): cuánto pesa todo lo guardado, para avisar a
--    supervisión antes de llenar el plan.
--
-- Ejecutar completo en el SQL Editor de Supabase. Aditivo e idempotente.

-- ---------- 1) Columnas ----------
alter table public.servicio_eventos
  add column if not exists video_path text,
  add column if not exists video_duracion integer;

alter table public.actividad_eventos
  add column if not exists video_path text,
  add column if not exists video_duracion integer;

-- ---------- 2) Uso del almacenamiento ----------
-- Bytes guardados en todos los buckets. Solo para supervisión (o tareas del
-- servidor); a los demás les devuelve null.
create or replace function public.uso_almacenamiento()
returns bigint
language plpgsql
stable
security definer
set search_path = public, storage
as $$
begin
  if auth.uid() is not null and public.get_my_role() <> 'supervisor' then
    return null;
  end if;
  return (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o);
end;
$$;

revoke all on function public.uso_almacenamiento() from public, anon;
grant execute on function public.uso_almacenamiento() to authenticated, service_role;

-- Verificación: debe devolver 4 (columnas) y 1 (función).
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name in ('servicio_eventos', 'actividad_eventos')
      and column_name in ('video_path', 'video_duracion')) as columnas,
  (select count(*) from pg_proc where proname = 'uso_almacenamiento') as funcion;
