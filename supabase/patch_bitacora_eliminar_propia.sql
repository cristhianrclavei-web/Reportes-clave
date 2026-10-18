-- ============================================================
-- Bitácora: el técnico puede borrar sus propias actividades
-- ============================================================
-- Si se equivocó (la inició en el día o la hora equivocada, o la abrió por
-- error), puede borrarla y volver a registrarla bien. Antes solo podía
-- borrar lo registrado a mano; ahora también lo iniciado en vivo.
--
-- Condiciones: que sea suya, de los últimos 7 días y sin un reporte ligado
-- (si ya se hizo un reporte con ella, sus fotos son evidencia de ese
-- reporte: la borra supervisión). Solo borra su registro; el de sus
-- acompañantes no cambia. Las fotos y videos los borra la app antes (la
-- política de storage solo deja borrarlos mientras la actividad existe).
--
-- Se puede correr varias veces.

create or replace function public.eliminar_mi_actividad(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borradas integer;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa';
  end if;
  if exists (select 1 from public.actividades where id = p_id and created_by = auth.uid() and report_id is not null) then
    raise exception 'Esta actividad ya tiene un reporte ligado; para borrarla pídelo a supervisión';
  end if;
  delete from public.actividades
  where id = p_id
    and created_by = auth.uid()
    and report_id is null
    and hora_inicio > now() - interval '7 days';
  get diagnostics v_borradas = row_count;
  if v_borradas = 0 then
    raise exception 'Solo puedes borrar tus actividades de los últimos 7 días';
  end if;
end;
$$;

revoke all on function public.eliminar_mi_actividad(uuid) from public, anon;
grant execute on function public.eliminar_mi_actividad(uuid) to authenticated;

-- Verificación: debe devolver 1.
select count(*) as funcion from pg_proc where proname = 'eliminar_mi_actividad';
