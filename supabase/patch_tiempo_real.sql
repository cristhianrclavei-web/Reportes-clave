-- ============================================================
-- Tiempo real: avisos instantáneos a las pantallas del supervisor
-- ============================================================
-- Aditivo e idempotente. Publica en Supabase Realtime las tablas cuyos
-- cambios deben verse al momento (reportes y servicios). Se respetan las
-- políticas de cada tabla: cada quien recibe solo lo que ya puede leer.
--
-- Sin este patch la app igual se actualiza sola, pero preguntando cada
-- 20 segundos en vez de recibir el aviso al instante.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['reports', 'servicios_programados', 'servicio_tecnicos'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Comprobación: deben salir las tres tablas.
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('reports', 'servicios_programados', 'servicio_tecnicos')
order by 1;
